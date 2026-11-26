import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IQuestion extends Document {
  paper: 'morning' | 'afternoon';
  subject: string;
  topic: string;
  question: string;
  questionHash: string;
  options: Array<{ key: 'A' | 'B' | 'C' | 'D'; text: string }>;
  correctKey: 'A' | 'B' | 'C' | 'D';
  explanation: {
    whyCorrect: string;
    whyOthersWrong: {
      A: string;
      B: string;
      C: string;
      D: string;
    };
    questionConcept: string;
    highYieldPoint: string;
    mnemonic?: string;
  };
  difficulty: 'easy' | 'medium' | 'hard';
  source: 'pyq' | 'ai_generated';
  pyqYear: number | null;
  verified: boolean;
  flagged?: boolean;
  flagReason?: string;
  verifyCheckedAt?: Date | null;
  tags: string[];
  createdAt: Date;
}

const QuestionSchema = new Schema<IQuestion>(
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
    verifyCheckedAt: { type: Date, default: null },
    tags: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'questions' }
);

// Text index on question stem for keyword search
QuestionSchema.index({ question: 'text', topic: 'text', tags: 'text' });

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  lastLoginAt?: Date | null;
  lastLogoutAt?: Date | null;
  lastActiveAt?: Date | null;
  lastActivity?: string;
  loginCount?: number;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    lastLoginAt: { type: Date, default: null, index: true },
    lastLogoutAt: { type: Date, default: null },
    lastActiveAt: { type: Date, default: null, index: true },
    lastActivity: { type: String, default: '' },
    loginCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'users' }
);

export interface IAttempt extends Document {
  userId: mongoose.Types.ObjectId;
  questionId: mongoose.Types.ObjectId;
  selectedKey: 'A' | 'B' | 'C' | 'D';
  isCorrect: boolean;
  timeTakenSec: number;
  mode: 'practice' | 'mock';
  mockSessionId?: string;
  createdAt: Date;
}

const AttemptSchema = new Schema<IAttempt>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true, index: true },
    selectedKey: { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
    isCorrect: { type: Boolean, required: true },
    timeTakenSec: { type: Number, default: 0 },
    mode: { type: String, enum: ['practice', 'mock'], default: 'practice' },
    mockSessionId: { type: String, default: undefined },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { collection: 'attempts' }
);

export interface IBookmark extends Document {
  userId: mongoose.Types.ObjectId;
  questionId: mongoose.Types.ObjectId;
  note: string;
  createdAt: Date;
}

const BookmarkSchema = new Schema<IBookmark>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    note: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'bookmarks' }
);
BookmarkSchema.index({ userId: 1, questionId: 1 }, { unique: true });

export interface IReport extends Document {
  userId: mongoose.Types.ObjectId | null;
  questionId: mongoose.Types.ObjectId;
  issue: string;
  createdAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true, index: true },
    issue: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'reports' }
);

export interface ISeedProgress extends Document {
  subject: string;
  topic: string;
  generated: number;
  target: number;
  updatedAt: Date;
}

const SeedProgressSchema = new Schema<ISeedProgress>(
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

export interface IAdminConfig extends Document {
  key: string;
  passcodeHash: string;
  createdAt: Date;
}

const AdminConfigSchema = new Schema<IAdminConfig>(
  {
    key: { type: String, required: true, unique: true },
    passcodeHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'admin_config' }
);

export const QuestionModel: Model<IQuestion> =
  mongoose.models.Question || mongoose.model<IQuestion>('Question', QuestionSchema);
export const UserModel: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
export const AttemptModel: Model<IAttempt> =
  mongoose.models.Attempt || mongoose.model<IAttempt>('Attempt', AttemptSchema);
export const BookmarkModel: Model<IBookmark> =
  mongoose.models.Bookmark || mongoose.model<IBookmark>('Bookmark', BookmarkSchema);
export const ReportModel: Model<IReport> =
  mongoose.models.Report || mongoose.model<IReport>('Report', ReportSchema);
export const SeedProgressModel: Model<ISeedProgress> =
  mongoose.models.SeedProgress || mongoose.model<ISeedProgress>('SeedProgress', SeedProgressSchema);
export const AdminConfigModel: Model<IAdminConfig> =
  mongoose.models.AdminConfig || mongoose.model<IAdminConfig>('AdminConfig', AdminConfigSchema);
