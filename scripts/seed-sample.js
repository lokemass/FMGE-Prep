#!/usr/bin/env node
/**
 * Seeds the 30 curated sample FMGE questions across all 19 subjects directly into MongoDB Atlas.
 * Run: npx tsx scripts/seed-sample.js   (or npm run seed:sample)
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { SAMPLE_QUESTIONS, normalizeQuestionHash } from '../server/data/sampleQuestions.ts';
import { QuestionModel } from '../server/models/index.ts';

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('Error: MONGODB_URI must be set in your environment to seed MongoDB Atlas.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri, { dbName: 'fmge_prep' });
  await QuestionModel.syncIndexes();

  const docs = SAMPLE_QUESTIONS.map((item) => ({
    ...item,
    questionHash: normalizeQuestionHash(item.question),
  }));

  let inserted = 0;
  for (const doc of docs) {
    const res = await QuestionModel.updateOne(
      { questionHash: doc.questionHash },
      { $setOnInsert: doc },
      { upsert: true }
    );
    if (res.upsertedCount > 0) inserted++;
  }

  const total = await QuestionModel.countDocuments();
  console.log(`Sample seed complete: ${inserted} newly inserted (${docs.length - inserted} already existed). Total questions in Atlas: ${total}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Failed to seed sample questions:', err);
  process.exit(1);
});
