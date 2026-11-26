import type {
  AdminBankStatsResponse,
  AdminStatusResponse,
  AdminUsersResponse,
  AiSeederProvider,
  AnswerSubmissionResult,
  AuthUser,
  BookmarkItem,
  DifficultyLevel,
  FlaggedQuestionItem,
  JsonImportBatchResponse,
  MockResultResponse,
  MockStartResponse,
  OptionKey,
  PaperType,
  PublicQuestion,
  QuestionExplanation,
  QuestionOption,
  QuestionSource,
  SeederMode,
  SeederStatusSnapshot,
  SimilarQuestionData,
  SubjectsSummary,
  UserStatsResponse,
} from '../types.ts';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string | null;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`,
      res.status
    );
  }
  return data as T;
}

export const api = {
  getSubjects: () => request<SubjectsSummary>('/api/subjects'),

  register: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: { email, password },
    }),

  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    }),

  logout: (token: string) =>
    request<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
      token,
    }),

  sendHeartbeat: (token: string, activity: string) =>
    request<{ ok: boolean }>('/api/auth/heartbeat', {
      method: 'POST',
      body: { activity },
      token,
    }),

  getQuestions: (
    params: {
      paper?: PaperType | 'all';
      subjects?: string[];
      topic?: string;
      source?: QuestionSource | 'all';
      status?: 'all' | 'unattempted' | 'incorrect' | 'bookmarked';
      difficulty?: DifficultyLevel | 'all';
      search?: string;
      page?: number;
      limit?: number;
    },
    token?: string | null
  ) => {
    const qs = new URLSearchParams();
    if (params.paper && params.paper !== 'all') qs.set('paper', params.paper);
    if (params.subjects && params.subjects.length > 0) qs.set('subjects', params.subjects.join(','));
    if (params.topic) qs.set('topic', params.topic);
    if (params.source && params.source !== 'all') qs.set('source', params.source);
    if (params.status && params.status !== 'all') qs.set('status', params.status);
    if (params.difficulty && params.difficulty !== 'all') qs.set('difficulty', params.difficulty);
    if (params.search) qs.set('search', params.search);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));

    return request<{
      questions: PublicQuestion[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/api/questions?${qs.toString()}`, { token });
  },

  submitAnswer: (
    payload: {
      questionId: string;
      selectedKey: OptionKey;
      timeTakenSec: number;
      mode: 'practice' | 'mock';
    },
    token?: string | null
  ) =>
    request<AnswerSubmissionResult>('/api/answer', {
      method: 'POST',
      body: payload,
      token,
    }),

  explainQuestion: (
    payload: {
      questionId: string;
      selectedKey?: OptionKey | null;
      mode: 'deep' | 'beginner' | 'similar';
    },
    token?: string | null
  ) =>
    request<
      | { mode: 'deep' | 'beginner'; content: string }
      | { mode: 'similar'; similarQuestion: SimilarQuestionData }
    >('/api/explain', {
      method: 'POST',
      body: payload,
      token,
    }),

  startMock: (payload: { paper: PaperType; format: 'full' | 'mini' }, token?: string | null) =>
    request<MockStartResponse>('/api/mock/start', {
      method: 'POST',
      body: payload,
      token,
    }),

  submitMock: (
    payload: {
      sessionId: string;
      answers: Array<{ questionId: string; selectedKey: OptionKey | null; timeTakenSec: number }>;
      totalTimeSec: number;
    },
    token?: string | null
  ) =>
    request<MockResultResponse>('/api/mock/submit', {
      method: 'POST',
      body: payload,
      token,
    }),

  getStats: (token: string) => request<UserStatsResponse>('/api/stats', { token }),

  getBookmarks: (token: string) => request<{ bookmarks: BookmarkItem[] }>('/api/bookmarks', { token }),

  saveBookmark: (questionId: string, note: string, token: string) =>
    request<{ bookmark: { id: string; questionId: string; note: string } }>('/api/bookmarks', {
      method: 'POST',
      body: { questionId, note },
      token,
    }),

  updateBookmarkNote: (questionId: string, note: string, token: string) =>
    request<{ bookmark: { id: string; questionId: string; note: string } }>(
      `/api/bookmarks/${encodeURIComponent(questionId)}`,
      {
        method: 'PATCH',
        body: { note },
        token,
      }
    ),

  deleteBookmark: (questionId: string, token: string) =>
    request<{ deleted: boolean }>(`/api/bookmarks/${encodeURIComponent(questionId)}`, {
      method: 'DELETE',
      token,
    }),

  reportQuestion: (questionId: string, issue: string, token?: string | null) =>
    request<{ report: { id: string } }>('/api/reports', {
      method: 'POST',
      body: { questionId, issue },
      token,
    }),

  // Admin endpoints
  getAdminStatus: (adminToken?: string | null) =>
    request<AdminStatusResponse>('/api/admin/status', { token: adminToken }),

  claimAdminPasscode: (passcode: string) =>
    request<{ adminToken: string }>('/api/admin/claim', {
      method: 'POST',
      body: { passcode },
    }),

  loginAdmin: (passcode: string, userToken?: string | null) =>
    request<{ adminToken: string }>('/api/admin/login', {
      method: 'POST',
      body: { passcode },
      token: userToken,
    }),

  getFlaggedQuestions: (
    params: { subject?: string; page?: number; limit?: number },
    adminToken: string
  ) => {
    const qs = new URLSearchParams();
    if (params.subject && params.subject !== 'all') qs.set('subject', params.subject);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    return request<{
      questions: FlaggedQuestionItem[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/api/admin/flagged?${qs.toString()}`, { token: adminToken });
  },

  updateFlaggedQuestion: (
    id: string,
    payload: {
      question?: string;
      topic?: string;
      difficulty?: DifficultyLevel;
      options?: QuestionOption[];
      correctKey?: OptionKey;
      explanation?: QuestionExplanation;
      approve?: boolean;
    },
    adminToken: string
  ) =>
    request<{ question: FlaggedQuestionItem }>(`/api/admin/flagged/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: payload,
      token: adminToken,
    }),

  approveFlaggedQuestion: (id: string, adminToken: string) =>
    request<{ question: FlaggedQuestionItem }>(
      `/api/admin/flagged/${encodeURIComponent(id)}/approve`,
      {
        method: 'POST',
        token: adminToken,
      }
    ),

  deleteFlaggedQuestion: (id: string, adminToken: string) =>
    request<{ deleted: boolean }>(`/api/admin/flagged/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      token: adminToken,
    }),

  getAdminBankStats: (adminToken: string) =>
    request<AdminBankStatsResponse>('/api/admin/stats', { token: adminToken }),

  getAdminUsers: (
    params: { search?: string; status?: 'all' | 'active_now' | 'logged_in' | 'offline' },
    adminToken: string
  ) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.status && params.status !== 'all') qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<AdminUsersResponse>(`/api/admin/users${suffix}`, { token: adminToken });
  },

  getAdminSeedStatus: (adminToken: string) =>
    request<SeederStatusSnapshot>('/api/admin/seed/status', { token: adminToken }),

  startAdminSeed: (
    payload: {
      provider: AiSeederProvider;
      model?: string;
      apiKey: string;
      mode: SeederMode;
      subject: string;
      continuous: boolean;
      limit: number | null;
      concurrency?: number;
    },
    adminToken: string
  ) =>
    request<{ ok: boolean; message: string; status: SeederStatusSnapshot }>('/api/admin/seed/start', {
      method: 'POST',
      body: payload,
      token: adminToken,
    }),

  stopAdminSeed: (adminToken: string) =>
    request<{ ok: boolean; message: string; status: SeederStatusSnapshot }>('/api/admin/seed/stop', {
      method: 'POST',
      token: adminToken,
    }),

  checkAdminQuestionHashes: (hashes: string[], adminToken: string) =>
    request<{ existingHashes: string[] }>('/api/admin/import-json/check-hashes', {
      method: 'POST',
      body: { hashes },
      token: adminToken,
    }),

  importAdminJsonBatch: (
    payload: {
      questions: unknown[];
      defaultSource?: 'auto' | QuestionSource;
      defaultPyqYear?: number | null;
    },
    adminToken: string
  ) =>
    request<JsonImportBatchResponse>('/api/admin/import-json', {
      method: 'POST',
      body: payload,
      token: adminToken,
    }),
};
