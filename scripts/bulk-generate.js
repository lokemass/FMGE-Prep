#!/usr/bin/env node
/**
 * FMGE Prep — Bulk 10,100-MCQ Generator (Gemini API -> MongoDB Atlas)
 *
 * Reads MONGODB_URI and GEMINI_API_KEY from environment variables.
 *
 * Usage:
 *   node scripts/bulk-generate.js --subject=Anatomy --dry-run
 *   node scripts/bulk-generate.js --subject=Anatomy --limit=200
 *   node scripts/bulk-generate.js --concurrency=3 --delay-ms=1000
 */

import 'dotenv/config';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { GoogleGenAI, Type } from '@google/genai';
import { FMGE_TOPICS, SUBJECT_QUOTA_TOTAL, resolveCliSubject } from './topics.js';

const MODEL = 'gemini-4-hydrogen';
const BATCH_SIZE = 10;
const MAX_RETRIES = 4;
const RECENT_STEMS_CONTEXT = 15;
const PYQ_YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

// Parse CLI flags
const args = process.argv.slice(2);
function getFlag(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}
const hasFlag = (name) => args.includes(`--${name}`);

const subjectFlag = getFlag('subject', null);
const limitFlag = getFlag('limit', null);
const maxForRun = limitFlag ? Math.max(1, Number.parseInt(limitFlag, 10)) : Infinity;
const concurrency = Math.max(1, Math.min(8, Number.parseInt(getFlag('concurrency', '3'), 10) || 3));
const delayMs = Math.max(100, Number.parseInt(getFlag('delay-ms', '1000'), 10) || 1000);
const dryRun = hasFlag('dry-run');
const pyqOnly = hasFlag('pyq-only');
const aiOnly = hasFlag('ai-only');

// Helpers
function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hashQuestion(text) {
  return crypto.createHash('sha256').update(normalizeText(text)).digest('hex');
}

function prefix80(text) {
  return normalizeText(text).slice(0, 80);
}

/** Dice/bigram similarity on first 80 normalized chars to catch near-identical openings */
function prefixSimilarity(a, b) {
  const s1 = prefix80(a);
  const s2 = prefix80(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  const bigrams = new Map();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
  }
  let matches = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.slice(i, i + 2);
    const count = bigrams.get(bg) || 0;
    if (count > 0) {
      bigrams.set(bg, count - 1);
      matches++;
    }
  }
  return (2 * matches) / (s1.length - 1 + (s2.length - 1));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Programmatically randomizes option order (A–D) to eliminate LLM bias toward B/C,
 * safely remapping correctKey and whyOthersWrong unless option text explicitly references
 * another option letter or positional phrase ("above", "below", "both A").
 */
function randomizeOptionKeys(mcq) {
  const positionalPattern = /\b(all of the above|none of the above|both [a-d]|options? [a-d]|above|below)\b/i;
  if (mcq.options.some((o) => positionalPattern.test(o.text))) {
    return mcq;
  }

  const keys = ['A', 'B', 'C', 'D'];
  const perm = [...keys];
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }

  // Map oldKey -> newKey
  const oldToNew = {};
  const newToOld = {};
  for (let i = 0; i < 4; i++) {
    oldToNew[keys[i]] = perm[i];
    newToOld[perm[i]] = keys[i];
  }

  const oldOptMap = new Map(mcq.options.map((o) => [o.key, o.text]));
  const newOptions = keys.map((newK) => ({
    key: newK,
    text: oldOptMap.get(newToOld[newK]),
  }));

  const newWhyOthersWrong = {
    A: mcq.explanation.whyOthersWrong[newToOld.A],
    B: mcq.explanation.whyOthersWrong[newToOld.B],
    C: mcq.explanation.whyOthersWrong[newToOld.C],
    D: mcq.explanation.whyOthersWrong[newToOld.D],
  };

  return {
    ...mcq,
    options: newOptions,
    correctKey: oldToNew[mcq.correctKey],
    explanation: {
      ...mcq.explanation,
      whyOthersWrong: newWhyOthersWrong,
    },
  };
}

// Mongoose schemas reusing the exact existing "questions" and "seed_progress" field names
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
    flagged: { type: Boolean, default: false, index: true },
    flagReason: { type: String, default: '' },
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
      pyqYear: { type: Type.INTEGER },
      tags: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ['question', 'options', 'correctKey', 'explanation', 'difficulty', 'tags'],
  },
};

function validateQuestion(raw) {
  if (!raw || typeof raw.question !== 'string') return false;
  const qText = raw.question.trim();
  if (qText.length < 25) return false;

  const key = String(raw.correctKey || '').trim().toUpperCase();
  if (!['A', 'B', 'C', 'D'].includes(key)) return false;

  if (!Array.isArray(raw.options) || raw.options.length !== 4) return false;
  const seenKeys = new Set();
  const seenTexts = new Set();
  for (const opt of raw.options) {
    if (!opt || typeof opt.text !== 'string') return false;
    const k = String(opt.key || '').trim().toUpperCase();
    const t = opt.text.trim();
    if (!['A', 'B', 'C', 'D'].includes(k) || t.length === 0) return false;
    const normOpt = normalizeText(t);
    if (seenKeys.has(k) || seenTexts.has(normOpt)) return false;
    seenKeys.add(k);
    seenTexts.add(normOpt);
  }
  if (seenKeys.size !== 4) return false;

  // Reject unnecessary "all/none of the above" clutter
  const bannedAbove = /^(all|none) of the above\.?$/i;
  if (raw.options.some((o) => bannedAbove.test(o.text.trim()))) return false;

  const exp = raw.explanation;
  if (!exp || typeof exp !== 'object') return false;
  if (typeof exp.whyCorrect !== 'string' || exp.whyCorrect.trim().length < 20) return false;
  if (typeof exp.questionConcept !== 'string' || exp.questionConcept.trim().length < 15) return false;
  if (typeof exp.highYieldPoint !== 'string' || exp.highYieldPoint.trim().length < 10) return false;
  if (!exp.whyOthersWrong || typeof exp.whyOthersWrong !== 'object') return false;
  for (const k of ['A', 'B', 'C', 'D']) {
    if (typeof exp.whyOthersWrong[k] !== 'string' || exp.whyOthersWrong[k].trim().length < 5) {
      return false;
    }
  }
  return true;
}

const SUBCONCEPT_ANGLES = [
  'pathophysiology, diagnostic signs, and gold-standard investigations',
  'first-line management, drug of choice, and current Indian guidelines (NMC/NTEP/NVBDCP/UIP)',
  'clinical complications, contraindications, and emergency bedside recognition',
  'classic named signs, scoring criteria, imaging descriptions, and laboratory findings',
  'anatomical/biochemical mechanisms, differential diagnosis, and preventive medicine',
];

async function generateBatch(
  ai,
  model,
  { paper, subject, topic, count, recentStems, callNumber, isPyqBatch = false, targetYear = 2024 }
) {
  const angle = SUBCONCEPT_ANGLES[(callNumber - 1) % SUBCONCEPT_ANGLES.length];
  const doNotRepeatBlock =
    recentStems.length > 0
      ? `\nDO NOT REPEAT OR PARAPHRASE ANY OF THESE RECENT QUESTIONS FOR THIS TOPIC:\n${recentStems
          .slice(-RECENT_STEMS_CONTEXT)
          .map((s, idx) => `${idx + 1}. ${s.slice(0, 140)}`)
          .join('\n')}\n`
      : '';

  const modeDirective = isPyqBatch
    ? `- Mode: FMGE Previous Year Question (PYQ) recall batch — author ${count} high-yield MCQs reflecting real concepts and stems repeatedly tested in NBE FMGE exams (${targetYear} / 2018–2025). Set pyqYear to an integer year between 2018 and 2025.`
    : `- Sub-concept focus for this batch (#${callNumber}): ${angle}. Set pyqYear to 0.`;

  const prompt = `Generate ${count} medically verified FMGE (Foreign Medical Graduate Examination, India) MCQs.

TARGET METADATA:
- Paper: ${paper}
- Subject: ${subject}
- Topic: ${topic}
${modeDirective}
${doNotRepeatBlock}
STRICT GENERATION RULES:
1. Question style mix across the batch: ~60% short clinical vignettes (age, sex, presentation, labs/exam), ~30% high-yield recall/one-liners, ~10% image-description or investigation-based (ECG/X-ray/CT/histopathology/audiometry description).
2. Difficulty mix across the batch: ~30% "easy", ~50% "medium", ~20% "hard".
3. Exactly 4 distinct options labeled A, B, C, D with ONE unambiguous correct answer. Do NOT use "All of the above" or "None of the above". Spread correctKey evenly across A, B, C, and D (avoid bias toward B/C).
4. Follow standard MBBS textbooks (Robbins, Harrison, Bailey & Love, Dutta, Park, KD Tripathi, BDC, Ganong, Harper, Apurba Sastry, etc.) and current Indian guidelines (NMC, NTEP, NVBDCP, NACO, National Immunization Schedule, BMW rules). If unsure about a specific fact or numerical cutoff, skip it rather than inventing.
5. Every explanation object MUST contain:
   - whyCorrect: clear clinical rationale for the correct option.
   - whyOthersWrong: { A, B, C, D } — crisp one-line explanation for each option.
   - questionConcept: what this question is testing + the underlying core medical concept.
   - highYieldPoint: concise one-line FMGE exam takeaway.
   - mnemonic: helpful memory hook (or "" if none naturally applies).
6. Return strict JSON array only matching the schema.`;

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction:
            'You are a senior Indian MBBS/FMGE medical exam author. Output strictly valid JSON matching the requested schema. Prioritize textbook accuracy and current Indian guidelines.',
          responseMimeType: 'application/json',
          responseSchema: BATCH_RESPONSE_SCHEMA,
        },
      });

      const parsed = JSON.parse((response.text ?? '[]').trim());
      if (!Array.isArray(parsed)) throw new Error('Model did not return a JSON array');
      return parsed;
    } catch (err) {
      const backoff = Math.min(45000, delayMs * Math.pow(2, attempt));
      console.warn(
        `  [Retry ${attempt}/${MAX_RETRIES}] ${subject} > ${topic} failed: ${
          err instanceof Error ? err.message : err
        }. Backoff ${backoff}ms...`
      );
      if (attempt >= MAX_RETRIES) throw err;
      await sleep(backoff);
    }
  }
  return [];
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  const mongoUri = process.env.MONGODB_URI;
  const model = MODEL;

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    console.error('Error: GEMINI_API_KEY must be set in environment variables.');
    process.exit(1);
  }
  if (!dryRun && !mongoUri) {
    console.error('Error: MONGODB_URI must be set unless running with --dry-run.');
    process.exit(1);
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  // Resolve optional --subject filter
  let subjectsToProcess = FMGE_TOPICS;
  if (subjectFlag) {
    const canonical = resolveCliSubject(subjectFlag);
    if (!canonical) {
      console.error(`Error: Unknown subject "${subjectFlag}".`);
      process.exit(1);
    }
    subjectsToProcess = FMGE_TOPICS.filter((s) => s.subject === canonical);
  }

  // Dry-run: generate and print 3 validated sample questions without saving to MongoDB
  if (dryRun) {
    const firstSubj = subjectsToProcess[0];
    const firstTopic = firstSubj.topics[0];
    console.log(
      `[DRY RUN] Model: ${model} | Generating 3 sample questions for ${firstSubj.subject} > ${firstTopic.topic} (no DB writes)...\n`
    );
    const rawBatch = await generateBatch(ai, model, {
      paper: firstSubj.paper,
      subject: firstSubj.subject,
      topic: firstTopic.topic,
      count: 5,
      recentStems: [],
      callNumber: 1,
    });
    const samples = rawBatch
      .filter(validateQuestion)
      .slice(0, 3)
      .map((item) => {
        const randomized = randomizeOptionKeys({
          paper: firstSubj.paper,
          subject: firstSubj.subject,
          topic: firstTopic.topic,
          question: item.question.trim(),
          options: ['A', 'B', 'C', 'D'].map((k) => ({
            key: k,
            text: item.options.find((o) => o.key.toUpperCase() === k).text.trim(),
          })),
          correctKey: item.correctKey.toUpperCase(),
          explanation: {
            whyCorrect: item.explanation.whyCorrect.trim(),
            whyOthersWrong: {
              A: item.explanation.whyOthersWrong.A.trim(),
              B: item.explanation.whyOthersWrong.B.trim(),
              C: item.explanation.whyOthersWrong.C.trim(),
              D: item.explanation.whyOthersWrong.D.trim(),
            },
            questionConcept: item.explanation.questionConcept.trim(),
            highYieldPoint: item.explanation.highYieldPoint.trim(),
            mnemonic: (item.explanation.mnemonic || '').trim(),
          },
          difficulty: ['easy', 'medium', 'hard'].includes(item.difficulty) ? item.difficulty : 'medium',
          source: 'ai_generated',
          pyqYear: null,
          verified: false,
          tags: Array.isArray(item.tags) ? item.tags.slice(0, 6) : [],
        });
        return randomized;
      });

    console.log(JSON.stringify(samples, null, 2));
    console.log(`\n[DRY RUN] Printed ${samples.length} validated sample questions. No database writes performed.`);
    return;
  }

  // Connect to MongoDB Atlas (explicit fmge_prep database)
  await mongoose.connect(mongoUri, { dbName: 'fmge_prep' });
  await Question.syncIndexes();
  await SeedProgress.syncIndexes();

  // Build initial global count + existing hashes for fast in-process dedupe
  let globalTotalInDb = await Question.countDocuments();
  const existingDocs = await Question.find(
    {},
    { questionHash: 1, question: 1, subject: 1, topic: 1, source: 1 }
  ).lean();
  const seenHashes = new Set(existingDocs.map((d) => d.questionHash));
  const topicStemsMap = new Map();
  const topicPyqCountMap = new Map();
  for (const d of existingDocs) {
    const tKey = `${d.subject}:::${d.topic}`;
    const list = topicStemsMap.get(tKey) || [];
    list.push(d.question);
    topicStemsMap.set(tKey, list);
    if (d.source === 'pyq') {
      topicPyqCountMap.set(tKey, (topicPyqCountMap.get(tKey) || 0) + 1);
    }
  }

  // Build work queue of topics across selected subjects (~20% reserved for FMGE PYQs 2018-2025 unless --ai-only)
  const tasks = [];
  for (const subj of subjectsToProcess) {
    for (const t of subj.topics) {
      const pyqTarget = aiOnly ? 0 : Math.max(4, Math.round(t.target * 0.2));
      tasks.push({
        paper: subj.paper,
        subject: subj.subject,
        topic: t.topic,
        target: pyqOnly ? pyqTarget : t.target,
        pyqTarget,
      });
    }
  }

  console.log(
    `[FMGE Bulk Generator] DB: fmge_prep | Model: ${model} | Mode: ${
      pyqOnly ? 'PYQs Only' : aiOnly ? 'AI Only' : 'PYQs (20%) + AI (80%)'
    } | Concurrency: ${concurrency} | Delay: ${delayMs}ms | Topics queued: ${tasks.length} | DB start count: ${globalTotalInDb.toLocaleString()}/${SUBJECT_QUOTA_TOTAL.toLocaleString()} | Run limit: ${
      Number.isFinite(maxForRun) ? maxForRun : 'Unlimited'
    }`
  );

  let insertedThisRun = 0;
  let taskCursor = 0;

  async function processTopic(task) {
    const tKey = `${task.subject}:::${task.topic}`;
    const recentStems = topicStemsMap.get(tKey) || [];
    let currentPyqCount = topicPyqCountMap.get(tKey) || 0;

    // Sync resume state from seed_progress AND actual DB count
    const actualInDb = pyqOnly ? currentPyqCount : recentStems.length;
    let progressDoc = await SeedProgress.findOne({ subject: task.subject, topic: task.topic });
    let generatedCount = pyqOnly ? currentPyqCount : Math.max(actualInDb, progressDoc?.generated ?? 0);

    if (!progressDoc && !pyqOnly) {
      await SeedProgress.updateOne(
        { subject: task.subject, topic: task.topic },
        { $set: { generated: generatedCount, target: task.target, updatedAt: new Date() } },
        { upsert: true }
      );
    }

    if (generatedCount >= task.target) {
      return;
    }

    let callNumber = Math.floor(generatedCount / BATCH_SIZE) + 1;
    let consecutiveZeroInserts = 0;

    while (generatedCount < task.target && insertedThisRun < maxForRun) {
      const remainingTopic = task.target - generatedCount;
      const remainingRun = maxForRun - insertedThisRun;
      const requestedCount = Math.min(BATCH_SIZE, remainingTopic, remainingRun);
      if (requestedCount <= 0) break;

      const isPyqBatch = pyqOnly || (!aiOnly && currentPyqCount < task.pyqTarget);
      const targetYear = PYQ_YEARS[(callNumber + currentPyqCount) % PYQ_YEARS.length];

      let rawBatch = [];
      try {
        rawBatch = await generateBatch(ai, model, {
          paper: task.paper,
          subject: task.subject,
          topic: task.topic,
          count: Math.max(requestedCount, Math.min(BATCH_SIZE, remainingTopic)),
          recentStems,
          callNumber,
          isPyqBatch,
          targetYear,
        });
      } catch (err) {
        console.error(
          `[ERROR] Exhausted retries for ${task.subject} > ${task.topic}: ${
            err instanceof Error ? err.message : err
          }`
        );
        break;
      }

      const validDocs = [];
      for (const raw of rawBatch) {
        if (validDocs.length >= remainingTopic || insertedThisRun + validDocs.length >= maxForRun) {
          break;
        }
        if (!validateQuestion(raw)) continue;

        const cleanStem = raw.question.trim();
        const qHash = hashQuestion(cleanStem);

        // 1. Exact normalized hash dedupe
        if (seenHashes.has(qHash)) continue;

        // 2. First-80-character similarity check against existing stems for this topic
        const tooSimilar = recentStems.some((existing) => prefixSimilarity(existing, cleanStem) >= 0.82);
        if (tooSimilar) continue;

        const parsedYear = Number(raw.pyqYear);
        const assignedYear = isPyqBatch
          ? parsedYear >= 2015 && parsedYear <= 2025
            ? parsedYear
            : targetYear
          : null;

        const normalizedItem = randomizeOptionKeys({
          paper: task.paper,
          subject: task.subject,
          topic: task.topic,
          question: cleanStem,
          questionHash: qHash,
          options: ['A', 'B', 'C', 'D'].map((k) => ({
            key: k,
            text: raw.options.find((o) => o.key.toUpperCase() === k).text.trim(),
          })),
          correctKey: raw.correctKey.toUpperCase(),
          explanation: {
            whyCorrect: raw.explanation.whyCorrect.trim(),
            whyOthersWrong: {
              A: raw.explanation.whyOthersWrong.A.trim(),
              B: raw.explanation.whyOthersWrong.B.trim(),
              C: raw.explanation.whyOthersWrong.C.trim(),
              D: raw.explanation.whyOthersWrong.D.trim(),
            },
            questionConcept: raw.explanation.questionConcept.trim(),
            highYieldPoint: raw.explanation.highYieldPoint.trim(),
            mnemonic: (raw.explanation.mnemonic || '').trim(),
          },
          difficulty: ['easy', 'medium', 'hard'].includes(raw.difficulty) ? raw.difficulty : 'medium',
          source: isPyqBatch ? 'pyq' : 'ai_generated',
          pyqYear: assignedYear,
          verified: false,
          flagged: false,
          flagReason: '',
          tags: Array.isArray(raw.tags)
            ? raw.tags.slice(0, 6).map((tg) => String(tg).trim()).filter(Boolean)
            : [],
        });

        seenHashes.add(qHash);
        recentStems.push(cleanStem);
        validDocs.push(normalizedItem);
      }

      let insertedNow = 0;
      if (validDocs.length > 0) {
        try {
          const inserted = await Question.insertMany(validDocs, { ordered: false });
          insertedNow = inserted.length;
        } catch (bulkErr) {
          if (bulkErr && Array.isArray(bulkErr.insertedDocs)) {
            insertedNow = bulkErr.insertedDocs.length;
          } else if (bulkErr && bulkErr.result && typeof bulkErr.result.nInserted === 'number') {
            insertedNow = bulkErr.result.nInserted;
          }
        }
      }

      if (insertedNow === 0) {
        consecutiveZeroInserts++;
        if (consecutiveZeroInserts >= 3) {
          console.warn(
            `[WARN] 3 consecutive empty/duplicate batches for ${task.subject} > ${task.topic} — moving to next topic.`
          );
          break;
        }
      } else {
        consecutiveZeroInserts = 0;
        generatedCount += insertedNow;
        insertedThisRun += insertedNow;
        globalTotalInDb += insertedNow;
        if (isPyqBatch) currentPyqCount += insertedNow;

        if (!pyqOnly) {
          await SeedProgress.updateOne(
            { subject: task.subject, topic: task.topic },
            { $set: { generated: generatedCount, target: task.target, updatedAt: new Date() } },
            { upsert: true }
          );
        }

        console.log(
          `${task.subject} > ${task.topic} [${isPyqBatch ? 'PYQ' : 'AI'}]: ${generatedCount}/${task.target} | total ${globalTotalInDb.toLocaleString()}/${SUBJECT_QUOTA_TOTAL.toLocaleString()}`
        );
      }

      callNumber++;
      await sleep(delayMs);
    }

    topicStemsMap.set(tKey, recentStems);
    topicPyqCountMap.set(tKey, currentPyqCount);
  }

  // Worker pool with configurable concurrency (default 3)
  async function worker() {
    while (true) {
      if (insertedThisRun >= maxForRun) return;
      const idx = taskCursor++;
      if (idx >= tasks.length) return;
      await processTopic(tasks[idx]);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  console.log(
    `\nBulk generation finished. Newly inserted this run: ${insertedThisRun.toLocaleString()} | Total in Atlas: ${globalTotalInDb.toLocaleString()}/${SUBJECT_QUOTA_TOTAL.toLocaleString()}`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal bulk-generate error:', err);
  process.exit(1);
});
