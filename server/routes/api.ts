import { Router, type Response } from 'express';
import {
  ALL_SUBJECT_NAMES,
  type PaperType,
} from '../constants/examStructure.ts';
import type { DifficultyLevel, OptionKey, QuestionSource } from '../data/sampleQuestions.ts';
import { store } from '../db/store.ts';
import {
  hashPassword,
  isAdminEmail,
  optionalAuth,
  requireAdmin,
  requireAuth,
  signAdminToken,
  signAuthToken,
  verifyAdminBearer,
  verifyPassword,
  type AuthenticatedRequest,
} from '../services/auth.ts';
import { generateStudyAid } from '../services/gemini.ts';
import {
  bulkSeeder,
  PROVIDER_DEFAULT_MODELS,
  type AiSeederProvider,
  type SeederMode,
} from '../services/bulkSeeder.ts';
import { prepareJsonImportBatch } from '../services/jsonImporter.ts';

const router = Router();

const VALID_OPTIONS = new Set<OptionKey>(['A', 'B', 'C', 'D']);
const VALID_PAPERS = new Set(['morning', 'afternoon', 'all']);
const VALID_SOURCES = new Set(['pyq', 'ai_generated', 'all']);
const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard', 'all']);
const VALID_STATUSES = new Set(['all', 'unattempted', 'incorrect', 'bookmarked']);
const VALID_SUBJECT_SET = new Set(ALL_SUBJECT_NAMES);

function asSafeString(value: unknown, maxLen = 500): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ===================== HEALTH & SYSTEM STATUS =====================

router.get('/health', async (_req, res) => {
  try {
    const status = await store.getStatus();
    res.json({ ok: true, ...status });
  } catch {
    res.status(500).json({ ok: false, error: 'Health check failed.' });
  }
});

// ===================== AUTH ROUTES =====================

router.post('/auth/register', async (req, res: Response) => {
  try {
    const email = asSafeString(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({ error: 'Password must be between 6 and 128 characters.' });
      return;
    }

    const existing = await store.findUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await store.createUser(email, passwordHash);
    const token = signAuthToken({ userId: user.id, email: user.email });

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
    });
  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ error: 'Unable to create account right now.' });
  }
});

router.post('/auth/login', async (req, res: Response) => {
  try {
    const email = asSafeString(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!isValidEmail(email) || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const user = await store.findUserByEmail(email);
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    await store.recordUserLogin(user.id);
    const token = signAuthToken({ userId: user.id, email: user.email });
    res.json({
      token,
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Unable to sign in right now.' });
  }
});

router.post('/auth/logout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await store.recordUserLogout(req.user!.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth/logout]', err);
    res.status(500).json({ error: 'Unable to sign out right now.' });
  }
});

router.post('/auth/heartbeat', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activity = asSafeString(req.body?.activity, 100);
    await store.touchUserActivity(req.user!.userId, activity || 'Active in FMGE Prep');
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});

router.get('/auth/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await store.findUserById(req.user!.userId);
    if (!user) {
      res.status(401).json({ error: 'User account not found.' });
      return;
    }
    void store.touchUserActivity(user.id);
    res.json({ user: { id: user.id, email: user.email, createdAt: user.createdAt } });
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'Unable to verify session.' });
  }
});

// ===================== SUBJECTS =====================

router.get('/subjects', async (_req, res: Response) => {
  try {
    const summary = await store.getSubjectsSummary();
    res.json(summary);
  } catch (err) {
    console.error('[GET /subjects]', err);
    res.status(500).json({ error: 'Failed to load subjects.' });
  }
});

// ===================== QUESTIONS (STRICTLY SANITIZED) =====================

router.get('/questions', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const paperRaw = asSafeString(req.query.paper, 20) || 'all';
    const paper = VALID_PAPERS.has(paperRaw) ? (paperRaw as PaperType | 'all') : 'all';

    const subjectsRaw = asSafeString(req.query.subjects, 1000);
    const subjects = subjectsRaw
      ? subjectsRaw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => VALID_SUBJECT_SET.has(s))
      : [];

    const topic = asSafeString(req.query.topic, 160);

    const sourceRaw = asSafeString(req.query.source, 20) || 'all';
    const source = VALID_SOURCES.has(sourceRaw) ? (sourceRaw as QuestionSource | 'all') : 'all';

    const statusRaw = asSafeString(req.query.status, 20) || 'all';
    const status = VALID_STATUSES.has(statusRaw)
      ? (statusRaw as 'all' | 'unattempted' | 'incorrect' | 'bookmarked')
      : 'all';

    const difficultyRaw = asSafeString(req.query.difficulty, 20) || 'all';
    const difficulty = VALID_DIFFICULTIES.has(difficultyRaw)
      ? (difficultyRaw as DifficultyLevel | 'all')
      : 'all';

    const search = asSafeString(req.query.search, 160);
    const page = Number.parseInt(asSafeString(req.query.page, 10) || '1', 10) || 1;
    const limit = Number.parseInt(asSafeString(req.query.limit, 10) || '20', 10) || 20;

    const result = await store.getQuestions({
      paper,
      subjects,
      topic: topic || undefined,
      source,
      status,
      difficulty,
      search: search || undefined,
      page,
      limit,
      userId: req.user?.userId,
    });

    res.json(result);
  } catch (err) {
    console.error('[GET /questions]', err);
    res.status(500).json({ error: 'Failed to fetch questions.' });
  }
});

// ===================== ANSWER SUBMISSION =====================

router.post('/answer', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const questionId = asSafeString(req.body?.questionId, 80);
    const selectedKey = asSafeString(req.body?.selectedKey, 4).toUpperCase() as OptionKey;
    const timeTakenSec = Math.max(0, Math.min(7200, Number(req.body?.timeTakenSec ?? 0) || 0));
    const mode = req.body?.mode === 'mock' ? 'mock' : 'practice';

    if (!questionId || !VALID_OPTIONS.has(selectedKey)) {
      res.status(400).json({ error: 'Valid questionId and selectedKey (A-D) are required.' });
      return;
    }

    const question = await store.getQuestionById(questionId);
    if (!question) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }

    const isCorrect = selectedKey === question.correctKey;

    let attemptSaved = false;
    if (req.user) {
      await store.recordAttempt({
        userId: req.user.userId,
        questionId: question.id,
        selectedKey,
        isCorrect,
        timeTakenSec,
        mode,
      });
      void store.touchUserActivity(req.user.userId, `Practicing ${question.subject}`);
      attemptSaved = true;
    }

    res.json({
      questionId: question.id,
      selectedKey,
      correctKey: question.correctKey,
      isCorrect,
      explanation: question.explanation,
      source: question.source,
      verified: question.verified,
      attemptSaved,
    });
  } catch (err) {
    console.error('[POST /answer]', err);
    res.status(500).json({ error: 'Failed to submit answer.' });
  }
});

// ===================== MOCK TESTS =====================

router.post('/mock/start', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const paperRaw = asSafeString(req.body?.paper, 20);
    const paper: PaperType = paperRaw === 'afternoon' ? 'afternoon' : 'morning';
    const format: 'full' | 'mini' = req.body?.format === 'mini' ? 'mini' : 'full';

    const session = await store.startMockSession({
      paper,
      format,
      userId: req.user?.userId ?? null,
    });

    if (session.questions.length === 0) {
      res.status(404).json({ error: `No questions available for the ${paper} paper yet.` });
      return;
    }

    if (req.user) {
      void store.touchUserActivity(
        req.user.userId,
        `Taking ${paper === 'morning' ? 'Morning' : 'Afternoon'} ${format === 'mini' ? 'Mini ' : ''}Mock Test`
      );
    }

    res.json(session);
  } catch (err) {
    console.error('[POST /mock/start]', err);
    res.status(500).json({ error: 'Failed to start mock test.' });
  }
});

router.post('/mock/submit', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = asSafeString(req.body?.sessionId, 80);
    const totalTimeSec = Math.max(0, Math.min(21600, Number(req.body?.totalTimeSec ?? 0) || 0));
    const rawAnswers = Array.isArray(req.body?.answers) ? req.body.answers : [];

    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required.' });
      return;
    }

    const sanitizedAnswers: Array<{
      questionId: string;
      selectedKey: OptionKey | null;
      timeTakenSec: number;
    }> = rawAnswers.slice(0, 200).map((item: Record<string, unknown>) => {
      const qId = asSafeString(item?.questionId, 80);
      const keyRaw = asSafeString(item?.selectedKey, 4).toUpperCase() as OptionKey;
      return {
        questionId: qId,
        selectedKey: VALID_OPTIONS.has(keyRaw) ? keyRaw : null,
        timeTakenSec: Math.max(0, Math.min(3600, Number(item?.timeTakenSec ?? 0) || 0)),
      };
    });

    const result = await store.submitMockSession({
      sessionId,
      answers: sanitizedAnswers,
      totalTimeSec,
      userId: req.user?.userId ?? null,
    });

    if (req.user) {
      void store.touchUserActivity(req.user.userId, 'Completed Mock Test');
    }

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to grade mock test.';
    res.status(400).json({ error: message });
  }
});

// ===================== GEMINI EXPLAIN & SIMILAR QUESTION =====================

router.post('/explain', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const questionId = asSafeString(req.body?.questionId, 80);
    const selectedRaw = asSafeString(req.body?.selectedKey, 4).toUpperCase() as OptionKey;
    const selectedKey = VALID_OPTIONS.has(selectedRaw) ? selectedRaw : null;
    const modeRaw = asSafeString(req.body?.mode, 20);
    const mode: 'deep' | 'beginner' | 'similar' =
      modeRaw === 'beginner' || modeRaw === 'similar' ? modeRaw : 'deep';

    if (!questionId) {
      res.status(400).json({ error: 'questionId is required.' });
      return;
    }

    const question = await store.getQuestionById(questionId);
    if (!question) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }

    const output = await generateStudyAid({
      subject: question.subject,
      topic: question.topic,
      question: question.question,
      options: question.options,
      correctKey: question.correctKey,
      selectedKey,
      explanation: question.explanation,
      mode,
    });

    res.json(output);
  } catch (err) {
    console.error('[POST /explain]', err);
    const message = err instanceof Error ? err.message : 'Unable to generate explanation right now.';
    res.status(502).json({ error: message });
  }
});

// ===================== USER ANALYTICS STATS =====================

router.get('/stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    void store.touchUserActivity(req.user!.userId, 'Viewing Dashboard');
    const stats = await store.getUserStats(req.user!.userId);
    res.json(stats);
  } catch (err) {
    console.error('[GET /stats]', err);
    res.status(500).json({ error: 'Failed to load analytics.' });
  }
});

// ===================== BOOKMARKS CRUD =====================

router.get('/bookmarks', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    void store.touchUserActivity(req.user!.userId, 'Reviewing Bookmarks');
    const bookmarks = await store.getEnrichedBookmarks(req.user!.userId);
    res.json({ bookmarks });
  } catch (err) {
    console.error('[GET /bookmarks]', err);
    res.status(500).json({ error: 'Failed to load bookmarks.' });
  }
});

router.post('/bookmarks', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const questionId = asSafeString(req.body?.questionId, 80);
    const note = asSafeString(req.body?.note, 2000);
    if (!questionId) {
      res.status(400).json({ error: 'questionId is required.' });
      return;
    }
    const q = await store.getQuestionById(questionId);
    if (!q) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }
    const bookmark = await store.upsertBookmark(req.user!.userId, questionId, note);
    res.status(201).json({ bookmark });
  } catch (err) {
    console.error('[POST /bookmarks]', err);
    res.status(500).json({ error: 'Failed to save bookmark.' });
  }
});

router.patch('/bookmarks/:questionId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const questionId = asSafeString(req.params.questionId, 80);
    const note = asSafeString(req.body?.note, 2000);
    if (!questionId) {
      res.status(400).json({ error: 'questionId is required.' });
      return;
    }
    const bookmark = await store.upsertBookmark(req.user!.userId, questionId, note);
    res.json({ bookmark });
  } catch (err) {
    console.error('[PATCH /bookmarks/:questionId]', err);
    res.status(500).json({ error: 'Failed to update bookmark note.' });
  }
});

router.delete('/bookmarks/:questionId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const questionId = asSafeString(req.params.questionId, 80);
    const deleted = await store.deleteBookmark(req.user!.userId, questionId);
    res.json({ deleted });
  } catch (err) {
    console.error('[DELETE /bookmarks/:questionId]', err);
    res.status(500).json({ error: 'Failed to remove bookmark.' });
  }
});

// ===================== REPORTS CRUD =====================

router.get('/reports', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reports = await store.getReportsForUser(req.user!.userId);
    res.json({ reports });
  } catch (err) {
    console.error('[GET /reports]', err);
    res.status(500).json({ error: 'Failed to load reports.' });
  }
});

router.post('/reports', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const questionId = asSafeString(req.body?.questionId, 80);
    const issue = asSafeString(req.body?.issue, 1000);
    if (!questionId || issue.length < 5) {
      res.status(400).json({ error: 'Please describe the issue (at least 5 characters).' });
      return;
    }
    const q = await store.getQuestionById(questionId);
    if (!q) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }
    const report = await store.createReport({
      userId: req.user?.userId ?? null,
      questionId,
      issue,
    });
    res.status(201).json({ report });
  } catch (err) {
    console.error('[POST /reports]', err);
    res.status(500).json({ error: 'Failed to submit report.' });
  }
});

// ===================== ADMIN AUTH & MANAGEMENT ROUTES =====================

router.get('/admin/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    const claimedHash = await store.getAdminPasscodeHash();
    const configured = envPasscode.length > 0 || Boolean(claimedHash);
    const authenticated = Boolean(verifyAdminBearer(req));
    res.json({
      configured,
      needsClaim: !configured,
      authenticated,
      source: envPasscode.length > 0 ? 'env' : claimedHash ? 'claimed' : 'unclaimed',
    });
  } catch (err) {
    console.error('[GET /admin/status]', err);
    res.status(500).json({ error: 'Failed to check admin status.' });
  }
});

router.post('/admin/claim', async (req, res: Response) => {
  try {
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    if (envPasscode.length > 0) {
      res.status(409).json({ error: 'Admin passcode is already configured via server environment.' });
      return;
    }
    const existingHash = await store.getAdminPasscodeHash();
    if (existingHash) {
      res.status(409).json({ error: 'Admin passcode has already been claimed. Please sign in.' });
      return;
    }
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    if (passcode.length < 8 || passcode.length > 128) {
      res.status(400).json({ error: 'Admin password must be at least 8 characters.' });
      return;
    }

    const hash = await hashPassword(passcode);
    const claimed = await store.claimAdminPasscode(hash);
    if (!claimed) {
      res.status(409).json({ error: 'Admin passcode was already claimed.' });
      return;
    }

    const adminToken = signAdminToken();
    res.status(201).json({ adminToken });
  } catch (err) {
    console.error('[POST /admin/claim]', err);
    res.status(500).json({ error: 'Unable to set up admin access.' });
  }
});

router.post('/admin/login', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Allow signed-in allowlisted ADMIN_EMAILS user directly
    if (req.user && isAdminEmail(req.user.email)) {
      res.json({ adminToken: signAdminToken(req.user.email) });
      return;
    }

    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    if (!passcode) {
      res.status(400).json({ error: 'Admin password is required.' });
      return;
    }

    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    if (envPasscode.length > 0) {
      // Constant-time length-safe verification via bcrypt or timingSafeEqual
      const a = Buffer.from(passcode);
      const b = Buffer.from(envPasscode);
      const ok = a.length === b.length && (await import('crypto')).timingSafeEqual(a, b);
      if (!ok) {
        res.status(401).json({ error: 'Invalid admin password.' });
        return;
      }
      res.json({ adminToken: signAdminToken() });
      return;
    }

    const claimedHash = await store.getAdminPasscodeHash();
    if (!claimedHash) {
      res.status(400).json({ error: 'Admin access has not been initialized yet.' });
      return;
    }

    const ok = await verifyPassword(passcode, claimedHash);
    if (!ok) {
      res.status(401).json({ error: 'Invalid admin password.' });
      return;
    }

    res.json({ adminToken: signAdminToken() });
  } catch (err) {
    console.error('[POST /admin/login]', err);
    res.status(500).json({ error: 'Admin sign-in failed.' });
  }
});

router.get('/admin/flagged', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const subjectRaw = asSafeString(req.query.subject, 120) || 'all';
    const subject =
      subjectRaw === 'all' || VALID_SUBJECT_SET.has(subjectRaw) ? subjectRaw : 'all';
    const page = Number.parseInt(asSafeString(req.query.page, 10) || '1', 10) || 1;
    const limit = Number.parseInt(asSafeString(req.query.limit, 10) || '20', 10) || 20;

    const result = await store.getFlaggedQuestions({ subject, page, limit });
    res.json(result);
  } catch (err) {
    console.error('[GET /admin/flagged]', err);
    res.status(500).json({ error: 'Failed to load flagged questions.' });
  }
});

router.patch('/admin/flagged/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = asSafeString(req.params.id, 80);
    if (!id) {
      res.status(400).json({ error: 'Invalid question ID.' });
      return;
    }

    const body = req.body ?? {};
    const updates: Parameters<typeof store.updateFlaggedQuestion>[1] = {};

    if (typeof body.question === 'string') {
      const q = body.question.trim();
      if (q.length < 15 || q.length > 3000) {
        res.status(400).json({ error: 'Question stem must be between 15 and 3000 characters.' });
        return;
      }
      updates.question = q;
    }

    if (typeof body.topic === 'string' && body.topic.trim()) {
      updates.topic = asSafeString(body.topic, 160);
    }

    if (typeof body.difficulty === 'string' && ['easy', 'medium', 'hard'].includes(body.difficulty)) {
      updates.difficulty = body.difficulty as DifficultyLevel;
    }

    if (typeof body.correctKey === 'string') {
      const key = body.correctKey.trim().toUpperCase() as OptionKey;
      if (!VALID_OPTIONS.has(key)) {
        res.status(400).json({ error: 'correctKey must be A, B, C, or D.' });
        return;
      }
      updates.correctKey = key;
    }

    if (Array.isArray(body.options)) {
      if (body.options.length !== 4) {
        res.status(400).json({ error: 'Exactly 4 options (A-D) are required.' });
        return;
      }
      const parsedOpts = body.options.map((o: Record<string, unknown>) => ({
        key: asSafeString(o?.key, 4).toUpperCase() as OptionKey,
        text: asSafeString(o?.text, 600),
      }));
      if (
        !['A', 'B', 'C', 'D'].every((k) =>
          parsedOpts.some((o: { key: OptionKey; text: string }) => o.key === k && o.text.length > 0)
        )
      ) {
        res.status(400).json({ error: 'All four options A, B, C, and D must have non-empty text.' });
        return;
      }
      updates.options = parsedOpts;
    }

    if (body.explanation && typeof body.explanation === 'object') {
      const e = body.explanation as Record<string, unknown>;
      const w = (e.whyOthersWrong ?? {}) as Record<string, unknown>;
      updates.explanation = {
        whyCorrect: asSafeString(e.whyCorrect, 2500),
        whyOthersWrong: {
          A: asSafeString(w.A, 1000),
          B: asSafeString(w.B, 1000),
          C: asSafeString(w.C, 1000),
          D: asSafeString(w.D, 1000),
        },
        questionConcept: asSafeString(e.questionConcept, 1500),
        highYieldPoint: asSafeString(e.highYieldPoint, 1000),
        mnemonic: asSafeString(e.mnemonic, 500),
      };
    }

    if (body.approve === true) {
      updates.approve = true;
    }

    const updated = await store.updateFlaggedQuestion(id, updates);
    if (!updated) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }

    res.json({ question: updated });
  } catch (err) {
    console.error('[PATCH /admin/flagged/:id]', err);
    res.status(500).json({ error: 'Failed to update flagged question.' });
  }
});

router.post('/admin/flagged/:id/approve', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = asSafeString(req.params.id, 80);
    const updated = await store.updateFlaggedQuestion(id, { approve: true });
    if (!updated) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }
    res.json({ question: updated });
  } catch (err) {
    console.error('[POST /admin/flagged/:id/approve]', err);
    res.status(500).json({ error: 'Failed to approve question.' });
  }
});

router.delete('/admin/flagged/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = asSafeString(req.params.id, 80);
    const deleted = await store.deleteQuestionById(id);
    if (!deleted) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    console.error('[DELETE /admin/flagged/:id]', err);
    res.status(500).json({ error: 'Failed to delete question.' });
  }
});

router.get('/admin/stats', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await store.getAdminBankStats();
    res.json(stats);
  } catch (err) {
    console.error('[GET /admin/stats]', err);
    res.status(500).json({ error: 'Failed to load admin question bank stats.' });
  }
});

router.get('/admin/users', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const search = asSafeString(req.query.search, 120);
    const statusRaw = asSafeString(req.query.status, 20) || 'all';
    const status =
      statusRaw === 'active_now' || statusRaw === 'logged_in' || statusRaw === 'offline'
        ? statusRaw
        : 'all';

    const overview = await store.getAdminUsersOverview({ search, status });
    res.json(overview);
  } catch (err) {
    console.error('[GET /admin/users]', err);
    res.status(500).json({ error: 'Failed to load user activity.' });
  }
});

router.get('/admin/seed/status', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  res.json(bulkSeeder.getStatus());
});

const VALID_AI_PROVIDERS = new Set<AiSeederProvider>(['gemini', 'openai', 'anthropic', 'groq']);

router.post('/admin/seed/start', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await store.getStatus();
    if (status.mode !== 'mongodb') {
      res.status(400).json({ error: 'MongoDB Atlas must be connected to run bulk generation.' });
      return;
    }

    const providerRaw = asSafeString(req.body?.provider, 30).toLowerCase() as AiSeederProvider;
    if (!VALID_AI_PROVIDERS.has(providerRaw)) {
      res
        .status(400)
        .json({ error: 'Select a valid AI provider (gemini, openai, anthropic, or groq).' });
      return;
    }

    const rawApiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
    if (!rawApiKey || rawApiKey.length < 10 || rawApiKey.length > 300) {
      res.status(400).json({ error: 'Enter a valid runtime API key for the chosen AI provider.' });
      return;
    }

    const rawModel = asSafeString(req.body?.model, 80);
    const model =
      rawModel && /^[a-zA-Z0-9._:-]+$/.test(rawModel)
        ? rawModel
        : PROVIDER_DEFAULT_MODELS[providerRaw];

    const modeRaw = asSafeString(req.body?.mode, 20) || 'all';
    const mode: SeederMode =
      modeRaw === 'pyq_only' || modeRaw === 'ai_only' ? modeRaw : 'all';

    const subjectRaw = asSafeString(req.body?.subject, 120) || 'all';
    const subject =
      subjectRaw === 'all' || VALID_SUBJECT_SET.has(subjectRaw) ? subjectRaw : 'all';

    const continuous = req.body?.continuous !== false;

    const rawLimit = req.body?.limit;
    const parsedLimit =
      !continuous && typeof rawLimit === 'number' && Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(25000, Math.floor(rawLimit))
        : null;

    const rawConc = Number(req.body?.concurrency);
    const concurrency = Number.isFinite(rawConc)
      ? Math.max(1, Math.min(8, Math.floor(rawConc)))
      : 4;

    const result = await bulkSeeder.start({
      provider: providerRaw,
      model,
      apiKey: rawApiKey,
      mode,
      subject,
      continuous,
      limit: parsedLimit,
      concurrency,
    });

    if (!result.ok) {
      res.status(409).json({ error: result.message });
      return;
    }
    res.status(202).json({ ...result, status: bulkSeeder.getStatus() });
  } catch (err) {
    console.error('[POST /admin/seed/start]', err);
    res.status(500).json({ error: 'Failed to start bulk generation.' });
  }
});

router.post('/admin/seed/stop', requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const result = bulkSeeder.stop();
  res.json({ ...result, status: bulkSeeder.getStatus() });
});

router.post(
  '/admin/import-json/check-hashes',
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const hashes = req.body?.hashes;
      if (!Array.isArray(hashes)) {
        res.status(400).json({ error: 'Provide a "hashes" array of SHA-256 hex strings.' });
        return;
      }
      if (hashes.length > 1000) {
        res.status(400).json({ error: 'Maximum 1,000 hashes per check request.' });
        return;
      }
      const validHex = hashes.filter(
        (h): h is string => typeof h === 'string' && /^[a-f0-9]{64}$/i.test(h)
      );
      const existingHashes = await store.findExistingQuestionHashes(
        validHex.map((h) => h.toLowerCase())
      );
      res.json({ existingHashes });
    } catch (err) {
      console.error('[POST /admin/import-json/check-hashes]', err);
      res.status(500).json({ error: 'Failed to check existing question hashes.' });
    }
  }
);

router.post('/admin/import-json', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawList = req.body?.questions;
    if (!Array.isArray(rawList) || rawList.length === 0) {
      res.status(400).json({ error: 'Provide a non-empty "questions" JSON array.' });
      return;
    }
    if (rawList.length > 250) {
      res.status(400).json({
        error: 'Maximum 250 questions per request batch. Split larger files into chunks of 200.',
      });
      return;
    }

    const rawDefaultSource = asSafeString(req.body?.defaultSource, 20) || 'auto';
    const defaultSource: 'auto' | QuestionSource =
      rawDefaultSource === 'pyq' || rawDefaultSource === 'ai_generated'
        ? rawDefaultSource
        : 'auto';

    const rawYear = req.body?.defaultPyqYear;
    const defaultPyqYear =
      typeof rawYear === 'number' && Number.isInteger(rawYear) && rawYear >= 2005 && rawYear <= 2030
        ? rawYear
        : null;

    const prepared = prepareJsonImportBatch(rawList, { defaultSource, defaultPyqYear });
    const dbResult = await store.importQuestionsBulk(prepared.validDocs);

    res.status(200).json({
      received: rawList.length,
      inserted: dbResult.inserted,
      duplicatesSkipped: prepared.intraBatchDuplicates + dbResult.duplicatesSkipped,
      invalidSkipped: prepared.errors.length,
      errors: prepared.errors.slice(0, 15),
    });
  } catch (err) {
    console.error('[POST /admin/import-json]', err);
    res.status(500).json({ error: 'Failed to import JSON questions.' });
  }
});

export default router;
