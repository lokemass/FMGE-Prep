#!/usr/bin/env node
/**
 * FMGE Prep — Previous Year Question (PYQ) Importer (CSV or JSON -> MongoDB Atlas)
 *
 * Expected columns / fields:
 *   year, subject, question, A, B, C, D, correct, explanation (optional), topic (optional), difficulty (optional)
 *
 * Features:
 * - Parses .csv or .json files
 * - Resolves subject aliases to the exact 19 FMGE subjects and auto-assigns Morning/Afternoon paper
 * - Sets source: "pyq", pyqYear: Number(year)
 * - Uses Gemini API to automatically generate full structured explanations for any rows
 *   with missing or plain-text explanations
 * - Deduplicates via SHA-256 normalized questionHash
 *
 * Usage:
 *   node scripts/import-pyq.js --file=scripts/sample-pyqs.csv
 *   node scripts/import-pyq.js --file=path/to/my-pyqs.json --delay-ms=1000
 */

import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { parse as parseCsv } from 'csv-parse/sync';
import { GoogleGenAI, Type } from '@google/genai';
import { resolveSubjectAndPaper } from './seed-config.js';

const GEMINI_MODEL = 'gemini-4-hydrogen';

const args = process.argv.slice(2);
function getFlag(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const filePathArg = getFlag('file', null);
const delayMs = Number(getFlag('delay-ms', '800')) || 800;
const dryRun = args.includes('--dry-run');

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
    source: { type: String, enum: ['pyq', 'ai_generated'], default: 'pyq', index: true },
    pyqYear: { type: Number, default: null, index: true },
    verified: { type: Boolean, default: true },
    tags: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'questions' }
);
QuestionSchema.index({ question: 'text', topic: 'text', tags: 'text' });

const Question = mongoose.models.Question || mongoose.model('Question', QuestionSchema);

const EXPLANATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    topic: { type: Type.STRING },
    difficulty: { type: Type.STRING },
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
    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    'topic',
    'difficulty',
    'whyCorrect',
    'whyOthersWrong',
    'questionConcept',
    'highYieldPoint',
    'mnemonic',
    'tags',
  ],
};

async function enrichExplanationWithGemini(ai, row, subject, existingNote) {
  const prompt = `You are a medical educator writing a detailed FMGE explanation for a Previous Year Question (PYQ).
Subject: ${subject}
Question: ${row.question}
A. ${row.A}
B. ${row.B}
C. ${row.C}
D. ${row.D}
Authoritative Correct Key: ${row.correct}
${existingNote ? `Existing brief note to expand and structure: ${existingNote}` : ''}

Return a strict JSON object with:
- topic: concise FMGE syllabus topic within ${subject}
- difficulty: "easy", "medium", or "hard"
- whyCorrect: clear clinical explanation of why option ${row.correct} is correct
- whyOthersWrong: { A, B, C, D } explaining why each distractor is wrong (and briefly confirming ${row.correct})
- questionConcept: core concept this question is testing
- highYieldPoint: one-line exam takeaway
- mnemonic: short helpful mnemonic (or "" if none)
- tags: 3-5 lowercase clinical keywords`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      systemInstruction:
        'Provide medically accurate, concise FMGE explanations aligned with Indian clinical guidelines in strict JSON.',
      responseMimeType: 'application/json',
      responseSchema: EXPLANATION_SCHEMA,
    },
  });

  return JSON.parse((response.text ?? '{}').trim());
}

function loadRows(resolvedPath) {
  const raw = fs.readFileSync(resolvedPath, 'utf8');
  if (resolvedPath.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('JSON PYQ file must contain an array of question objects.');
    return parsed;
  }
  return parseCsv(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

async function main() {
  if (!filePathArg) {
    console.error('Usage: node scripts/import-pyq.js --file=path/to/pyqs.csv [--dry-run]');
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), filePathArg);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const rows = loadRows(resolvedPath);
  console.log(`Loaded ${rows.length} PYQ rows from ${filePathArg}`);

  const apiKey = process.env.GEMINI_API_KEY;
  const ai =
    apiKey && apiKey !== 'MY_GEMINI_API_KEY'
      ? new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        })
      : null;

  if (!dryRun) {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('Error: MONGODB_URI is required unless running with --dry-run.');
      process.exit(1);
    }
    await mongoose.connect(mongoUri, { dbName: 'fmge_prep' });
    await Question.syncIndexes();
    console.log('Connected to MongoDB Atlas.');
  }

  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1;
    const resolved = resolveSubjectAndPaper(r.subject);
    if (!resolved) {
      console.warn(`[Row ${rowNum}] Unknown subject "${r.subject}" — skipping.`);
      skipped++;
      continue;
    }

    const correctKey = String(r.correct || r.correctKey || '').trim().toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(correctKey)) {
      console.warn(`[Row ${rowNum}] Invalid correct option "${r.correct}" — skipping.`);
      skipped++;
      continue;
    }

    const questionText = String(r.question || '').trim();
    const optA = String(r.A || r.a || '').trim();
    const optB = String(r.B || r.b || '').trim();
    const optC = String(r.C || r.c || '').trim();
    const optD = String(r.D || r.d || '').trim();

    if (!questionText || !optA || !optB || !optC || !optD) {
      console.warn(`[Row ${rowNum}] Missing question text or one of options A-D — skipping.`);
      skipped++;
      continue;
    }

    const pyqYear = Number.parseInt(String(r.year || ''), 10) || null;
    const questionHash = normalizeHash(questionText);

    if (!dryRun) {
      const exists = await Question.exists({ questionHash });
      if (exists) {
        console.log(`[Row ${rowNum}] Duplicate detected (hash match) — skipping.`);
        skipped++;
        continue;
      }
    }

    // Check if structured explanation already exists; otherwise generate via Gemini
    let explanationObj = null;
    let topic = String(r.topic || '').trim();
    let difficulty = ['easy', 'medium', 'hard'].includes(String(r.difficulty || '').toLowerCase())
      ? String(r.difficulty).toLowerCase()
      : 'medium';
    let tags = Array.isArray(r.tags) ? r.tags : [];

    if (r.explanation && typeof r.explanation === 'object' && r.explanation.whyCorrect && r.explanation.whyOthersWrong) {
      explanationObj = r.explanation;
    } else {
      const existingNote = typeof r.explanation === 'string' ? r.explanation.trim() : '';
      if (!ai) {
        if (!existingNote) {
          console.warn(
            `[Row ${rowNum}] Missing explanation and GEMINI_API_KEY is not set — skipping.`
          );
          skipped++;
          continue;
        }
        explanationObj = {
          whyCorrect: existingNote,
          whyOthersWrong: {
            A: correctKey === 'A' ? 'Correct option.' : 'Does not match the clinical criteria described.',
            B: correctKey === 'B' ? 'Correct option.' : 'Does not match the clinical criteria described.',
            C: correctKey === 'C' ? 'Correct option.' : 'Does not match the clinical criteria described.',
            D: correctKey === 'D' ? 'Correct option.' : 'Does not match the clinical criteria described.',
          },
          questionConcept: `${resolved.subject} FMGE PYQ (${pyqYear ?? 'Previous Year'})`,
          highYieldPoint: existingNote.slice(0, 180),
          mnemonic: '',
        };
      } else {
        console.log(`[Row ${rowNum}] Generating structured clinical explanation via Gemini...`);
        const enriched = await enrichExplanationWithGemini(
          ai,
          { question: questionText, A: optA, B: optB, C: optC, D: optD, correct: correctKey },
          resolved.subject,
          existingNote
        );
        explanationObj = {
          whyCorrect: enriched.whyCorrect,
          whyOthersWrong: enriched.whyOthersWrong,
          questionConcept: enriched.questionConcept,
          highYieldPoint: enriched.highYieldPoint,
          mnemonic: enriched.mnemonic || '',
        };
        if (!topic && enriched.topic) topic = enriched.topic;
        if (['easy', 'medium', 'hard'].includes(enriched.difficulty)) difficulty = enriched.difficulty;
        if (Array.isArray(enriched.tags) && tags.length === 0) tags = enriched.tags;
        await sleep(delayMs);
      }
    }

    const doc = {
      paper: resolved.paper,
      subject: resolved.subject,
      topic: topic || 'High-Yield PYQ',
      question: questionText,
      questionHash,
      options: [
        { key: 'A', text: optA },
        { key: 'B', text: optB },
        { key: 'C', text: optC },
        { key: 'D', text: optD },
      ],
      correctKey,
      explanation: explanationObj,
      difficulty,
      source: 'pyq',
      pyqYear,
      verified: true,
      tags,
    };

    if (!dryRun) {
      await Question.create(doc);
    }
    imported++;
    console.log(`[Row ${rowNum}] Imported PYQ (${pyqYear ?? 'N/A'}) — ${resolved.subject}`);
  }

  console.log(`\nPYQ Import complete. Imported: ${imported} | Skipped: ${skipped}`);
  if (!dryRun) {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal PYQ import error:', err);
  process.exit(1);
});
