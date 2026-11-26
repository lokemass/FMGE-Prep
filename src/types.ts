export type PaperType = 'morning' | 'afternoon';
export type OptionKey = 'A' | 'B' | 'C' | 'D';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type QuestionSource = 'pyq' | 'ai_generated';

export interface QuestionOption {
  key: OptionKey;
  text: string;
}

export interface QuestionExplanation {
  whyCorrect: string;
  whyOthersWrong: Record<OptionKey, string>;
  questionConcept: string;
  highYieldPoint: string;
  mnemonic?: string;
}

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

export interface GradedQuestion extends PublicQuestion {
  correctKey: OptionKey;
  explanation: QuestionExplanation;
}

export interface AnswerSubmissionResult {
  questionId: string;
  selectedKey: OptionKey;
  correctKey: OptionKey;
  isCorrect: boolean;
  explanation: QuestionExplanation;
  source: QuestionSource;
  verified: boolean;
  attemptSaved: boolean;
}

export interface SimilarQuestionData {
  question: string;
  options: QuestionOption[];
  correctKey: OptionKey;
  explanation: {
    whyCorrect: string;
    whyOthersWrong: Record<OptionKey, string>;
    questionConcept: string;
    highYieldPoint: string;
    mnemonic: string;
  };
}

export interface SubjectInfo {
  name: string;
  shortName: string;
  paper: PaperType;
  examWeight: number;
  questionCount: number;
  pyqCount: number;
  topics: Array<{ name: string; count: number }>;
}

export interface SubjectsSummary {
  mode: 'mongodb' | 'memory';
  note: string;
  totalQuestions: number;
  subjects: SubjectInfo[];
}

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface BookmarkItem {
  id: string;
  questionId: string;
  note: string;
  createdAt: string;
  question: PublicQuestion;
}

export interface MockStartResponse {
  sessionId: string;
  paper: PaperType;
  format: 'full' | 'mini';
  targetCount: number;
  durationSec: number;
  questions: PublicQuestion[];
}

export interface MockResultResponse {
  sessionId: string;
  paper: PaperType;
  format: 'full' | 'mini';
  totalQuestions: number;
  attemptedCount: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  accuracyPct: number;
  scaledPaperScore: number;
  passMarkCombined: number;
  totalCombined: number;
  passedPaperBenchmark: boolean;
  totalTimeSec: number;
  subjectBreakdown: Array<{
    subject: string;
    total: number;
    attempted: number;
    correct: number;
    accuracyPct: number;
  }>;
  review: Array<{
    question: GradedQuestion;
    selectedKey: OptionKey | null;
    isCorrect: boolean;
  }>;
}

export interface UserStatsResponse {
  totalAttempted: number;
  totalCorrect: number;
  accuracyPct: number;
  dailyStreak: number;
  totalTimeSec: number;
  bookmarksCount: number;
  bestMorningScaled: number;
  bestAfternoonScaled: number;
  combinedMockEstimate: number;
  subjectPerformance: Array<{
    subject: string;
    shortName: string;
    paper: PaperType;
    attempted: number;
    correct: number;
    accuracyPct: number;
  }>;
  weakTopics: Array<{
    subject: string;
    topic: string;
    attempted: number;
    correct: number;
    accuracyPct: number;
  }>;
}

export interface LocalGuestAttempt {
  questionId: string;
  subject: string;
  topic: string;
  paper: PaperType;
  isCorrect: boolean;
  timeTakenSec: number;
  mode: 'practice' | 'mock';
  timestamp: number;
}

export interface PracticeLaunchPreset {
  paper?: PaperType | 'all';
  subjects?: string[];
  topic?: string;
  search?: string;
  status?: 'all' | 'unattempted' | 'incorrect' | 'bookmarked';
}

export interface AdminStatusResponse {
  configured: boolean;
  needsClaim: boolean;
  authenticated: boolean;
  source: 'env' | 'claimed' | 'unclaimed';
}

export interface FlaggedQuestionItem extends GradedQuestion {
  flagged?: boolean;
  flagReason?: string;
}

export interface AdminSubjectQuotaStat {
  subject: string;
  paper: PaperType;
  target: number;
  total: number;
  active: number;
  flagged: number;
  verified: number;
  pyq: number;
  aiGenerated: number;
  completionPct: number;
  topicCount: number;
  topics: Array<{
    topic: string;
    current: number;
    target: number;
  }>;
}

export interface AdminBankStatsResponse {
  mode: 'mongodb' | 'memory';
  dbName?: string;
  note: string;
  targetTotal: number;
  total: number;
  active: number;
  flagged: number;
  verified: number;
  pyq: number;
  aiGenerated: number;
  morningActive: number;
  morningTarget: number;
  afternoonActive: number;
  afternoonTarget: number;
  overallCompletionPct: number;
  subjects: AdminSubjectQuotaStat[];
}

export type AiSeederProvider = 'gemini' | 'openai' | 'anthropic' | 'groq';
export type SeederMode = 'all' | 'pyq_only' | 'ai_only';

export interface RecentGeneratedPreview {
  subject: string;
  topic: string;
  question: string;
  correctKey: OptionKey;
  source: QuestionSource;
  pyqYear: number | null;
}

export interface SeederStatusSnapshot {
  running: boolean;
  stopping: boolean;
  provider?: AiSeederProvider | 'none';
  model?: string;
  continuous?: boolean;
  round?: number;
  mode: SeederMode;
  subjectFilter: string;
  limit: number | null;
  concurrency: number;
  insertedThisRun: number;
  pyqInsertedThisRun: number;
  aiInsertedThisRun: number;
  dbTotal: number;
  targetTotal: number;
  currentTask: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorCount: number;
  lastError: string | null;
  recentLogs: string[];
  recentGenerated?: RecentGeneratedPreview[];
}

export interface AdminUserActivityItem {
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

export interface AdminUsersResponse {
  mode: 'mongodb' | 'memory';
  dbName?: string;
  summary: {
    totalUsers: number;
    activeNow: number;
    loggedInToday: number;
    totalAttempts: number;
  };
  users: AdminUserActivityItem[];
}

export interface JsonImportBatchResponse {
  received: number;
  inserted: number;
  duplicatesSkipped: number;
  invalidSkipped: number;
  errors: Array<{ index: number; reason: string }>;
}
