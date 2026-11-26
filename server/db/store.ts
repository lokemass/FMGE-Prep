import crypto from 'crypto';
import mongoose from 'mongoose';
import {
  EXAM_STRUCTURE,
  SUBJECT_MAP,
  type PaperType,
} from '../constants/examStructure.ts';
import {
  SAMPLE_QUESTIONS,
  normalizeQuestionHash,
  type DifficultyLevel,
  type OptionKey,
  type QuestionExplanation,
  type QuestionOption,
  type QuestionSource,
} from '../data/sampleQuestions.ts';
import {
  AdminConfigModel,
  AttemptModel,
  BookmarkModel,
  QuestionModel,
  ReportModel,
  SeedProgressModel,
  UserModel,
} from '../models/index.ts';
import { FMGE_TOPICS, SUBJECT_QUOTA_TOTAL } from '../../scripts/topics.js';
import { setJwtSigningKey } from '../services/auth.ts';
import type { NormalizedImportQuestion } from '../services/jsonImporter.ts';

export interface StoredQuestion {
  id: string;
  paper: PaperType;
  subject: string;
  topic: string;
  question: string;
  questionHash: string;
  options: QuestionOption[];
  correctKey: OptionKey;
  explanation: QuestionExplanation;
  difficulty: DifficultyLevel;
  source: QuestionSource;
  pyqYear: number | null;
  verified: boolean;
  flagged?: boolean;
  flagReason?: string;
  tags: string[];
  createdAt: string;
}

/** Public question payload: strictly omits correctKey and explanation prior to submission */
export interface PublicQuestion {
  id: string;
  paper: PaperType;
  subject: string;
  topic: string;
  question: string;
  options: QuestionOption[];
  difficulty: DifficultyLevel;
  source: QuestionSource;
  pyqYear: number | null;
  verified: boolean;
  tags: string[];
  bookmarked?: boolean;
  bookmarkNote?: string;
}

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  lastLoginAt: string | null;
  lastLogoutAt: string | null;
  lastActiveAt: string | null;
  lastActivity: string;
  loginCount: number;
  createdAt: string;
}

export interface StoredAttempt {
  id: string;
  userId: string;
  questionId: string;
  selectedKey: OptionKey;
  isCorrect: boolean;
  timeTakenSec: number;
  mode: 'practice' | 'mock';
  mockSessionId?: string;
  createdAt: string;
}

export interface StoredBookmark {
  id: string;
  userId: string;
  questionId: string;
  note: string;
  createdAt: string;
}

export interface StoredReport {
  id: string;
  userId: string | null;
  questionId: string;
  issue: string;
  createdAt: string;
}

export interface MockSessionRecord {
  sessionId: string;
  userId: string | null;
  paper: PaperType;
  format: 'full' | 'mini';
  questionIds: string[];
  durationSec: number;
  startedAt: number;
  submitted: boolean;
}

export interface QuestionFilterParams {
  paper?: PaperType | 'all';
  subjects?: string[];
  topic?: string;
  source?: QuestionSource | 'all';
  status?: 'all' | 'unattempted' | 'incorrect' | 'bookmarked';
  difficulty?: DifficultyLevel | 'all';
  search?: string;
  page: number;
  limit: number;
  userId?: string;
}

export function sanitizeQuestionForClient(
  q: StoredQuestion,
  bookmarkMap?: Map<string, string>
): PublicQuestion {
  const result: PublicQuestion = {
    id: q.id,
    paper: q.paper,
    subject: q.subject,
    topic: q.topic,
    question: q.question,
    options: q.options,
    difficulty: q.difficulty,
    source: q.source,
    pyqYear: q.pyqYear,
    verified: q.verified,
    tags: q.tags,
  };
  if (bookmarkMap) {
    result.bookmarked = bookmarkMap.has(q.id);
    result.bookmarkNote = bookmarkMap.get(q.id) ?? '';
  }
  return result;
}

class DataStore {
  private mode: 'mongodb' | 'memory' = 'memory';
  private initialized = false;
  private connectionNote = 'Running in Preview Mode with 30 curated FMGE sample MCQs (set MONGODB_URI to connect MongoDB Atlas).';

  // In-memory collections for Preview Mode fallback
  private memQuestions: StoredQuestion[] = [];
  private memUsers: StoredUser[] = [];
  private memAttempts: StoredAttempt[] = [];
  private memBookmarks: StoredBookmark[] = [];
  private memReports: StoredReport[] = [];
  private memAdminPasscodeHash: string | null = null;

  // Active mock sessions (ephemeral server-side sessions so correct answers stay secret until submit)
  private mockSessions = new Map<string, MockSessionRecord>();

  public async getStatus(): Promise<{
    mode: 'mongodb' | 'memory';
    dbName: string;
    note: string;
    totalQuestions: number;
  }> {
    if (this.mode === 'mongodb') {
      const totalQuestions = await QuestionModel.countDocuments({ flagged: { $ne: true } });
      return {
        mode: this.mode,
        dbName: mongoose.connection.name || 'default',
        note: this.connectionNote,
        totalQuestions,
      };
    }
    return {
      mode: this.mode,
      dbName: 'in-memory',
      note: this.connectionNote,
      totalQuestions: this.memQuestions.filter((q) => !q.flagged).length,
    };
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    this.seedInMemorySamples();

    const mongoUri = process.env.MONGODB_URI?.trim();
    if (mongoUri) {
      try {
        await mongoose.connect(mongoUri, {
          dbName: 'fmge_prep',
          serverSelectionTimeoutMS: 6000,
        });
        this.mode = 'mongodb';
        const dbName = mongoose.connection.name || 'fmge_prep';
        this.connectionNote = `Connected to MongoDB Atlas (database: ${dbName}).`;
        await this.ensurePersistentSigningKey();
        const count = await QuestionModel.countDocuments();
        if (count === 0) {
          await this.seedSamplesIntoMongo();
          console.log(`[FMGE Prep] MongoDB Atlas (db: "${dbName}") empty — seeded 30 sample FMGE questions.`);
        } else {
          console.log(`[FMGE Prep] Connected to MongoDB Atlas (db: "${dbName}", ${count} questions available).`);
        }
        await QuestionModel.syncIndexes().catch(() => {});
        await SeedProgressModel.syncIndexes().catch(() => {});
      } catch (err) {
        console.warn(
          '[FMGE Prep] Could not connect to MONGODB_URI; falling back to 30-question Preview Mode.',
          err instanceof Error ? err.message : err
        );
        this.mode = 'memory';
        this.connectionNote =
          'MongoDB Atlas connection failed; running in Preview Mode with 30 curated sample MCQs.';
      }
    } else {
      console.log('[FMGE Prep] MONGODB_URI not set — running in Preview Mode with 30 curated sample MCQs.');
    }

    this.initialized = true;
  }

  private seedInMemorySamples(): void {
    const now = new Date().toISOString();
    this.memQuestions = SAMPLE_QUESTIONS.map((item, idx) => ({
      id: `sample-${String(idx + 1).padStart(3, '0')}`,
      ...item,
      flagged: false,
      flagReason: '',
      questionHash: normalizeQuestionHash(item.question),
      createdAt: now,
    }));

    // Seed 2 flagged sample items in Preview Mode (excluded from Practice & Mocks) so /admin/flagged is immediately testable
    const previewFlagged: StoredQuestion[] = [
      {
        id: 'flagged-preview-001',
        paper: 'morning',
        subject: 'Pharmacology',
        topic: 'Anti-tubercular therapy (NTEP regimens, MDR-TB) and anti-leprosy drugs',
        question:
          'Under current Indian NTEP guidelines, which drug is included in the standard drug-sensitive pulmonary tuberculosis continuation phase (4HRE) alongside isoniazid and rifampicin?',
        questionHash: normalizeQuestionHash(
          'Under current Indian NTEP guidelines, which drug is included in the standard drug-sensitive pulmonary tuberculosis continuation phase (4HRE) alongside isoniazid and rifampicin?'
        ),
        options: [
          { key: 'A', text: 'Pyrazinamide' },
          { key: 'B', text: 'Ethambutol' },
          { key: 'C', text: 'Streptomycin' },
          { key: 'D', text: 'Linezolid' },
        ],
        correctKey: 'A',
        explanation: {
          whyCorrect: 'Ethambutol (not Pyrazinamide) is continued throughout the 4-month continuation phase (4HRE) under NTEP.',
          whyOthersWrong: {
            A: 'Pyrazinamide is given only during the 2-month intensive phase (2HRZE).',
            B: 'Ethambutol is given in both intensive and continuation phases (2HRZE / 4HRE).',
            C: 'Streptomycin is not part of the standard first-line oral regimen.',
            D: 'Linezolid is reserved for drug-resistant TB regimens.',
          },
          questionConcept: 'NTEP first-line drug-sensitive TB regimen phases (2HRZE + 4HRE).',
          highYieldPoint: 'NTEP DS-TB regimen: 2 months HRZE + 4 months HRE daily FDC.',
          mnemonic: 'Continuation phase keeps HRE; Z stops after 2 months.',
        },
        difficulty: 'medium',
        source: 'ai_generated',
        pyqYear: null,
        verified: false,
        flagged: true,
        flagReason:
          'Second-pass model selected B (stored key: A). Under NTEP daily regimen 2HRZE/4HRE, Ethambutol (B) is continued in the continuation phase while Pyrazinamide is stopped after 2 months.',
        tags: ['NTEP', 'ATT', 'continuation phase'],
        createdAt: now,
      },
      {
        id: 'flagged-preview-002',
        paper: 'afternoon',
        subject: 'Medicine',
        topic: 'Electrolyte emergencies (hyperkalemia, hyponatremia) and ABG acid-base analysis',
        question:
          'What is the maximum recommended rate of serum sodium correction in the first 24 hours for a patient with chronic asymptomatic hyponatremia to minimize the risk of osmotic demyelination syndrome?',
        questionHash: normalizeQuestionHash(
          'What is the maximum recommended rate of serum sodium correction in the first 24 hours for a patient with chronic asymptomatic hyponatremia to minimize the risk of osmotic demyelination syndrome?'
        ),
        options: [
          { key: 'A', text: '8 mEq/L per 24 hours' },
          { key: 'B', text: '18 mEq/L per 24 hours' },
          { key: 'C', text: '24 mEq/L per 24 hours' },
          { key: 'D', text: '30 mEq/L per 24 hours' },
        ],
        correctKey: 'B',
        explanation: {
          whyCorrect: 'Correction should not exceed 8 mEq/L (6–8 mEq/L target, strict max 8–10 mEq/L) in 24 hours in chronic hyponatremia.',
          whyOthersWrong: {
            A: '8 mEq/L/24h is the safe ceiling to prevent central pontine myelinolysis.',
            B: '18 mEq/L in 24 hours carries a very high risk of osmotic demyelination syndrome.',
            C: '24 mEq/L is dangerously rapid.',
            D: '30 mEq/L is dangerously rapid.',
          },
          questionConcept: 'Safe sodium correction limits in chronic hyponatremia to avoid osmotic demyelination syndrome.',
          highYieldPoint: 'Slowly correct chronic hyponatremia: target 4–6 mEq/L/day, do not exceed 8 mEq/L in 24 hours.',
          mnemonic: 'Low to high, your pons will die (max 8 mEq/L in 24h).',
        },
        difficulty: 'easy',
        source: 'ai_generated',
        pyqYear: null,
        verified: false,
        flagged: true,
        flagReason:
          'Second-pass model selected A (stored key: B). Standard Harrison/clinical limit is <= 8 mEq/L per 24 hours (option A) to avoid osmotic demyelination syndrome.',
        tags: ['hyponatremia', 'ODS', 'electrolytes'],
        createdAt: now,
      },
    ];

    this.memQuestions.push(...previewFlagged);
  }

  private async seedSamplesIntoMongo(): Promise<void> {
    const docs = SAMPLE_QUESTIONS.map((item) => ({
      ...item,
      questionHash: normalizeQuestionHash(item.question),
    }));
    await QuestionModel.insertMany(docs, { ordered: false }).catch(() => {
      // Ignore duplicate hash errors on concurrent startup
    });
  }

  // ===================== USERS =====================

  public async findUserByEmail(email: string): Promise<StoredUser | null> {
    const cleanEmail = email.trim().toLowerCase();
    if (this.mode === 'mongodb') {
      const doc = await UserModel.findOne({ email: cleanEmail }).lean();
      if (!doc) return null;
      return {
        id: String(doc._id),
        email: doc.email,
        passwordHash: doc.passwordHash,
        lastLoginAt: doc.lastLoginAt ? new Date(doc.lastLoginAt).toISOString() : null,
        lastLogoutAt: doc.lastLogoutAt ? new Date(doc.lastLogoutAt).toISOString() : null,
        lastActiveAt: doc.lastActiveAt ? new Date(doc.lastActiveAt).toISOString() : null,
        lastActivity: doc.lastActivity || '',
        loginCount: typeof doc.loginCount === 'number' ? doc.loginCount : 0,
        createdAt: doc.createdAt.toISOString(),
      };
    }
    return this.memUsers.find((u) => u.email === cleanEmail) ?? null;
  }

  public async findUserById(userId: string): Promise<StoredUser | null> {
    if (this.mode === 'mongodb') {
      if (!mongoose.isValidObjectId(userId)) return null;
      const doc = await UserModel.findById(userId).lean();
      if (!doc) return null;
      return {
        id: String(doc._id),
        email: doc.email,
        passwordHash: doc.passwordHash,
        lastLoginAt: doc.lastLoginAt ? new Date(doc.lastLoginAt).toISOString() : null,
        lastLogoutAt: doc.lastLogoutAt ? new Date(doc.lastLogoutAt).toISOString() : null,
        lastActiveAt: doc.lastActiveAt ? new Date(doc.lastActiveAt).toISOString() : null,
        lastActivity: doc.lastActivity || '',
        loginCount: typeof doc.loginCount === 'number' ? doc.loginCount : 0,
        createdAt: doc.createdAt.toISOString(),
      };
    }
    return this.memUsers.find((u) => u.id === userId) ?? null;
  }

  public async createUser(email: string, passwordHash: string): Promise<StoredUser> {
    const cleanEmail = email.trim().toLowerCase();
    const now = new Date();
    if (this.mode === 'mongodb') {
      const doc = await UserModel.create({
        email: cleanEmail,
        passwordHash,
        lastLoginAt: now,
        lastLogoutAt: null,
        lastActiveAt: now,
        lastActivity: 'Registered & signed in',
        loginCount: 1,
      });
      return {
        id: String(doc._id),
        email: doc.email,
        passwordHash: doc.passwordHash,
        lastLoginAt: now.toISOString(),
        lastLogoutAt: null,
        lastActiveAt: now.toISOString(),
        lastActivity: 'Registered & signed in',
        loginCount: 1,
        createdAt: doc.createdAt.toISOString(),
      };
    }
    const isoNow = now.toISOString();
    const user: StoredUser = {
      id: `user-${crypto.randomUUID()}`,
      email: cleanEmail,
      passwordHash,
      lastLoginAt: isoNow,
      lastLogoutAt: null,
      lastActiveAt: isoNow,
      lastActivity: 'Registered & signed in',
      loginCount: 1,
      createdAt: isoNow,
    };
    this.memUsers.push(user);
    return user;
  }

  public async recordUserLogin(userId: string): Promise<void> {
    const now = new Date();
    if (this.mode === 'mongodb') {
      if (!mongoose.isValidObjectId(userId)) return;
      await UserModel.updateOne(
        { _id: userId },
        {
          $set: {
            lastLoginAt: now,
            lastLogoutAt: null,
            lastActiveAt: now,
            lastActivity: 'Signed in',
          },
          $inc: { loginCount: 1 },
        }
      ).catch(() => {});
      return;
    }
    const u = this.memUsers.find((x) => x.id === userId);
    if (u) {
      const iso = now.toISOString();
      u.lastLoginAt = iso;
      u.lastLogoutAt = null;
      u.lastActiveAt = iso;
      u.lastActivity = 'Signed in';
      u.loginCount = (u.loginCount || 0) + 1;
    }
  }

  public async recordUserLogout(userId: string): Promise<void> {
    const now = new Date();
    if (this.mode === 'mongodb') {
      if (!mongoose.isValidObjectId(userId)) return;
      await UserModel.updateOne(
        { _id: userId },
        {
          $set: {
            lastLogoutAt: now,
            lastActivity: 'Signed out',
          },
        }
      ).catch(() => {});
      return;
    }
    const u = this.memUsers.find((x) => x.id === userId);
    if (u) {
      u.lastLogoutAt = now.toISOString();
      u.lastActivity = 'Signed out';
    }
  }

  public async touchUserActivity(userId: string, activity?: string): Promise<void> {
    const now = new Date();
    const cleanActivity = typeof activity === 'string' ? activity.trim().slice(0, 100) : '';
    if (this.mode === 'mongodb') {
      if (!mongoose.isValidObjectId(userId)) return;
      const update: Record<string, unknown> = {
        lastActiveAt: now,
        lastLogoutAt: null,
      };
      if (cleanActivity) update.lastActivity = cleanActivity;
      await UserModel.updateOne({ _id: userId }, { $set: update }).catch(() => {});
      return;
    }
    const u = this.memUsers.find((x) => x.id === userId);
    if (u) {
      u.lastActiveAt = now.toISOString();
      u.lastLogoutAt = null;
      if (cleanActivity) u.lastActivity = cleanActivity;
    }
  }

  // ===================== SUBJECTS =====================

  public async getSubjectsSummary() {
    if (this.mode === 'mongodb') {
      const agg = await QuestionModel.aggregate<{
        _id: { subject: string; topic: string };
        count: number;
        pyqCount: number;
      }>([
        { $match: { flagged: { $ne: true } } },
        {
          $group: {
            _id: { subject: '$subject', topic: '$topic' },
            count: { $sum: 1 },
            pyqCount: { $sum: { $cond: [{ $eq: ['$source', 'pyq'] }, 1, 0] } },
          },
        },
      ]);

      const countBySubject = new Map<string, number>();
      const pyqBySubject = new Map<string, number>();
      const topicsBySubject = new Map<string, Array<{ name: string; count: number }>>();

      for (const row of agg) {
        const subj = row._id.subject;
        countBySubject.set(subj, (countBySubject.get(subj) ?? 0) + row.count);
        pyqBySubject.set(subj, (pyqBySubject.get(subj) ?? 0) + row.pyqCount);
        const list = topicsBySubject.get(subj) ?? [];
        list.push({ name: row._id.topic, count: row.count });
        topicsBySubject.set(subj, list);
      }

      const totalQuestions = Array.from(countBySubject.values()).reduce((a, b) => a + b, 0);

      return {
        mode: this.mode,
        note: this.connectionNote,
        totalQuestions,
        subjects: EXAM_STRUCTURE.map((def) => {
          const existingTopics = topicsBySubject.get(def.name) ?? [];
          const existingMap = new Map(existingTopics.map((t) => [t.name, t.count]));
          const allTopics = new Set<string>([
            ...Object.keys(def.topics),
            ...existingTopics.map((t) => t.name),
          ]);
          return {
            name: def.name,
            shortName: def.shortName,
            paper: def.paper,
            examWeight: def.examWeight,
            questionCount: countBySubject.get(def.name) ?? 0,
            pyqCount: pyqBySubject.get(def.name) ?? 0,
            topics: Array.from(allTopics).map((name) => ({
              name,
              count: existingMap.get(name) ?? 0,
            })),
          };
        }),
      };
    }

    // Memory mode (exclude flagged questions)
    const activeQuestions = this.memQuestions.filter((q) => !q.flagged);
    const totalQuestions = activeQuestions.length;
    return {
      mode: this.mode,
      note: this.connectionNote,
      totalQuestions,
      subjects: EXAM_STRUCTURE.map((def) => {
        const subjQuestions = activeQuestions.filter((q) => q.subject === def.name);
        const topicCounts = new Map<string, number>();
        for (const q of subjQuestions) {
          topicCounts.set(q.topic, (topicCounts.get(q.topic) ?? 0) + 1);
        }
        const allTopics = new Set<string>([
          ...Object.keys(def.topics),
          ...Array.from(topicCounts.keys()),
        ]);
        return {
          name: def.name,
          shortName: def.shortName,
          paper: def.paper,
          examWeight: def.examWeight,
          questionCount: subjQuestions.length,
          pyqCount: subjQuestions.filter((q) => q.source === 'pyq').length,
          topics: Array.from(allTopics).map((name) => ({
            name,
            count: topicCounts.get(name) ?? 0,
          })),
        };
      }),
    };
  }

  // ===================== QUESTIONS =====================

  private mapMongoQuestion(doc: Record<string, unknown>): StoredQuestion {
    const exp = doc.explanation as QuestionExplanation;
    return {
      id: String(doc._id),
      paper: doc.paper as PaperType,
      subject: String(doc.subject),
      topic: String(doc.topic),
      question: String(doc.question),
      questionHash: String(doc.questionHash ?? ''),
      options: (doc.options as QuestionOption[]) ?? [],
      correctKey: doc.correctKey as OptionKey,
      explanation: {
        whyCorrect: exp.whyCorrect,
        whyOthersWrong: exp.whyOthersWrong,
        questionConcept: exp.questionConcept,
        highYieldPoint: exp.highYieldPoint,
        mnemonic: exp.mnemonic || undefined,
      },
      difficulty: doc.difficulty as DifficultyLevel,
      source: doc.source as QuestionSource,
      pyqYear: typeof doc.pyqYear === 'number' ? doc.pyqYear : null,
      verified: Boolean(doc.verified),
      flagged: Boolean(doc.flagged),
      flagReason: typeof doc.flagReason === 'string' ? doc.flagReason : '',
      tags: Array.isArray(doc.tags) ? (doc.tags as string[]) : [],
      createdAt:
        doc.createdAt instanceof Date
          ? doc.createdAt.toISOString()
          : String(doc.createdAt ?? new Date().toISOString()),
    };
  }

  public async getQuestionById(questionId: string): Promise<StoredQuestion | null> {
    if (this.mode === 'mongodb') {
      if (!mongoose.isValidObjectId(questionId)) return null;
      const doc = await QuestionModel.findById(questionId).lean();
      if (!doc) return null;
      return this.mapMongoQuestion(doc as unknown as Record<string, unknown>);
    }
    return this.memQuestions.find((q) => q.id === questionId) ?? null;
  }

  public async getQuestions(params: QuestionFilterParams): Promise<{
    questions: PublicQuestion[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, params.page);
    const limit = Math.min(50, Math.max(1, params.limit));

    const bookmarkMap = new Map<string, string>();
    if (params.userId) {
      const userBookmarks = await this.getBookmarksForUser(params.userId);
      for (const bm of userBookmarks) {
        bookmarkMap.set(bm.questionId, bm.note);
      }
    }

    if (this.mode === 'mongodb') {
      // Exclude flagged questions from practice until reviewed
      const query: Record<string, unknown> = { flagged: { $ne: true } };
      if (params.paper && params.paper !== 'all') {
        query.paper = params.paper;
      }
      if (params.subjects && params.subjects.length > 0) {
        query.subject = { $in: params.subjects };
      }
      if (params.topic && params.topic.trim().length > 0) {
        query.topic = params.topic.trim();
      }
      if (params.source && params.source !== 'all') {
        query.source = params.source;
      }
      if (params.difficulty && params.difficulty !== 'all') {
        query.difficulty = params.difficulty;
      }
      if (params.search && params.search.trim().length > 0) {
        const escaped = params.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.$or = [
          { question: { $regex: escaped, $options: 'i' } },
          { topic: { $regex: escaped, $options: 'i' } },
          { subject: { $regex: escaped, $options: 'i' } },
          { tags: { $regex: escaped, $options: 'i' } },
        ];
      }

      if (params.status && params.status !== 'all') {
        if (!params.userId) {
          if (params.status === 'incorrect' || params.status === 'bookmarked') {
            return { questions: [], total: 0, page, limit, totalPages: 0 };
          }
        } else {
          const userObjectId = new mongoose.Types.ObjectId(params.userId);
          if (params.status === 'bookmarked') {
            const ids = Array.from(bookmarkMap.keys())
              .filter((id) => mongoose.isValidObjectId(id))
              .map((id) => new mongoose.Types.ObjectId(id));
            query._id = { $in: ids };
          } else if (params.status === 'unattempted') {
            const attemptedIds = await AttemptModel.distinct('questionId', { userId: userObjectId });
            query._id = { $nin: attemptedIds };
          } else if (params.status === 'incorrect') {
            // Find questions whose latest attempt by this user was incorrect
            const latestByQ = await AttemptModel.aggregate<{ _id: mongoose.Types.ObjectId; isCorrect: boolean }>([
              { $match: { userId: userObjectId } },
              { $sort: { createdAt: -1 } },
              { $group: { _id: '$questionId', isCorrect: { $first: '$isCorrect' } } },
              { $match: { isCorrect: false } },
            ]);
            query._id = { $in: latestByQ.map((r) => r._id) };
          }
        }
      }

      const total = await QuestionModel.countDocuments(query);
      const docs = await QuestionModel.find(query)
        .select('-correctKey -explanation')
        .sort({ createdAt: -1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      const questions: PublicQuestion[] = docs.map((d) => ({
        id: String(d._id),
        paper: d.paper as PaperType,
        subject: String(d.subject),
        topic: String(d.topic),
        question: String(d.question),
        options: (d.options as QuestionOption[]) ?? [],
        difficulty: d.difficulty as DifficultyLevel,
        source: d.source as QuestionSource,
        pyqYear: typeof d.pyqYear === 'number' ? d.pyqYear : null,
        verified: Boolean(d.verified),
        tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
        bookmarked: bookmarkMap.has(String(d._id)),
        bookmarkNote: bookmarkMap.get(String(d._id)) ?? '',
      }));

      return {
        questions,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    // Memory mode filtering (exclude flagged questions until reviewed)
    let filtered = this.memQuestions.filter((q) => !q.flagged);
    if (params.paper && params.paper !== 'all') {
      filtered = filtered.filter((q) => q.paper === params.paper);
    }
    if (params.subjects && params.subjects.length > 0) {
      const set = new Set(params.subjects);
      filtered = filtered.filter((q) => set.has(q.subject));
    }
    if (params.topic && params.topic.trim().length > 0) {
      const t = params.topic.trim();
      filtered = filtered.filter((q) => q.topic === t);
    }
    if (params.source && params.source !== 'all') {
      filtered = filtered.filter((q) => q.source === params.source);
    }
    if (params.difficulty && params.difficulty !== 'all') {
      filtered = filtered.filter((q) => q.difficulty === params.difficulty);
    }
    if (params.search && params.search.trim().length > 0) {
      const term = params.search.trim().toLowerCase();
      filtered = filtered.filter(
        (q) =>
          q.question.toLowerCase().includes(term) ||
          q.subject.toLowerCase().includes(term) ||
          q.topic.toLowerCase().includes(term) ||
          q.tags.some((tag) => tag.toLowerCase().includes(term))
      );
    }

    if (params.status && params.status !== 'all') {
      if (!params.userId) {
        if (params.status === 'incorrect' || params.status === 'bookmarked') {
          filtered = [];
        }
      } else {
        const userAttempts = this.memAttempts
          .filter((a) => a.userId === params.userId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        if (params.status === 'bookmarked') {
          filtered = filtered.filter((q) => bookmarkMap.has(q.id));
        } else if (params.status === 'unattempted') {
          const attemptedSet = new Set(userAttempts.map((a) => a.questionId));
          filtered = filtered.filter((q) => !attemptedSet.has(q.id));
        } else if (params.status === 'incorrect') {
          const latestStatus = new Map<string, boolean>();
          for (const att of userAttempts) {
            if (!latestStatus.has(att.questionId)) {
              latestStatus.set(att.questionId, att.isCorrect);
            }
          }
          filtered = filtered.filter((q) => latestStatus.get(q.id) === false);
        }
      }
    }

    const total = filtered.length;
    const start = (page - 1) * limit;
    const slice = filtered.slice(start, start + limit);

    return {
      questions: slice.map((q) => sanitizeQuestionForClient(q, bookmarkMap)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ===================== ATTEMPTS =====================

  public async recordAttempt(input: {
    userId: string;
    questionId: string;
    selectedKey: OptionKey;
    isCorrect: boolean;
    timeTakenSec: number;
    mode: 'practice' | 'mock';
    mockSessionId?: string;
  }): Promise<StoredAttempt> {
    if (this.mode === 'mongodb') {
      const doc = await AttemptModel.create({
        userId: new mongoose.Types.ObjectId(input.userId),
        questionId: new mongoose.Types.ObjectId(input.questionId),
        selectedKey: input.selectedKey,
        isCorrect: input.isCorrect,
        timeTakenSec: Math.max(0, Math.round(input.timeTakenSec)),
        mode: input.mode,
        mockSessionId: input.mockSessionId,
      });
      return {
        id: String(doc._id),
        userId: String(doc.userId),
        questionId: String(doc.questionId),
        selectedKey: doc.selectedKey,
        isCorrect: doc.isCorrect,
        timeTakenSec: doc.timeTakenSec,
        mode: doc.mode,
        mockSessionId: doc.mockSessionId,
        createdAt: doc.createdAt.toISOString(),
      };
    }

    const attempt: StoredAttempt = {
      id: `att-${crypto.randomUUID()}`,
      userId: input.userId,
      questionId: input.questionId,
      selectedKey: input.selectedKey,
      isCorrect: input.isCorrect,
      timeTakenSec: Math.max(0, Math.round(input.timeTakenSec)),
      mode: input.mode,
      mockSessionId: input.mockSessionId,
      createdAt: new Date().toISOString(),
    };
    this.memAttempts.push(attempt);
    return attempt;
  }

  // ===================== MOCK EXAMS =====================

  private shuffleArray<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  public async startMockSession(params: {
    paper: PaperType;
    format: 'full' | 'mini';
    userId?: string | null;
  }): Promise<{
    sessionId: string;
    paper: PaperType;
    format: 'full' | 'mini';
    targetCount: number;
    durationSec: number;
    questions: PublicQuestion[];
  }> {
    const targetCount = params.format === 'full' ? 150 : 30;
    const durationSec = params.format === 'full' ? 180 * 60 : 36 * 60; // 3 hrs vs 36 min

    const paperSubjects = EXAM_STRUCTURE.filter((s) => s.paper === params.paper);
    const totalWeight = paperSubjects.reduce((acc, s) => acc + s.examWeight, 0);

    // Fetch pool of unflagged questions for this paper
    let pool: StoredQuestion[];
    if (this.mode === 'mongodb') {
      const docs = await QuestionModel.find({
        paper: params.paper,
        flagged: { $ne: true },
      }).lean();
      pool = docs.map((d) => this.mapMongoQuestion(d as unknown as Record<string, unknown>));
    } else {
      pool = this.memQuestions.filter((q) => q.paper === params.paper && !q.flagged);
    }

    // Subject-weighted random selection
    const bySubject = new Map<string, StoredQuestion[]>();
    for (const q of pool) {
      const list = bySubject.get(q.subject) ?? [];
      list.push(q);
      bySubject.set(q.subject, list);
    }

    const selected: StoredQuestion[] = [];
    const usedIds = new Set<string>();

    for (const subj of paperSubjects) {
      const quota = Math.max(1, Math.round((subj.examWeight / totalWeight) * targetCount));
      const available = this.shuffleArray(bySubject.get(subj.name) ?? []);
      for (const q of available.slice(0, quota)) {
        if (!usedIds.has(q.id) && selected.length < targetCount) {
          usedIds.add(q.id);
          selected.push(q);
        }
      }
    }

    // Backfill remaining slots from unused questions in the same paper
    if (selected.length < targetCount) {
      const remaining = this.shuffleArray(pool.filter((q) => !usedIds.has(q.id)));
      for (const q of remaining) {
        if (selected.length >= targetCount) break;
        usedIds.add(q.id);
        selected.push(q);
      }
    }

    const finalQuestions = this.shuffleArray(selected);
    // Scale timer proportionally if DB has fewer questions than target (e.g. Preview Mode)
    const effectiveDurationSec =
      finalQuestions.length < targetCount && finalQuestions.length > 0
        ? Math.max(120, Math.round((finalQuestions.length / 150) * 180 * 60))
        : durationSec;

    const sessionId = `mock-${crypto.randomUUID()}`;
    this.mockSessions.set(sessionId, {
      sessionId,
      userId: params.userId ?? null,
      paper: params.paper,
      format: params.format,
      questionIds: finalQuestions.map((q) => q.id),
      durationSec: effectiveDurationSec,
      startedAt: Date.now(),
      submitted: false,
    });

    const bookmarkMap = new Map<string, string>();
    if (params.userId) {
      const userBookmarks = await this.getBookmarksForUser(params.userId);
      for (const bm of userBookmarks) {
        bookmarkMap.set(bm.questionId, bm.note);
      }
    }

    return {
      sessionId,
      paper: params.paper,
      format: params.format,
      targetCount,
      durationSec: effectiveDurationSec,
      questions: finalQuestions.map((q) => sanitizeQuestionForClient(q, bookmarkMap)),
    };
  }

  public async submitMockSession(params: {
    sessionId: string;
    answers: Array<{ questionId: string; selectedKey: OptionKey | null; timeTakenSec?: number }>;
    totalTimeSec: number;
    userId?: string | null;
  }) {
    const session = this.mockSessions.get(params.sessionId);
    if (!session) {
      throw new Error('Mock session not found or expired. Please start a new mock test.');
    }
    if (session.submitted) {
      throw new Error('This mock test has already been submitted.');
    }
    session.submitted = true;

    const answerMap = new Map<string, { selectedKey: OptionKey | null; timeTakenSec: number }>();
    for (const a of params.answers) {
      answerMap.set(a.questionId, {
        selectedKey: a.selectedKey,
        timeTakenSec: Math.max(0, Number(a.timeTakenSec ?? 0)),
      });
    }

    let correctCount = 0;
    let attemptedCount = 0;
    const subjectStats = new Map<
      string,
      { subject: string; total: number; attempted: number; correct: number }
    >();

    const reviewItems: Array<{
      question: StoredQuestion;
      selectedKey: OptionKey | null;
      isCorrect: boolean;
    }> = [];

    for (const qId of session.questionIds) {
      const q = await this.getQuestionById(qId);
      if (!q) continue;

      const entry = answerMap.get(qId);
      const selectedKey = entry?.selectedKey ?? null;
      const isCorrect = selectedKey !== null && selectedKey === q.correctKey;

      if (selectedKey !== null) {
        attemptedCount++;
        if (isCorrect) correctCount++;

        if (params.userId) {
          await this.recordAttempt({
            userId: params.userId,
            questionId: q.id,
            selectedKey,
            isCorrect,
            timeTakenSec: entry?.timeTakenSec ?? 0,
            mode: 'mock',
            mockSessionId: session.sessionId,
          });
        }
      }

      const st = subjectStats.get(q.subject) ?? {
        subject: q.subject,
        total: 0,
        attempted: 0,
        correct: 0,
      };
      st.total++;
      if (selectedKey !== null) st.attempted++;
      if (isCorrect) st.correct++;
      subjectStats.set(q.subject, st);

      reviewItems.push({ question: q, selectedKey, isCorrect });
    }

    const totalQuestions = reviewItems.length;
    const accuracyPct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    // Official FMGE pass mark is 150 / 300 (50% across Morning + Afternoon papers, no negative marking)
    const scaledPaperScore =
      totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 150) : 0;

    return {
      sessionId: session.sessionId,
      paper: session.paper,
      format: session.format,
      totalQuestions,
      attemptedCount,
      correctCount,
      incorrectCount: attemptedCount - correctCount,
      unansweredCount: totalQuestions - attemptedCount,
      accuracyPct,
      scaledPaperScore,
      passMarkCombined: 150,
      totalCombined: 300,
      passedPaperBenchmark: accuracyPct >= 50,
      totalTimeSec: Math.max(0, Math.round(params.totalTimeSec)),
      subjectBreakdown: Array.from(subjectStats.values()).map((s) => ({
        ...s,
        accuracyPct: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
      })),
      review: reviewItems,
    };
  }

  // ===================== BOOKMARKS =====================

  public async getBookmarksForUser(userId: string): Promise<StoredBookmark[]> {
    if (this.mode === 'mongodb') {
      const docs = await BookmarkModel.find({
        userId: new mongoose.Types.ObjectId(userId),
      })
        .sort({ createdAt: -1 })
        .lean();
      return docs.map((d) => ({
        id: String(d._id),
        userId: String(d.userId),
        questionId: String(d.questionId),
        note: d.note ?? '',
        createdAt: d.createdAt.toISOString(),
      }));
    }
    return this.memBookmarks
      .filter((b) => b.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public async getEnrichedBookmarks(userId: string) {
    const bookmarks = await this.getBookmarksForUser(userId);
    const items = [];
    for (const bm of bookmarks) {
      const q = await this.getQuestionById(bm.questionId);
      if (q) {
        items.push({
          id: bm.id,
          questionId: bm.questionId,
          note: bm.note,
          createdAt: bm.createdAt,
          question: sanitizeQuestionForClient(q),
        });
      }
    }
    return items;
  }

  public async upsertBookmark(userId: string, questionId: string, note: string): Promise<StoredBookmark> {
    if (this.mode === 'mongodb') {
      const doc = await BookmarkModel.findOneAndUpdate(
        {
          userId: new mongoose.Types.ObjectId(userId),
          questionId: new mongoose.Types.ObjectId(questionId),
        },
        { $set: { note } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();
      return {
        id: String(doc!._id),
        userId: String(doc!.userId),
        questionId: String(doc!.questionId),
        note: doc!.note ?? '',
        createdAt: doc!.createdAt.toISOString(),
      };
    }

    const existing = this.memBookmarks.find((b) => b.userId === userId && b.questionId === questionId);
    if (existing) {
      existing.note = note;
      return existing;
    }
    const created: StoredBookmark = {
      id: `bm-${crypto.randomUUID()}`,
      userId,
      questionId,
      note,
      createdAt: new Date().toISOString(),
    };
    this.memBookmarks.push(created);
    return created;
  }

  public async deleteBookmark(userId: string, questionId: string): Promise<boolean> {
    if (this.mode === 'mongodb') {
      const res = await BookmarkModel.deleteOne({
        userId: new mongoose.Types.ObjectId(userId),
        questionId: new mongoose.Types.ObjectId(questionId),
      });
      return (res.deletedCount ?? 0) > 0;
    }
    const idx = this.memBookmarks.findIndex((b) => b.userId === userId && b.questionId === questionId);
    if (idx === -1) return false;
    this.memBookmarks.splice(idx, 1);
    return true;
  }

  // ===================== REPORTS =====================

  public async createReport(input: {
    userId: string | null;
    questionId: string;
    issue: string;
  }): Promise<StoredReport> {
    if (this.mode === 'mongodb') {
      const doc = await ReportModel.create({
        userId: input.userId ? new mongoose.Types.ObjectId(input.userId) : null,
        questionId: new mongoose.Types.ObjectId(input.questionId),
        issue: input.issue.trim(),
      });
      return {
        id: String(doc._id),
        userId: doc.userId ? String(doc.userId) : null,
        questionId: String(doc.questionId),
        issue: doc.issue,
        createdAt: doc.createdAt.toISOString(),
      };
    }
    const rep: StoredReport = {
      id: `rep-${crypto.randomUUID()}`,
      userId: input.userId,
      questionId: input.questionId,
      issue: input.issue.trim(),
      createdAt: new Date().toISOString(),
    };
    this.memReports.push(rep);
    return rep;
  }

  public async getReportsForUser(userId: string): Promise<StoredReport[]> {
    if (this.mode === 'mongodb') {
      const docs = await ReportModel.find({ userId: new mongoose.Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      return docs.map((d) => ({
        id: String(d._id),
        userId: d.userId ? String(d.userId) : null,
        questionId: String(d.questionId),
        issue: d.issue,
        createdAt: d.createdAt.toISOString(),
      }));
    }
    return this.memReports.filter((r) => r.userId === userId);
  }

  // ===================== DASHBOARD STATS =====================

  public async getUserStats(userId: string) {
    let attempts: StoredAttempt[];
    const questionLookup = new Map<string, { subject: string; topic: string; paper: PaperType }>();

    if (this.mode === 'mongodb') {
      const docs = await AttemptModel.find({ userId: new mongoose.Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .lean();
      attempts = docs.map((d) => ({
        id: String(d._id),
        userId: String(d.userId),
        questionId: String(d.questionId),
        selectedKey: d.selectedKey,
        isCorrect: d.isCorrect,
        timeTakenSec: d.timeTakenSec,
        mode: d.mode,
        mockSessionId: d.mockSessionId,
        createdAt: d.createdAt.toISOString(),
      }));

      const uniqueQIds = Array.from(new Set(attempts.map((a) => a.questionId)))
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      const qDocs = await QuestionModel.find({ _id: { $in: uniqueQIds } })
        .select('subject topic paper')
        .lean();
      for (const q of qDocs) {
        questionLookup.set(String(q._id), {
          subject: String(q.subject),
          topic: String(q.topic),
          paper: q.paper as PaperType,
        });
      }
    } else {
      attempts = this.memAttempts.filter((a) => a.userId === userId);
      for (const q of this.memQuestions) {
        questionLookup.set(q.id, { subject: q.subject, topic: q.topic, paper: q.paper });
      }
    }

    const totalAttempted = attempts.length;
    const totalCorrect = attempts.filter((a) => a.isCorrect).length;
    const accuracyPct = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;
    const totalTimeSec = attempts.reduce((sum, a) => sum + (a.timeTakenSec || 0), 0);

    // Compute daily streak (consecutive calendar days with >=1 attempt ending today or yesterday)
    const daySet = new Set<string>(attempts.map((a) => a.createdAt.slice(0, 10)));
    let dailyStreak = 0;
    if (daySet.size > 0) {
      const today = new Date();
      const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      const todayStr = cursor.toISOString().slice(0, 10);
      if (!daySet.has(todayStr)) {
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }
      while (daySet.has(cursor.toISOString().slice(0, 10))) {
        dailyStreak++;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }
    }

    // Subject-wise accuracy across all 19 subjects
    const subjAcc = new Map<string, { attempted: number; correct: number }>();
    const topicAcc = new Map<string, { subject: string; topic: string; attempted: number; correct: number }>();

    for (const att of attempts) {
      const meta = questionLookup.get(att.questionId);
      if (!meta) continue;
      const s = subjAcc.get(meta.subject) ?? { attempted: 0, correct: 0 };
      s.attempted++;
      if (att.isCorrect) s.correct++;
      subjAcc.set(meta.subject, s);

      const tKey = `${meta.subject}:::${meta.topic}`;
      const t = topicAcc.get(tKey) ?? {
        subject: meta.subject,
        topic: meta.topic,
        attempted: 0,
        correct: 0,
      };
      t.attempted++;
      if (att.isCorrect) t.correct++;
      topicAcc.set(tKey, t);
    }

    const subjectPerformance = EXAM_STRUCTURE.map((def) => {
      const stat = subjAcc.get(def.name) ?? { attempted: 0, correct: 0 };
      return {
        subject: def.name,
        shortName: def.shortName,
        paper: def.paper,
        attempted: stat.attempted,
        correct: stat.correct,
        accuracyPct: stat.attempted > 0 ? Math.round((stat.correct / stat.attempted) * 100) : 0,
      };
    });

    const weakTopics = Array.from(topicAcc.values())
      .map((t) => ({
        ...t,
        accuracyPct: t.attempted > 0 ? Math.round((t.correct / t.attempted) * 100) : 0,
      }))
      .filter((t) => t.accuracyPct < 75)
      .sort((a, b) => a.accuracyPct - b.accuracyPct || b.attempted - a.attempted)
      .slice(0, 8);

    const bookmarksCount = (await this.getBookmarksForUser(userId)).length;

    // Best recent Morning & Afternoon paper mock scores for 150/300 combined tracker
    const mockBySession = new Map<string, { paper: PaperType; correct: number; total: number }>();
    for (const att of attempts) {
      if (att.mode === 'mock' && att.mockSessionId) {
        const meta = questionLookup.get(att.questionId);
        if (!meta) continue;
        const rec = mockBySession.get(att.mockSessionId) ?? {
          paper: meta.paper,
          correct: 0,
          total: 0,
        };
        rec.total++;
        if (att.isCorrect) rec.correct++;
        mockBySession.set(att.mockSessionId, rec);
      }
    }

    let bestMorningScaled = 0;
    let bestAfternoonScaled = 0;
    for (const rec of mockBySession.values()) {
      const scaled = rec.total > 0 ? Math.round((rec.correct / rec.total) * 150) : 0;
      if (rec.paper === 'morning') bestMorningScaled = Math.max(bestMorningScaled, scaled);
      if (rec.paper === 'afternoon') bestAfternoonScaled = Math.max(bestAfternoonScaled, scaled);
    }

    return {
      totalAttempted,
      totalCorrect,
      accuracyPct,
      dailyStreak,
      totalTimeSec,
      bookmarksCount,
      bestMorningScaled,
      bestAfternoonScaled,
      combinedMockEstimate: bestMorningScaled + bestAfternoonScaled,
      subjectPerformance,
      weakTopics,
    };
  }

  // ===================== ADMIN AUTH CONFIG =====================

  private async ensurePersistentSigningKey(): Promise<void> {
    const generated = crypto.randomBytes(32).toString('hex');
    const doc = await AdminConfigModel.findOneAndUpdate(
      { key: 'jwt_signing_key' },
      { $setOnInsert: { key: 'jwt_signing_key', passcodeHash: generated } },
      { upsert: true, new: true }
    ).lean();
    if (doc?.passcodeHash) {
      setJwtSigningKey(doc.passcodeHash);
    }
  }

  public async getAdminPasscodeHash(): Promise<string | null> {
    if (this.mode === 'mongodb') {
      const doc = await AdminConfigModel.findOne({ key: 'admin_passcode' }).lean();
      return doc?.passcodeHash ?? null;
    }
    return this.memAdminPasscodeHash;
  }

  public async claimAdminPasscode(passcodeHash: string): Promise<boolean> {
    if (this.mode === 'mongodb') {
      try {
        await AdminConfigModel.create({ key: 'admin_passcode', passcodeHash });
        return true;
      } catch {
        return false; // Already claimed atomically
      }
    }
    if (this.memAdminPasscodeHash) return false;
    this.memAdminPasscodeHash = passcodeHash;
    return true;
  }

  // ===================== ADMIN FLAGGED REVIEW =====================

  public async getFlaggedQuestions(params: { subject?: string; page: number; limit: number }) {
    const page = Math.max(1, params.page);
    const limit = Math.min(50, Math.max(1, params.limit));

    if (this.mode === 'mongodb') {
      const query: Record<string, unknown> = { flagged: true };
      if (params.subject && params.subject !== 'all') {
        query.subject = params.subject;
      }
      const total = await QuestionModel.countDocuments(query);
      const docs = await QuestionModel.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      return {
        questions: docs.map((d) => this.mapMongoQuestion(d as unknown as Record<string, unknown>)),
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      };
    }

    let flagged = this.memQuestions.filter((q) => q.flagged === true);
    if (params.subject && params.subject !== 'all') {
      flagged = flagged.filter((q) => q.subject === params.subject);
    }
    const total = flagged.length;
    const start = (page - 1) * limit;
    return {
      questions: flagged.slice(start, start + limit),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  public async updateFlaggedQuestion(
    questionId: string,
    updates: {
      question?: string;
      topic?: string;
      difficulty?: DifficultyLevel;
      options?: QuestionOption[];
      correctKey?: OptionKey;
      explanation?: QuestionExplanation;
      approve?: boolean;
    }
  ): Promise<StoredQuestion | null> {
    const patch: Record<string, unknown> = {};
    if (typeof updates.question === 'string' && updates.question.trim().length > 0) {
      patch.question = updates.question.trim();
      patch.questionHash = normalizeQuestionHash(updates.question.trim());
    }
    if (typeof updates.topic === 'string' && updates.topic.trim().length > 0) {
      patch.topic = updates.topic.trim();
    }
    if (updates.difficulty) {
      patch.difficulty = updates.difficulty;
    }
    if (updates.options && updates.options.length === 4) {
      patch.options = updates.options;
    }
    if (updates.correctKey) {
      patch.correctKey = updates.correctKey;
    }
    if (updates.explanation) {
      patch.explanation = updates.explanation;
    }
    if (updates.approve) {
      patch.flagged = false;
      patch.flagReason = '';
      patch.verified = true;
    }

    if (this.mode === 'mongodb') {
      if (!mongoose.isValidObjectId(questionId)) return null;
      const doc = await QuestionModel.findByIdAndUpdate(
        questionId,
        { $set: patch },
        { new: true }
      ).lean();
      if (!doc) return null;
      return this.mapMongoQuestion(doc as unknown as Record<string, unknown>);
    }

    const idx = this.memQuestions.findIndex((q) => q.id === questionId);
    if (idx === -1) return null;
    this.memQuestions[idx] = {
      ...this.memQuestions[idx],
      ...(patch as Partial<StoredQuestion>),
    };
    return this.memQuestions[idx];
  }

  public async deleteQuestionById(questionId: string): Promise<boolean> {
    if (this.mode === 'mongodb') {
      if (!mongoose.isValidObjectId(questionId)) return false;
      const res = await QuestionModel.deleteOne({ _id: questionId });
      return (res.deletedCount ?? 0) > 0;
    }
    const idx = this.memQuestions.findIndex((q) => q.id === questionId);
    if (idx === -1) return false;
    this.memQuestions.splice(idx, 1);
    return true;
  }

  public async findExistingQuestionHashes(hashes: string[]): Promise<string[]> {
    if (hashes.length === 0) return [];
    const unique = Array.from(new Set(hashes.filter((h) => typeof h === 'string' && h.length === 64)));
    if (unique.length === 0) return [];

    if (this.mode === 'mongodb') {
      const docs = await QuestionModel.find(
        { questionHash: { $in: unique } },
        { questionHash: 1, _id: 0 }
      ).lean();
      return docs.map((d) => d.questionHash);
    }

    const existing = new Set(this.memQuestions.map((q) => q.questionHash));
    return unique.filter((h) => existing.has(h));
  }

  public async importQuestionsBulk(
    docs: NormalizedImportQuestion[]
  ): Promise<{ inserted: number; duplicatesSkipped: number }> {
    if (docs.length === 0) {
      return { inserted: 0, duplicatesSkipped: 0 };
    }

    if (this.mode === 'mongodb') {
      const hashes = docs.map((d) => d.questionHash);
      const existing = await QuestionModel.find(
        { questionHash: { $in: hashes } },
        { questionHash: 1 }
      ).lean();
      const existingSet = new Set(existing.map((e) => e.questionHash));

      const toInsert = docs.filter((d) => !existingSet.has(d.questionHash));
      const preSkipped = docs.length - toInsert.length;
      if (toInsert.length === 0) {
        return { inserted: 0, duplicatesSkipped: preSkipped };
      }

      let inserted = 0;
      try {
        const created = await QuestionModel.insertMany(toInsert, { ordered: false });
        inserted = created.length;
      } catch (bulkErr: unknown) {
        const e = bulkErr as { insertedDocs?: unknown[]; result?: { nInserted?: number } };
        if (Array.isArray(e?.insertedDocs)) inserted = e.insertedDocs.length;
        else if (typeof e?.result?.nInserted === 'number') inserted = e.result.nInserted;
      }

      // Sync seed_progress counters for newly inserted (subject, topic) pairs
      if (inserted > 0) {
        const byTopic = new Map<string, { subject: string; topic: string; count: number }>();
        for (const doc of toInsert) {
          const key = `${doc.subject}:::${doc.topic}`;
          const prev = byTopic.get(key) ?? { subject: doc.subject, topic: doc.topic, count: 0 };
          prev.count++;
          byTopic.set(key, prev);
        }
        await Promise.all(
          Array.from(byTopic.values()).map((entry) =>
            SeedProgressModel.updateOne(
              { subject: entry.subject, topic: entry.topic },
              {
                $inc: { generated: entry.count },
                $setOnInsert: { target: 30 },
                $set: { updatedAt: new Date() },
              },
              { upsert: true }
            ).catch(() => {})
          )
        );
      }

      const raceDuplicates = Math.max(0, toInsert.length - inserted);
      return {
        inserted,
        duplicatesSkipped: preSkipped + raceDuplicates,
      };
    }

    // Preview Mode (in-memory) fallback
    const existingSet = new Set(this.memQuestions.map((q) => q.questionHash));
    const now = new Date().toISOString();
    let inserted = 0;
    let duplicatesSkipped = 0;

    for (const doc of docs) {
      if (existingSet.has(doc.questionHash)) {
        duplicatesSkipped++;
        continue;
      }
      existingSet.add(doc.questionHash);
      this.memQuestions.push({
        id: `import-${crypto.randomUUID().slice(0, 12)}`,
        ...doc,
        createdAt: now,
      });
      inserted++;
    }

    return { inserted, duplicatesSkipped };
  }

  // ===================== ADMIN BANK COVERAGE STATS (VS 10,100 QUOTA) =====================

  public async getAdminBankStats() {
    type SubjectCounts = {
      total: number;
      active: number;
      flagged: number;
      verified: number;
      pyq: number;
      aiGenerated: number;
    };

    const bySubject = new Map<string, SubjectCounts>();
    const topicProgressMap = new Map<string, { generated: number; target: number }>();

    if (this.mode === 'mongodb') {
      const agg = await QuestionModel.aggregate<{
        _id: string;
        total: number;
        flagged: number;
        verified: number;
        pyq: number;
        aiGenerated: number;
      }>([
        {
          $group: {
            _id: '$subject',
            total: { $sum: 1 },
            flagged: { $sum: { $cond: [{ $eq: ['$flagged', true] }, 1, 0] } },
            verified: { $sum: { $cond: [{ $eq: ['$verified', true] }, 1, 0] } },
            pyq: { $sum: { $cond: [{ $eq: ['$source', 'pyq'] }, 1, 0] } },
            aiGenerated: { $sum: { $cond: [{ $eq: ['$source', 'ai_generated'] }, 1, 0] } },
          },
        },
      ]);

      for (const row of agg) {
        bySubject.set(row._id, {
          total: row.total,
          active: row.total - row.flagged,
          flagged: row.flagged,
          verified: row.verified,
          pyq: row.pyq,
          aiGenerated: row.aiGenerated,
        });
      }

      const topicAgg = await QuestionModel.aggregate<{
        _id: { subject: string; topic: string };
        count: number;
      }>([
        { $group: { _id: { subject: '$subject', topic: '$topic' }, count: { $sum: 1 } } },
      ]);
      for (const row of topicAgg) {
        topicProgressMap.set(`${row._id.subject}:::${row._id.topic}`, {
          generated: row.count,
          target: 0,
        });
      }

      const seedDocs = await SeedProgressModel.find().lean();
      for (const sd of seedDocs) {
        const key = `${sd.subject}:::${sd.topic}`;
        const existing = topicProgressMap.get(key);
        topicProgressMap.set(key, {
          generated: Math.max(existing?.generated ?? 0, sd.generated),
          target: sd.target,
        });
      }
    } else {
      for (const q of this.memQuestions) {
        const st = bySubject.get(q.subject) ?? {
          total: 0,
          active: 0,
          flagged: 0,
          verified: 0,
          pyq: 0,
          aiGenerated: 0,
        };
        st.total++;
        if (q.flagged) st.flagged++;
        else st.active++;
        if (q.verified) st.verified++;
        if (q.source === 'pyq') st.pyq++;
        else st.aiGenerated++;
        bySubject.set(q.subject, st);

        const tKey = `${q.subject}:::${q.topic}`;
        const prev = topicProgressMap.get(tKey) ?? { generated: 0, target: 0 };
        topicProgressMap.set(tKey, { generated: prev.generated + 1, target: prev.target });
      }
    }

    const subjects = FMGE_TOPICS.map((cfg) => {
      const counts = bySubject.get(cfg.subject) ?? {
        total: 0,
        active: 0,
        flagged: 0,
        verified: 0,
        pyq: 0,
        aiGenerated: 0,
      };
      const pct = cfg.quota > 0 ? Math.min(100, Number(((counts.active / cfg.quota) * 100).toFixed(1))) : 0;
      const topics = cfg.topics.map((t) => {
        const prog = topicProgressMap.get(`${cfg.subject}:::${t.topic}`);
        return {
          topic: t.topic,
          current: prog?.generated ?? 0,
          target: t.target,
        };
      });
      return {
        subject: cfg.subject,
        paper: cfg.paper,
        target: cfg.quota,
        total: counts.total,
        active: counts.active,
        flagged: counts.flagged,
        verified: counts.verified,
        pyq: counts.pyq,
        aiGenerated: counts.aiGenerated,
        completionPct: pct,
        topicCount: cfg.topics.length,
        topics,
      };
    });

    const totals = subjects.reduce(
      (acc, s) => {
        acc.total += s.total;
        acc.active += s.active;
        acc.flagged += s.flagged;
        acc.verified += s.verified;
        acc.pyq += s.pyq;
        acc.aiGenerated += s.aiGenerated;
        if (s.paper === 'morning') {
          acc.morningActive += s.active;
          acc.morningTarget += s.target;
        } else {
          acc.afternoonActive += s.active;
          acc.afternoonTarget += s.target;
        }
        return acc;
      },
      {
        total: 0,
        active: 0,
        flagged: 0,
        verified: 0,
        pyq: 0,
        aiGenerated: 0,
        morningActive: 0,
        morningTarget: 0,
        afternoonActive: 0,
        afternoonTarget: 0,
      }
    );

    return {
      mode: this.mode,
      dbName: this.mode === 'mongodb' ? mongoose.connection.name || 'fmge_prep' : 'in-memory',
      note: this.connectionNote,
      targetTotal: SUBJECT_QUOTA_TOTAL,
      ...totals,
      overallCompletionPct: Number(((totals.active / SUBJECT_QUOTA_TOTAL) * 100).toFixed(2)),
      subjects,
    };
  }

  public async getAdminUsersOverview(opts?: {
    search?: string;
    status?: 'all' | 'active_now' | 'logged_in' | 'offline';
  }) {
    const nowMs = Date.now();
    const ACTIVE_NOW_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
    const LOGGED_IN_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
    const searchClean = (opts?.search || '').trim().toLowerCase();
    const statusFilter = opts?.status || 'all';

    interface UserRowInternal {
      id: string;
      email: string;
      createdAt: string;
      lastLoginAt: string | null;
      lastLogoutAt: string | null;
      lastActiveAt: string | null;
      lastActivity: string;
      loginCount: number;
      totalAttempts: number;
      correctAttempts: number;
      accuracyPct: number;
      mockAttempts: number;
      bookmarksCount: number;
      status: 'active_now' | 'logged_in' | 'offline';
    }

    let rawUsers: Array<{
      id: string;
      email: string;
      createdAt: string;
      lastLoginAt: string | null;
      lastLogoutAt: string | null;
      lastActiveAt: string | null;
      lastActivity: string;
      loginCount: number;
    }> = [];

    const attemptStatsMap = new Map<
      string,
      { total: number; correct: number; mock: number; lastAttemptAt: number | null }
    >();
    const bookmarkCountMap = new Map<string, number>();

    if (this.mode === 'mongodb') {
      const userDocs = await UserModel.find(
        {},
        {
          email: 1,
          createdAt: 1,
          lastLoginAt: 1,
          lastLogoutAt: 1,
          lastActiveAt: 1,
          lastActivity: 1,
          loginCount: 1,
        }
      )
        .sort({ lastActiveAt: -1, createdAt: -1 })
        .limit(500)
        .lean();

      rawUsers = userDocs.map((d) => ({
        id: String(d._id),
        email: d.email,
        createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
        lastLoginAt: d.lastLoginAt ? new Date(d.lastLoginAt).toISOString() : null,
        lastLogoutAt: d.lastLogoutAt ? new Date(d.lastLogoutAt).toISOString() : null,
        lastActiveAt: d.lastActiveAt ? new Date(d.lastActiveAt).toISOString() : null,
        lastActivity: d.lastActivity || '',
        loginCount: typeof d.loginCount === 'number' ? d.loginCount : 0,
      }));

      const [attemptAgg, bookmarkAgg] = await Promise.all([
        AttemptModel.aggregate<{
          _id: mongoose.Types.ObjectId;
          total: number;
          correct: number;
          mock: number;
          lastAttemptAt: Date | null;
        }>([
          {
            $group: {
              _id: '$userId',
              total: { $sum: 1 },
              correct: { $sum: { $cond: ['$isCorrect', 1, 0] } },
              mock: { $sum: { $cond: [{ $eq: ['$mode', 'mock'] }, 1, 0] } },
              lastAttemptAt: { $max: '$createdAt' },
            },
          },
        ]),
        BookmarkModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
          { $group: { _id: '$userId', count: { $sum: 1 } } },
        ]),
      ]);

      for (const a of attemptAgg) {
        attemptStatsMap.set(String(a._id), {
          total: a.total,
          correct: a.correct,
          mock: a.mock,
          lastAttemptAt: a.lastAttemptAt ? new Date(a.lastAttemptAt).getTime() : null,
        });
      }
      for (const b of bookmarkAgg) {
        bookmarkCountMap.set(String(b._id), b.count);
      }
    } else {
      rawUsers = this.memUsers.map((u) => ({
        id: u.id,
        email: u.email,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        lastLogoutAt: u.lastLogoutAt,
        lastActiveAt: u.lastActiveAt,
        lastActivity: u.lastActivity,
        loginCount: u.loginCount,
      }));

      for (const att of this.memAttempts) {
        const cur = attemptStatsMap.get(att.userId) ?? {
          total: 0,
          correct: 0,
          mock: 0,
          lastAttemptAt: null,
        };
        cur.total += 1;
        if (att.isCorrect) cur.correct += 1;
        if (att.mode === 'mock') cur.mock += 1;
        const ts = new Date(att.createdAt).getTime();
        if (!cur.lastAttemptAt || ts > cur.lastAttemptAt) cur.lastAttemptAt = ts;
        attemptStatsMap.set(att.userId, cur);
      }
      for (const bm of this.memBookmarks) {
        bookmarkCountMap.set(bm.userId, (bookmarkCountMap.get(bm.userId) ?? 0) + 1);
      }
    }

    const allRows: UserRowInternal[] = rawUsers.map((u) => {
      const att = attemptStatsMap.get(u.id) ?? {
        total: 0,
        correct: 0,
        mock: 0,
        lastAttemptAt: null,
      };
      const bmCount = bookmarkCountMap.get(u.id) ?? 0;

      const loginMs = u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : null;
      const logoutMs = u.lastLogoutAt ? new Date(u.lastLogoutAt).getTime() : null;
      const activeMs = u.lastActiveAt ? new Date(u.lastActiveAt).getTime() : null;
      const effectiveActiveMs = Math.max(
        activeMs ?? 0,
        att.lastAttemptAt ?? 0,
        loginMs ?? 0
      );

      const explicitlySignedOut =
        logoutMs !== null && (effectiveActiveMs === 0 || logoutMs >= effectiveActiveMs);

      let status: 'active_now' | 'logged_in' | 'offline' = 'offline';
      if (!explicitlySignedOut && effectiveActiveMs > 0) {
        const ageMs = nowMs - effectiveActiveMs;
        if (ageMs <= ACTIVE_NOW_WINDOW_MS) {
          status = 'active_now';
        } else if (ageMs <= LOGGED_IN_WINDOW_MS) {
          status = 'logged_in';
        }
      }

      const lastActiveIso =
        effectiveActiveMs > 0 ? new Date(effectiveActiveMs).toISOString() : u.lastActiveAt;

      return {
        id: u.id,
        email: u.email,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        lastLogoutAt: u.lastLogoutAt,
        lastActiveAt: lastActiveIso,
        lastActivity:
          u.lastActivity ||
          (att.total > 0 ? 'Practicing FMGE MCQs' : 'Registered account'),
        loginCount: u.loginCount,
        totalAttempts: att.total,
        correctAttempts: att.correct,
        accuracyPct: att.total > 0 ? Math.round((att.correct / att.total) * 100) : 0,
        mockAttempts: att.mock,
        bookmarksCount: bmCount,
        status,
      };
    });

    const statusRank = { active_now: 0, logged_in: 1, offline: 2 } as const;
    allRows.sort((a, b) => {
      if (statusRank[a.status] !== statusRank[b.status]) {
        return statusRank[a.status] - statusRank[b.status];
      }
      const aTs = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
      const bTs = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
      return bTs - aTs;
    });

    const summary = {
      totalUsers: allRows.length,
      activeNow: allRows.filter((u) => u.status === 'active_now').length,
      loggedInToday: allRows.filter((u) => u.status === 'active_now' || u.status === 'logged_in')
        .length,
      totalAttempts: allRows.reduce((acc, u) => acc + u.totalAttempts, 0),
    };

    const filtered = allRows.filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (searchClean && !u.email.toLowerCase().includes(searchClean)) return false;
      return true;
    });

    return {
      mode: this.mode,
      dbName: this.mode === 'mongodb' ? mongoose.connection.name || 'fmge_prep' : 'in-memory',
      summary,
      users: filtered,
    };
  }
}

export const store = new DataStore();
export { SUBJECT_MAP };
