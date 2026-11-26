#!/usr/bin/env node
/**
 * FMGE Prep — Second-Pass Quality Verification Script
 *
 * For each unverified, unflagged question in MongoDB Atlas, asks Gemini to independently
 * answer the MCQ WITHOUT seeing the stored correctKey or explanation.
 * - If Gemini's independent answer differs from stored correctKey:
 *     sets flagged: true and flagReason with the model's rationale.
 * - If Gemini agrees:
 *     records verifyCheckedAt so subsequent runs resume smoothly (keeping verified: false
 *     on AI-generated items until human review, or approving cleanly via /admin/flagged).
 *
 * Usage:
 *   node scripts/verify-pass.js
 *   node scripts/verify-pass.js --subject=Anatomy --limit=50 --concurrency=3
 *   node scripts/verify-pass.js --dry-run --limit=5
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { GoogleGenAI, Type } from '@google/genai';
import { resolveCliSubject } from './topics.js';

const MODEL = 'gemini-4-hydrogen';
const MAX_RETRIES = 4;

const args = process.argv.slice(2);
function getFlag(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}
const hasFlag = (name) => args.includes(`--${name}`);

const subjectFlag = getFlag('subject', null);
const limitFlag = getFlag('limit', null);
const limit = limitFlag ? Math.max(1, Number.parseInt(limitFlag, 10)) : 0;
const concurrency = Math.max(1, Math.min(8, Number.parseInt(getFlag('concurrency', '3'), 10) || 3));
const delayMs = Math.max(100, Number.parseInt(getFlag('delay-ms', '800'), 10) || 800);
const dryRun = hasFlag('dry-run');
const recheckAll = hasFlag('recheck');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const QuestionSchema = new mongoose.Schema(
  {
    paper: String,
    subject: String,
    topic: String,
    question: String,
    options: [{ key: String, text: String, _id: false }],
    correctKey: String,
    verified: { type: Boolean, default: false },
    flagged: { type: Boolean, default: false, index: true },
    flagReason: { type: String, default: '' },
    verifyCheckedAt: { type: Date, default: null },
  },
  { collection: 'questions', strict: false }
);

const Question = mongoose.models.Question || mongoose.model('Question', QuestionSchema);

const VERIFY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    chosenKey: { type: Type.STRING },
    reasoning: { type: Type.STRING },
    ambiguousOrOutdated: { type: Type.BOOLEAN },
  },
  required: ['chosenKey', 'reasoning', 'ambiguousOrOutdated'],
};

async function independentlyAnswer(ai, model, q) {
  const optionsText = q.options.map((o) => `${o.key}. ${o.text}`).join('\n');
  const prompt = `Independently solve this Indian FMGE medical exam MCQ using standard medical textbooks and current Indian clinical guidelines (NMC, NTEP, NVBDCP, UIP).

Subject: ${q.subject}
Question:
${q.question}

Options:
${optionsText}

Return strict JSON with:
- chosenKey: "A", "B", "C", or "D" (the single best answer)
- reasoning: 1-2 concise sentences explaining why
- ambiguousOrOutdated: true only if the question stem is clearly flawed, has multiple valid answers, or contradicts current guidelines; otherwise false.`;

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction:
            'You are an independent medical exam quality reviewer. Solve each MCQ purely from medical knowledge without guessing.',
          responseMimeType: 'application/json',
          responseSchema: VERIFY_SCHEMA,
        },
      });
      const parsed = JSON.parse((response.text ?? '{}').trim());
      const chosenKey = String(parsed.chosenKey || '').trim().toUpperCase();
      if (!['A', 'B', 'C', 'D'].includes(chosenKey)) {
        throw new Error(`Invalid chosenKey "${parsed.chosenKey}"`);
      }
      return {
        chosenKey,
        reasoning: String(parsed.reasoning || '').trim(),
        ambiguousOrOutdated: Boolean(parsed.ambiguousOrOutdated),
      };
    } catch (err) {
      const backoff = Math.min(30000, delayMs * Math.pow(2, attempt));
      if (attempt >= MAX_RETRIES) throw err;
      await sleep(backoff);
    }
  }
  throw new Error('Verification call failed');
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  const mongoUri = process.env.MONGODB_URI;
  const model = MODEL;

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    console.error('Error: GEMINI_API_KEY must be set in environment variables.');
    process.exit(1);
  }
  if (!mongoUri) {
    console.error('Error: MONGODB_URI must be set in environment variables.');
    process.exit(1);
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  await mongoose.connect(mongoUri, { dbName: 'fmge_prep' });

  const query = {
    verified: false,
    flagged: { $ne: true },
  };
  if (!recheckAll) {
    query.$or = [{ verifyCheckedAt: { $exists: false } }, { verifyCheckedAt: null }];
  }
  if (subjectFlag) {
    const canonical = resolveCliSubject(subjectFlag);
    if (!canonical) {
      console.error(`Error: Unknown subject "${subjectFlag}".`);
      process.exit(1);
    }
    query.subject = canonical;
  }

  let cursorQuery = Question.find(query)
    .select('subject topic question options correctKey')
    .sort({ createdAt: 1 });
  if (limit > 0) cursorQuery = cursorQuery.limit(limit);

  const docs = await cursorQuery.lean();
  console.log(
    `[FMGE Verify Pass] Model: ${model} | Unverified queue: ${docs.length} | Concurrency: ${concurrency}${
      dryRun ? ' | DRY RUN' : ''
    }`
  );

  if (docs.length === 0) {
    console.log('Nothing to verify — all unverified questions have already been checked.');
    await mongoose.disconnect();
    return;
  }

  let index = 0;
  let checked = 0;
  let matched = 0;
  let flaggedCount = 0;
  let errors = 0;

  async function worker() {
    while (true) {
      const i = index++;
      if (i >= docs.length) return;
      const q = docs[i];

      try {
        const verdict = await independentlyAnswer(ai, model, q);
        checked++;
        const disagrees = verdict.chosenKey !== q.correctKey;
        const shouldFlag = disagrees || verdict.ambiguousOrOutdated;

        if (shouldFlag) {
          flaggedCount++;
          const reason = disagrees
            ? `Second-pass model selected ${verdict.chosenKey} (stored key: ${q.correctKey}). ${verdict.reasoning}`
            : `Second-pass reviewer flagged ambiguity/guideline concern: ${verdict.reasoning}`;

          if (!dryRun) {
            await Question.updateOne(
              { _id: q._id },
              {
                $set: {
                  flagged: true,
                  flagReason: reason.slice(0, 600),
                  verifyCheckedAt: new Date(),
                },
              }
            );
          }
          console.log(
            `[FLAGGED] ${q.subject} > ${q.topic} (${checked}/${docs.length}) | stored=${q.correctKey} vs model=${verdict.chosenKey}`
          );
        } else {
          matched++;
          if (!dryRun) {
            await Question.updateOne(
              { _id: q._id },
              {
                $set: {
                  flagged: false,
                  verifyCheckedAt: new Date(),
                },
              }
            );
          }
          if (checked % 10 === 0 || checked === docs.length) {
            console.log(
              `[PROGRESS] Checked ${checked}/${docs.length} | Agreed: ${matched} | Flagged: ${flaggedCount}`
            );
          }
        }
      } catch (err) {
        errors++;
        console.error(
          `[ERROR] Question ${q._id} failed verification: ${err instanceof Error ? err.message : err}`
        );
      }

      await sleep(delayMs);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(
    `\nVerify pass complete. Checked: ${checked} | Agreed: ${matched} | Flagged: ${flaggedCount} | Errors: ${errors}`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal verify-pass error:', err);
  process.exit(1);
});
