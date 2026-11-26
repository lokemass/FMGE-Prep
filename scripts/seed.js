#!/usr/bin/env node
/**
 * FMGE Prep — Bulk MCQ Seeding Script (10,000+ MCQs via Gemini API -> MongoDB Atlas)
 *
 * Features:
 * - Covers all 19 FMGE subjects (Morning & Afternoon papers) totalling 11,960 MCQs
 * - Generates 10 high-yield MCQs per Gemini API call in strict validated JSON
 * - Mix of clinical-vignette and recall style, current Indian guidelines where relevant
 * - SHA-256 deduplication on normalized question text (unique questionHash index)
 * - Automatic retry with exponential backoff + configurable rate limiting
 * - Full resume capability via the `seed_progress` MongoDB collection
 * - Marks all generated items with source: "ai_generated", verified: false
 *
 * Usage:
 *   node scripts/seed.js
 *   node scripts/seed.js --subject="Medicine" --limit=30
 *   node scripts/seed.js --delay-ms=2000 --dry-run
 */

import 'dotenv/config';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { GoogleGenAI, Type } from '@google/genai';
import { SEED_SUBJECT_CONFIG } from './seed-config.js';

const GEMINI_MODEL = 'gemini-4-hydrogen';
const BATCH_SIZE = 10;
const MAX_RETRIES = 4;

// Parse CLI flags
const args = process.argv.slice(2);
function getFlag(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  return fallback;
}
const hasFlag = (name) => args.includes(`--${name}`);

const filterSubject = getFlag('subject', null);
const maxQuestionsRun = getFlag('limit', null) ? Number(getFlag('limit')) : Infinity;
const delayMs = Number(getFlag('delay-ms', '1500')) || 1500;
const dryRun = hasFlag('dry-run');

function normalizeHash(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Inline Mongoose schemas matching /server/models/index.ts
const QuestionSchema = new mongoose.Schema(
  {
    paper: { type: String, enum: ['morning', 'afternoon'], required: true, index: true },
    subject: { type: String, required: true, index: true },
    topic: { type: String, required: true, index: true },
    question: { type: String, required: true },
    questionHash: { type: String, required: true, unique: true },
    options: [
      {
        key: { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
        text: { type: String, required: true },
        _id: false,
      },
    ],
    correctKey: { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
    explanation: {
      whyCorrect: { type: String, required: true },
      whyOthersWrong: {
        A: { type: String, required: true },
        B: { type: String, required: true },
        C: { type: String, required: true },
        D: { type: String, required: true },
      },
      questionConcept: { type: String, required: true },
      highYieldPoint: { type: String, required: true },
      mnemonic: { type: String, default: '' },
    },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium', index: true },
    source: { type: String, enum: ['pyq', 'ai_generated'], default: 'ai_generated', index: true },
    pyqYear: { type: Number, default: null, index: true },
    verified: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'questions' }
);
QuestionSchema.index({ question: 'text', topic: 'text', tags: 'text' });

const SeedProgressSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true },
    topic: { type: String, required: true },
    generated: { type: Number, default: 0 },
    target: { type: Number, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'seed_progress' }
);
SeedProgressSchema.index({ subject: 1, topic: 1 }, { unique: true });

const Question = mongoose.models.Question || mongoose.model('Question', QuestionSchema);
const SeedProgress = mongoose.models.SeedProgress || mongoose.model('SeedProgress', SeedProgressSchema);

const BATCH_RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      question: { type: Type.STRING },
      options: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            key: { type: Type.STRING },
            text: { type: Type.STRING },
          },
          required: ['key', 'text'],
        },
      },
      correctKey: { type: Type.STRING },
      explanation: {
        type: Type.OBJECT,
        properties: {
          whyCorrect: { type: Type.STRING },
          whyOthersWrong: {
            type: Type.OBJECT,
            properties: {
              A: { type: Type.STRING },
              B: { type: Type.STRING },
              C: { type: Type.STRING },
              D: { type: Type.STRING },
            },
            required: ['A', 'B', 'C', 'D'],
          },
          questionConcept: { type: Type.STRING },
          highYieldPoint: { type: Type.STRING },
          mnemonic: { type: Type.STRING },
        },
        required: ['whyCorrect', 'whyOthersWrong', 'questionConcept', 'highYieldPoint', 'mnemonic'],
      },
      difficulty: { type: Type.STRING },
      tags: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ['question', 'options', 'correctKey', 'explanation', 'difficulty', 'tags'],
  },
};

function validateMcq(item) {
  if (!item || typeof item.question !== 'string' || item.question.trim().length < 20) return false;
  if (!['A', 'B', 'C', 'D'].includes(item.correctKey)) return false;
  if (!Array.isArray(item.options) || item.options.length !== 4) return false;
  const keys = new Set(item.options.map((o) => o?.key));
  if (!['A', 'B', 'C', 'D'].every((k) => keys.has(k))) return false;
  if (item.options.some((o) => typeof o.text !== 'string' || o.text.trim().length === 0)) return false;
  const exp = item.explanation;
  if (!exp || typeof exp.whyCorrect !== 'string' || exp.whyCorrect.trim().length < 15) return false;
  if (!exp.whyOthersWrong || !['A', 'B', 'C', 'D'].every((k) => typeof exp.whyOthersWrong[k] === 'string' && exp.whyOthersWrong[k].trim().length > 0)) {
    return false;
  }
  if (typeof exp.questionConcept !== 'string' || exp.questionConcept.trim().length < 10) return false;
  if (typeof exp.highYieldPoint !== 'string' || exp.highYieldPoint.trim().length < 10) return false;
  return true;
}

async function generateBatch(ai, { subject, paper, topic, count, batchIndex }) {
  const prompt = `Generate exactly ${count} distinct, high-yield FMGE (Foreign Medical Graduate Examination, India) MCQs for:
- Paper: ${paper}
- Subject: ${subject}
- Topic: ${topic}
- Batch variation seed: #${batchIndex} (ensure fresh subtopics and avoid repeating common textbook clones)

Strict clinical & exam rules:
1. Mix ~60% short clinical vignettes and ~40% crisp direct-recall / image-description / management MCQs.
2. Each question must have exactly 4 options labeled A, B, C, D and ONE unambiguous correct answer.
3. Follow current Indian medical guidelines (NTEP, NVBDCP, NACP, UIP, BMW Rules, MCI/NMC/Standard Indian PG & FMGE texts) wherever relevant.
4. Vary difficulty across easy, medium, and hard.
5. Every question must include a complete explanation object:
   - whyCorrect: clear clinical explanation of the right answer.
   - whyOthersWrong: object with keys A, B, C, D explaining each distractor (and confirming the correct key briefly).
   - questionConcept: what core concept/principle this question is testing.
   - highYieldPoint: crisp one-line FMGE exam takeaway.
   - mnemonic: useful memory hook (or empty string "" if none naturally applies).`;

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction:
            'You are an experienced Indian medical exam question author creating accurate, unambiguous FMGE MCQs in strict JSON.',
          responseMimeType: 'application/json',
          responseSchema: BATCH_RESPONSE_SCHEMA,
        },
      });

      const parsed = JSON.parse((response.text ?? '[]').trim());
      if (!Array.isArray(parsed)) throw new Error('Expected JSON array of MCQs');

      const valid = parsed.filter(validateMcq);
      if (valid.length === 0) throw new Error('Zero valid MCQs passed schema validation');
      return valid;
    } catch (err) {
      const wait = Math.min(30000, delayMs * Math.pow(2, attempt));
      console.warn(
        `  [Retry ${attempt}/${MAX_RETRIES}] Batch failed for ${subject} > ${topic}: ${
          err instanceof Error ? err.message : err
        }. Waiting ${wait}ms...`
      );
      if (attempt >= MAX_RETRIES) throw err;
      await sleep(wait);
    }
  }
  return [];
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  const mongoUri = process.env.MONGODB_URI;

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    console.error('Error: GEMINI_API_KEY is required in environment variables.');
    process.exit(1);
  }
  if (!dryRun && !mongoUri) {
    console.error('Error: MONGODB_URI is required unless running with --dry-run.');
    process.exit(1);
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  if (!dryRun) {
    await mongoose.connect(mongoUri, { dbName: 'fmge_prep' });
    await Question.syncIndexes();
    await SeedProgress.syncIndexes();
    console.log('Connected to MongoDB Atlas and verified indexes.');
  } else {
    console.log('Running in --dry-run mode (no MongoDB writes).');
  }

  const subjectsToRun = filterSubject
    ? SEED_SUBJECT_CONFIG.filter((s) => s.subject.toLowerCase() === filterSubject.toLowerCase())
    : SEED_SUBJECT_CONFIG;

  if (subjectsToRun.length === 0) {
    console.error(`No matching subject found for --subject="${filterSubject}".`);
    process.exit(1);
  }

  const grandTarget = subjectsToRun.reduce(
    (sum, s) => sum + Object.values(s.topics).reduce((a, b) => a + b, 0),
    0
  );
  console.log(
    `Starting FMGE MCQ seeder | Subjects: ${subjectsToRun.length} | Combined Target: ${grandTarget.toLocaleString()} MCQs | Run Limit: ${
      Number.isFinite(maxQuestionsRun) ? maxQuestionsRun : 'Unlimited'
    }`
  );

  let insertedThisRun = 0;

  for (const subj of subjectsToRun) {
    for (const [topic, target] of Object.entries(subj.topics)) {
      if (insertedThisRun >= maxQuestionsRun) break;

      let progressDoc = dryRun
        ? { generated: 0, target }
        : await SeedProgress.findOne({ subject: subj.subject, topic });

      if (!progressDoc && !dryRun) {
        progressDoc = await SeedProgress.create({
          subject: subj.subject,
          topic,
          generated: 0,
          target,
        });
      }

      let currentGenerated = progressDoc.generated;
      if (currentGenerated >= target) {
        console.log(`[SKIP] ${subj.subject} > ${topic} (${currentGenerated}/${target} already complete)`);
        continue;
      }

      let batchIndex = Math.floor(currentGenerated / BATCH_SIZE) + 1;

      while (currentGenerated < target && insertedThisRun < maxQuestionsRun) {
        const remainingForTopic = target - currentGenerated;
        const remainingForRun = maxQuestionsRun - insertedThisRun;
        const count = Math.min(BATCH_SIZE, remainingForTopic, remainingForRun);

        console.log(
          `[GEN] ${subj.subject} > ${topic} | batch #${batchIndex} | requesting ${count} MCQs (${currentGenerated}/${target})`
        );

        try {
          const mcqs = await generateBatch(ai, {
            subject: subj.subject,
            paper: subj.paper,
            topic,
            count,
            batchIndex,
          });

          const docs = mcqs.map((m) => ({
            paper: subj.paper,
            subject: subj.subject,
            topic,
            question: m.question.trim(),
            questionHash: normalizeHash(m.question),
            options: ['A', 'B', 'C', 'D'].map((k) => {
              const found = m.options.find((o) => o.key === k);
              return { key: k, text: found.text.trim() };
            }),
            correctKey: m.correctKey,
            explanation: {
              whyCorrect: m.explanation.whyCorrect.trim(),
              whyOthersWrong: {
                A: m.explanation.whyOthersWrong.A.trim(),
                B: m.explanation.whyOthersWrong.B.trim(),
                C: m.explanation.whyOthersWrong.C.trim(),
                D: m.explanation.whyOthersWrong.D.trim(),
              },
              questionConcept: m.explanation.questionConcept.trim(),
              highYieldPoint: m.explanation.highYieldPoint.trim(),
              mnemonic: (m.explanation.mnemonic || '').trim(),
            },
            difficulty: ['easy', 'medium', 'hard'].includes(m.difficulty) ? m.difficulty : 'medium',
            source: 'ai_generated',
            pyqYear: null,
            verified: false,
            tags: Array.isArray(m.tags) ? m.tags.slice(0, 6).map((t) => String(t).trim()) : [],
          }));

          let added = docs.length;
          if (!dryRun) {
            try {
              const res = await Question.insertMany(docs, { ordered: false });
              added = res.length;
            } catch (bulkErr) {
              // MongoDB duplicate key (11000) means some questions were deduplicated by questionHash
              if (bulkErr && typeof bulkErr.insertedDocs !== 'undefined') {
                added = bulkErr.insertedDocs.length;
              } else if (bulkErr && bulkErr.result && typeof bulkErr.result.nInserted === 'number') {
                added = bulkErr.result.nInserted;
              } else {
                added = 0;
              }
            }

            currentGenerated += added;
            insertedThisRun += added;
            await SeedProgress.updateOne(
              { subject: subj.subject, topic },
              { $set: { generated: currentGenerated, target, updatedAt: new Date() } },
              { upsert: true }
            );
          } else {
            currentGenerated += added;
            insertedThisRun += added;
          }

          console.log(
            `  [OK] Inserted ${added}/${docs.length} unique MCQs (deduped ${docs.length - added}). Topic progress: ${currentGenerated}/${target}`
          );
        } catch (err) {
          console.error(
            `  [ERROR] Skipping batch #${batchIndex} for ${subj.subject} > ${topic}:`,
            err instanceof Error ? err.message : err
          );
          break;
        }

        batchIndex++;
        await sleep(delayMs);
      }
    }
  }

  console.log(`\nSeeding run complete. Total newly inserted MCQs this run: ${insertedThisRun}`);
  if (!dryRun) {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal seeding error:', err);
  process.exit(1);
});
