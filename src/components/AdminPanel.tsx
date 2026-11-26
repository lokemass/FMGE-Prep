import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Eye,
  EyeOff,
  Flag,
  KeyRound,
  Loader2,
  Lock,
  Play,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Square,
  Trash2,
  Users,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import { BulkJsonUploadCard } from './BulkJsonUploadCard.tsx';
import type {
  AdminBankStatsResponse,
  AdminStatusResponse,
  AdminUsersResponse,
  AiSeederProvider,
  DifficultyLevel,
  FlaggedQuestionItem,
  OptionKey,
  SeederMode,
  SeederStatusSnapshot,
  SubjectInfo,
} from '../types.ts';

interface AdminPanelProps {
  route: 'flagged' | 'stats' | 'users';
  subjects: SubjectInfo[];
  userToken: string | null;
  adminToken: string | null;
  onAdminTokenChange: (token: string | null) => void;
  onNavigate: (path: string) => void;
  onBankMutated: () => void;
}

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D'];

const AI_PROVIDER_OPTIONS: Array<{
  id: AiSeederProvider;
  label: string;
  defaultModel: string;
  modelPresets: string[];
  keyPlaceholder: string;
}> = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-4-hydrogen',
    modelPresets: ['gemini-4-hydrogen', 'gemini-2.5-flash', 'gemini-2.5-pro'],
    keyPlaceholder: 'AIza...',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-6-luna',
    modelPresets: ['gpt-6-luna', 'gpt-4o-mini', 'gpt-4o'],
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    defaultModel: 'claude-3-5-haiku-latest',
    modelPresets: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'],
    keyPlaceholder: 'sk-ant-...',
  },
  {
    id: 'groq',
    label: 'Groq (Llama)',
    defaultModel: 'llama-3.3-70b-versatile',
    modelPresets: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    keyPlaceholder: 'gsk_...',
  },
];

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AdminPanel({
  route,
  subjects,
  userToken,
  adminToken,
  onAdminTokenChange,
  onNavigate,
  onBankMutated,
}: AdminPanelProps) {
  const [status, setStatus] = useState<AdminStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Flagged queue state
  const [flaggedSubject, setFlaggedSubject] = useState<string>('all');
  const [flaggedList, setFlaggedList] = useState<FlaggedQuestionItem[]>([]);
  const [flaggedTotal, setFlaggedTotal] = useState(0);
  const [flaggedLoading, setFlaggedLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<FlaggedQuestionItem | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Admin bank stats state
  const [bankStats, setBankStats] = useState<AdminBankStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  // Admin bulk generator state (runtime key held strictly in component memory)
  const [seedStatus, setSeedStatus] = useState<SeederStatusSnapshot | null>(null);
  const [seedProvider, setSeedProvider] = useState<AiSeederProvider>('openai');
  const [seedModel, setSeedModel] = useState<string>('gpt-6-luna');
  const [seedApiKey, setSeedApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [seedMode, setSeedMode] = useState<SeederMode>('all');
  const [seedSubject, setSeedSubject] = useState<string>('all');
  const [seedRunMode, setSeedRunMode] = useState<string>('continuous');
  const [seedBusy, setSeedBusy] = useState(false);

  // Admin users & activity state
  const [usersData, setUsersData] = useState<AdminUsersResponse | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<
    'all' | 'active_now' | 'logged_in' | 'offline'
  >('all');

  const effectiveToken = adminToken || userToken;

  const checkStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await api.getAdminStatus(effectiveToken);
      setStatus(res);
    } catch {
      setStatus({ configured: false, needsClaim: true, authenticated: false, source: 'unclaimed' });
    } finally {
      setStatusLoading(false);
    }
  }, [effectiveToken]);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const loadFlagged = useCallback(async () => {
    if (!effectiveToken || !status?.authenticated) return;
    setFlaggedLoading(true);
    try {
      const res = await api.getFlaggedQuestions(
        { subject: flaggedSubject, page: 1, limit: 30 },
        effectiveToken
      );
      setFlaggedList(res.questions);
      setFlaggedTotal(res.total);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to load flagged questions.');
    } finally {
      setFlaggedLoading(false);
    }
  }, [effectiveToken, status?.authenticated, flaggedSubject]);

  const loadStats = useCallback(async (silent = false) => {
    if (!effectiveToken || !status?.authenticated) return;
    if (!silent) setStatsLoading(true);
    try {
      const [statsRes, seedRes] = await Promise.all([
        api.getAdminBankStats(effectiveToken),
        api.getAdminSeedStatus(effectiveToken),
      ]);
      setBankStats(statsRes);
      setSeedStatus(seedRes);
    } catch (err) {
      if (!silent) {
        setActionMessage(err instanceof Error ? err.message : 'Failed to load question bank stats.');
      }
    } finally {
      if (!silent) setStatsLoading(false);
    }
  }, [effectiveToken, status?.authenticated]);

  const loadUsers = useCallback(
    async (silent = false) => {
      if (!effectiveToken || !status?.authenticated) return;
      if (!silent) setUsersLoading(true);
      try {
        const res = await api.getAdminUsers(
          { search: userSearch.trim() || undefined, status: userStatusFilter },
          effectiveToken
        );
        setUsersData(res);
      } catch (err) {
        if (!silent) {
          setActionMessage(err instanceof Error ? err.message : 'Failed to load user activity.');
        }
      } finally {
        if (!silent) setUsersLoading(false);
      }
    },
    [effectiveToken, status?.authenticated, userSearch, userStatusFilter]
  );

  useEffect(() => {
    if (!status?.authenticated) return;
    if (route === 'flagged') {
      void loadFlagged();
    } else if (route === 'users') {
      void loadUsers();
    } else {
      void loadStats();
    }
  }, [route, status?.authenticated, loadFlagged, loadStats, loadUsers]);

  // Poll live generator progress every 4 seconds while running
  useEffect(() => {
    if (route !== 'stats' || !status?.authenticated || !seedStatus?.running || !effectiveToken) {
      return;
    }
    const timer = window.setInterval(() => {
      void loadStats(true);
      onBankMutated();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [route, status?.authenticated, seedStatus?.running, effectiveToken, loadStats, onBankMutated]);

  // Auto-refresh live user activity every 15 seconds while viewing /admin/users
  useEffect(() => {
    if (route !== 'users' || !status?.authenticated || !effectiveToken) return;
    const timer = window.setInterval(() => {
      void loadUsers(true);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [route, status?.authenticated, effectiveToken, loadUsers]);

  function handleProviderChange(nextProvider: AiSeederProvider) {
    setSeedProvider(nextProvider);
    const cfg = AI_PROVIDER_OPTIONS.find((p) => p.id === nextProvider);
    if (cfg) {
      setSeedModel(cfg.defaultModel);
    }
  }

  async function handleStartBulkSeed() {
    if (!effectiveToken) return;
    const trimmedKey = seedApiKey.trim();
    if (trimmedKey.length < 10) {
      setActionMessage('Please enter a valid API key for the selected AI provider before starting.');
      return;
    }
    setSeedBusy(true);
    setActionMessage(null);
    try {
      const continuous = seedRunMode === 'continuous';
      const numericLimit =
        continuous || seedRunMode === 'quota' ? null : Number(seedRunMode);
      const res = await api.startAdminSeed(
        {
          provider: seedProvider,
          model: seedModel.trim() || undefined,
          apiKey: trimmedKey,
          mode: seedMode,
          subject: seedSubject,
          continuous,
          limit: numericLimit,
          concurrency: 4,
        },
        effectiveToken
      );
      setSeedStatus(res.status);
      setActionMessage(res.message);
      // Clear key from React input immediately once handed off to the running server job
      setSeedApiKey('');
      setShowApiKey(false);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to start AI generation.');
    } finally {
      setSeedBusy(false);
    }
  }

  async function handleStopBulkSeed() {
    if (!effectiveToken) return;
    setSeedBusy(true);
    try {
      const res = await api.stopAdminSeed(effectiveToken);
      setSeedStatus(res.status);
      setActionMessage(res.message);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to stop generation.');
    } finally {
      setSeedBusy(false);
    }
  }

  async function handleAdminAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    if (status?.needsClaim) {
      if (passcode.trim().length < 8) {
        setAuthError('Please choose an admin password of at least 8 characters.');
        return;
      }
      if (passcode !== confirmPasscode) {
        setAuthError('Passwords do not match.');
        return;
      }
    }
    setAuthSubmitting(true);
    try {
      const res = status?.needsClaim
        ? await api.claimAdminPasscode(passcode)
        : await api.loginAdmin(passcode, userToken);
      onAdminTokenChange(res.adminToken);
      setPasscode('');
      setConfirmPasscode('');
      setStatus((prev) =>
        prev ? { ...prev, configured: true, needsClaim: false, authenticated: true } : prev
      );
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Admin authentication failed.');
    } finally {
      setAuthSubmitting(false);
    }
  }

  function startEditing(q: FlaggedQuestionItem) {
    setEditingId(q.id);
    setEditDraft(JSON.parse(JSON.stringify(q)) as FlaggedQuestionItem);
  }

  async function handleQuickApprove(id: string) {
    if (!effectiveToken) return;
    setActionBusyId(id);
    setActionMessage(null);
    try {
      await api.approveFlaggedQuestion(id, effectiveToken);
      setFlaggedList((prev) => prev.filter((q) => q.id !== id));
      setFlaggedTotal((n) => Math.max(0, n - 1));
      if (editingId === id) {
        setEditingId(null);
        setEditDraft(null);
      }
      setActionMessage('Question approved and restored to Practice & Mock Tests.');
      onBankMutated();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleSaveEdit(approveAfterSave: boolean) {
    if (!effectiveToken || !editDraft) return;
    setActionBusyId(editDraft.id);
    setActionMessage(null);
    try {
      const res = await api.updateFlaggedQuestion(
        editDraft.id,
        {
          question: editDraft.question,
          topic: editDraft.topic,
          difficulty: editDraft.difficulty,
          options: editDraft.options,
          correctKey: editDraft.correctKey,
          explanation: editDraft.explanation,
          approve: approveAfterSave,
        },
        effectiveToken
      );

      if (approveAfterSave) {
        setFlaggedList((prev) => prev.filter((q) => q.id !== editDraft.id));
        setFlaggedTotal((n) => Math.max(0, n - 1));
        setActionMessage('Edits saved and question approved into active question bank.');
      } else {
        setFlaggedList((prev) => prev.map((q) => (q.id === editDraft.id ? res.question : q)));
        setActionMessage('Draft edits saved (question remains flagged for review).');
      }
      setEditingId(null);
      setEditDraft(null);
      onBankMutated();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to save edits.');
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!effectiveToken) return;
    setActionBusyId(id);
    setActionMessage(null);
    try {
      await api.deleteFlaggedQuestion(id, effectiveToken);
      setFlaggedList((prev) => prev.filter((q) => q.id !== id));
      setFlaggedTotal((n) => Math.max(0, n - 1));
      if (editingId === id) {
        setEditingId(null);
        setEditDraft(null);
      }
      setActionMessage('Flagged question deleted permanently.');
      onBankMutated();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setActionBusyId(null);
    }
  }

  // ===================== ADMIN GATE (FIRST-RUN CLAIM OR SIGN-IN) =====================
  if (statusLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
        <span>Checking admin authorization...</span>
      </div>
    );
  }

  if (!status?.authenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="mb-6 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to FMGE Prep</span>
        </button>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 flex items-center justify-center text-teal-700 dark:text-teal-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {status?.needsClaim ? 'Set Up Admin Access' : 'Admin Sign-In'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {status?.needsClaim
                  ? 'Create a one-time admin password (or set ADMIN_PASSCODE in server env).'
                  : 'Verify admin password to review flagged questions and bank quotas.'}
              </p>
            </div>
          </div>

          <form onSubmit={handleAdminAuthSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="admin-passcode"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                {status?.needsClaim ? 'Choose Admin Password' : 'Admin Password'}
              </label>
              <input
                id="admin-passcode"
                type="password"
                required
                minLength={status?.needsClaim ? 8 : 1}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder={status?.needsClaim ? 'Minimum 8 characters' : 'Enter admin password'}
                className="w-full h-11 px-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:ring-teal-400"
              />
            </div>

            {status?.needsClaim && (
              <div>
                <label
                  htmlFor="admin-passcode-confirm"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Confirm Admin Password
                </label>
                <input
                  id="admin-passcode-confirm"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPasscode}
                  onChange={(e) => setConfirmPasscode(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full h-11 px-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:ring-teal-400"
                />
              </div>
            )}

            {authError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300"
              >
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full h-11 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {authSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{status?.needsClaim ? 'Claim Admin Access' : 'Unlock Admin Tools'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ===================== AUTHENTICATED ADMIN WORKSPACE =====================
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
      {/* Admin Sub-Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1 mb-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to FMGE Prep</span>
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
            {route === 'flagged'
              ? 'Flagged Question Review'
              : route === 'users'
                ? 'Active & Logged-In Users'
                : 'Question Bank & AI Generator'}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {route === 'flagged'
              ? 'Questions flagged by the second-pass verifier are excluded from Practice & Mock Tests until reviewed.'
              : route === 'users'
                ? 'Monitor learners currently signed in, live activity, and overall practice engagement.'
                : 'Live subject coverage, Bulk JSON upload, and on-demand AI question generation.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => onNavigate('/admin/stats')}
              className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                route === 'stats'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Quota &amp; AI</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/admin/users')}
              className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                route === 'users'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Users</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/admin/flagged')}
              className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                route === 'flagged'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Flag className="w-3.5 h-3.5" />
              <span>Flagged</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setSeedApiKey('');
              setShowApiKey(false);
              onAdminTokenChange(null);
              setStatus((prev) => (prev ? { ...prev, authenticated: false } : prev));
            }}
            className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Lock Admin
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          role="status"
          className="px-4 py-3 rounded-xl bg-teal-50 dark:bg-teal-950/35 border border-teal-200 dark:border-teal-800 text-sm text-teal-900 dark:text-teal-200 flex items-center justify-between gap-3"
        >
          <span>{actionMessage}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-xs font-semibold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ===================== VIEW 1: /admin/flagged ===================== */}
      {route === 'flagged' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-600 dark:text-slate-400 font-mono tabular-nums">
              {flaggedTotal} flagged {flaggedTotal === 1 ? 'question' : 'questions'} awaiting review
            </div>

            <select
              value={flaggedSubject}
              onChange={(e) => setFlaggedSubject(e.target.value)}
              aria-label="Filter flagged questions by subject"
              className="h-10 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="all">All 19 Subjects</option>
              {subjects.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {flaggedLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-8">
              <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
              <span>Loading flagged queue...</span>
            </div>
          ) : flaggedList.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
              <ShieldCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                All clear — no flagged questions
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                Run <code className="font-mono text-xs">node scripts/verify-pass.js</code> after bulk generation to automatically flag any answer discrepancies here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {flaggedList.map((item) => {
                const isEditing = editingId === item.id && editDraft !== null;
                const busy = actionBusyId === item.id;

                return (
                  <article
                    key={item.id}
                    className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4"
                  >
                    {/* Metadata */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.subject}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.topic}</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{item.paper} Paper</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono font-semibold text-red-600 dark:text-red-400">
                          Stored Key: {item.correctKey}
                        </span>
                      </div>

                      {!isEditing && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => startEditing(item)}
                            className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleQuickApprove(item.id)}
                            className="h-9 px-3.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {busy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            <span>Approve As-Is</span>
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDelete(item.id)}
                            aria-label="Delete flagged question"
                            className="h-9 px-2.5 rounded-lg border border-red-200 dark:border-red-900/70 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Flag Reason */}
                    {item.flagReason && (
                      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/70 text-xs leading-relaxed text-amber-950 dark:text-amber-200">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                        <div>
                          <span className="font-semibold">Flag Reason: </span>
                          <span>{item.flagReason}</span>
                        </div>
                      </div>
                    )}

                    {isEditing && editDraft ? (
                      <div className="space-y-4 pt-1">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Question Stem
                          </label>
                          <textarea
                            rows={3}
                            value={editDraft.question}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, question: e.target.value })
                            }
                            className="w-full p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {editDraft.options.map((opt, idx) => (
                            <div key={opt.key}>
                              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Option {opt.key}
                              </label>
                              <input
                                type="text"
                                value={opt.text}
                                onChange={(e) => {
                                  const next = [...editDraft.options];
                                  next[idx] = { ...opt, text: e.target.value };
                                  setEditDraft({ ...editDraft, options: next });
                                }}
                                className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100"
                              />
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              Correct Key
                            </label>
                            <select
                              value={editDraft.correctKey}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  correctKey: e.target.value as OptionKey,
                                })
                              }
                              className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono font-semibold text-slate-900 dark:text-slate-100"
                            >
                              {OPTION_KEYS.map((k) => (
                                <option key={k} value={k}>
                                  Option {k}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              Difficulty
                            </label>
                            <select
                              value={editDraft.difficulty}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  difficulty: e.target.value as DifficultyLevel,
                                })
                              }
                              className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm capitalize text-slate-900 dark:text-slate-100"
                            >
                              <option value="easy">Easy</option>
                              <option value="medium">Medium</option>
                              <option value="hard">Hard</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              Topic
                            </label>
                            <input
                              type="text"
                              value={editDraft.topic}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, topic: e.target.value })
                              }
                              className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Why Correct
                          </label>
                          <textarea
                            rows={2}
                            value={editDraft.explanation.whyCorrect}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                explanation: { ...editDraft.explanation, whyCorrect: e.target.value },
                              })
                            }
                            className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {OPTION_KEYS.map((k) => (
                            <div key={k}>
                              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Option {k} Rationale
                              </label>
                              <input
                                type="text"
                                value={editDraft.explanation.whyOthersWrong[k] ?? ''}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    explanation: {
                                      ...editDraft.explanation,
                                      whyOthersWrong: {
                                        ...editDraft.explanation.whyOthersWrong,
                                        [k]: e.target.value,
                                      },
                                    },
                                  })
                                }
                                className="w-full h-9 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                              />
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              Core Concept Tested
                            </label>
                            <input
                              type="text"
                              value={editDraft.explanation.questionConcept}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  explanation: {
                                    ...editDraft.explanation,
                                    questionConcept: e.target.value,
                                  },
                                })
                              }
                              className="w-full h-9 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              High-Yield Takeaway
                            </label>
                            <input
                              type="text"
                              value={editDraft.explanation.highYieldPoint}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  explanation: {
                                    ...editDraft.explanation,
                                    highYieldPoint: e.target.value,
                                  },
                                })
                              }
                              className="w-full h-9 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditDraft(null);
                            }}
                            className="h-10 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleSaveEdit(false)}
                            className="h-10 px-4 rounded-lg border border-teal-600 text-teal-800 dark:text-teal-300 text-xs font-semibold inline-flex items-center gap-1.5"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>Save Draft</span>
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleSaveEdit(true)}
                            className="h-10 px-5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {busy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            <span>Save &amp; Approve</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-[15px] leading-relaxed font-medium text-slate-900 dark:text-slate-100">
                          {item.question}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {item.options.map((o) => (
                            <div
                              key={o.key}
                              className={`p-2.5 rounded-lg border text-xs ${
                                o.key === item.correctKey
                                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 text-emerald-950 dark:text-emerald-100 font-medium'
                                  : 'bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <span className="font-mono font-semibold mr-1.5">{o.key}.</span>
                              <span>{o.text}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            Stored explanation:{' '}
                          </span>
                          {item.explanation.whyCorrect}
                        </p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================== VIEW 2: /admin/stats ===================== */}
      {route === 'stats' && (
        <div className="space-y-6">
          {statsLoading || !bankStats ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-8">
              <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
              <span>Loading question bank quota stats...</span>
            </div>
          ) : (
            <>
              {/* 4-Column Summary KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Active Bank vs Target</p>
                  <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {bankStats.active.toLocaleString()} / {bankStats.targetTotal.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs font-mono tabular-nums text-teal-700 dark:text-teal-400">
                    {bankStats.overallCompletionPct}% of 10,100 quota
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Morning / Afternoon</p>
                  <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {bankStats.morningActive.toLocaleString()} / {bankStats.afternoonActive.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    Targets: {bankStats.morningTarget.toLocaleString()} / {bankStats.afternoonTarget.toLocaleString()}
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Verified / PYQ</p>
                  <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    {bankStats.verified.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    PYQ: {bankStats.pyq.toLocaleString()} · AI: {bankStats.aiGenerated.toLocaleString()}
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Flagged (Excluded)</p>
                  <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                    {bankStats.flagged.toLocaleString()}
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('/admin/flagged')}
                    className="mt-1 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    Open review queue
                  </button>
                </div>
              </div>

              {/* Bulk JSON Upload (Zero API Calls) */}
              {effectiveToken && (
                <BulkJsonUploadCard
                  adminToken={effectiveToken}
                  dbName={bankStats.dbName || 'fmge_prep'}
                  onImportComplete={() => {
                    void loadStats(true);
                    onBankMutated();
                  }}
                />
              )}

              {/* On-Demand Multi-Provider AI Question Generator (Continuous Until Stopped) */}
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Database className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                      <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        On-Demand AI Question Generator
                      </h2>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        DB: {bankStats.dbName || 'fmge_prep'}
                      </span>
                      {seedStatus?.running && seedStatus.provider && seedStatus.provider !== 'none' && (
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300">
                          Running: {seedStatus.provider.toUpperCase()} ({seedStatus.model || 'default'})
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      Choose any AI provider and supply a runtime API key to continuously generate verified-format FMGE MCQs with answers and 5-part explanations until you click Stop. Keys are never stored in code, secrets, or database.
                    </p>
                  </div>

                  {seedStatus?.running ? (
                    <button
                      type="button"
                      disabled={seedBusy || seedStatus.stopping}
                      onClick={handleStopBulkSeed}
                      className="h-10 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>{seedStatus.stopping ? 'Stopping...' : 'Stop Generation'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={seedBusy || bankStats.mode !== 'mongodb' || seedApiKey.trim().length < 10}
                      onClick={handleStartBulkSeed}
                      className="h-10 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {seedBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      <span>Start Generation</span>
                    </button>
                  )}
                </div>

                {/* Provider, Model, and Ephemeral Runtime Key Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      AI Provider
                    </label>
                    <select
                      value={seedProvider}
                      disabled={seedStatus?.running}
                      onChange={(e) => handleProviderChange(e.target.value as AiSeederProvider)}
                      className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 disabled:opacity-60"
                    >
                      {AI_PROVIDER_OPTIONS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Model ID
                    </label>
                    <input
                      type="text"
                      list={`models-${seedProvider}`}
                      value={seedModel}
                      disabled={seedStatus?.running}
                      onChange={(e) => setSeedModel(e.target.value)}
                      placeholder={
                        AI_PROVIDER_OPTIONS.find((p) => p.id === seedProvider)?.defaultModel || ''
                      }
                      className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 disabled:opacity-60"
                    />
                    <datalist id={`models-${seedProvider}`}>
                      {(
                        AI_PROVIDER_OPTIONS.find((p) => p.id === seedProvider)?.modelPresets || []
                      ).map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 inline-flex items-center gap-1">
                      <KeyRound className="w-3 h-3" />
                      <span>Runtime API Key (Not Saved)</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={seedApiKey}
                        disabled={seedStatus?.running}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(e) => setSeedApiKey(e.target.value)}
                        placeholder={
                          seedStatus?.running
                            ? 'Active in server memory until stopped'
                            : AI_PROVIDER_OPTIONS.find((p) => p.id === seedProvider)
                                ?.keyPlaceholder || 'Enter provider API key'
                        }
                        className="w-full h-10 pl-3 pr-9 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 disabled:opacity-60"
                      />
                      {!seedStatus?.running && (
                        <button
                          type="button"
                          onClick={() => setShowApiKey((v) => !v)}
                          aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          {showApiKey ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Mix, Subject Scope, and Run Mode Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Question Mix
                    </label>
                    <select
                      value={seedMode}
                      disabled={seedStatus?.running}
                      onChange={(e) => setSeedMode(e.target.value as SeederMode)}
                      className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 disabled:opacity-60"
                    >
                      <option value="all">Full Mix: FMGE PYQs (20%) + AI MCQs (80%)</option>
                      <option value="pyq_only">FMGE Previous Year Questions Only (2018–2025)</option>
                      <option value="ai_only">AI-Generated Clinical MCQs Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Subject Scope
                    </label>
                    <select
                      value={seedSubject}
                      disabled={seedStatus?.running}
                      onChange={(e) => setSeedSubject(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 disabled:opacity-60"
                    >
                      <option value="all">All 19 FMGE Subjects (Balanced Rotation)</option>
                      {subjects.map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Run Behavior
                    </label>
                    <select
                      value={seedRunMode}
                      disabled={seedStatus?.running}
                      onChange={(e) => setSeedRunMode(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 disabled:opacity-60"
                    >
                      <option value="continuous">Continuous (Generate Until Stopped)</option>
                      <option value="quota">Fill Remaining Quota (to 10,100)</option>
                      <option value="1000">1,000 Questions Batch</option>
                      <option value="200">200 Questions Batch</option>
                      <option value="50">50 Questions Quick Test</option>
                    </select>
                  </div>
                </div>

                {seedStatus &&
                  (seedStatus.running ||
                    seedStatus.insertedThisRun > 0 ||
                    seedStatus.recentLogs.length > 0 ||
                    seedStatus.lastError) && (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5">
                          {seedStatus.running && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                          )}
                          <span>{seedStatus.currentTask}</span>
                        </span>
                        <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          Added this run: +{seedStatus.insertedThisRun.toLocaleString()} (PYQ:{' '}
                          {seedStatus.pyqInsertedThisRun.toLocaleString()}, AI:{' '}
                          {seedStatus.aiInsertedThisRun.toLocaleString()})
                        </span>
                      </div>

                      {seedStatus.lastError && (
                        <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-900/70 text-xs text-amber-900 dark:text-amber-200">
                          {seedStatus.lastError}
                        </div>
                      )}

                      {seedStatus.recentGenerated && seedStatus.recentGenerated.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Latest Saved Questions &amp; Answers
                          </div>
                          <div className="space-y-1.5">
                            {seedStatus.recentGenerated.slice(0, 4).map((g, idx) => (
                              <div
                                key={`${idx}-${g.question.slice(0, 20)}`}
                                className="flex items-start justify-between gap-3 text-xs bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-lg px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <div className="text-[11px] font-medium text-teal-700 dark:text-teal-400">
                                    {g.subject} · {g.source === 'pyq' ? `PYQ ${g.pyqYear ?? ''}` : 'AI MCQ'}
                                  </div>
                                  <div className="text-slate-700 dark:text-slate-300 truncate">
                                    {g.question}
                                  </div>
                                </div>
                                <span className="shrink-0 font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                                  Ans: {g.correctKey}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {seedStatus.recentLogs.length > 0 && (
                        <div className="max-h-32 overflow-y-auto font-mono text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 space-y-0.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                          {seedStatus.recentLogs.slice(0, 10).map((line, i) => (
                            <div key={i} className="truncate">
                              {line}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
              </div>

              {/* Subject-by-Subject Quota Table */}
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Per-Subject Count vs Target Quota (19 Subjects)
                  </h2>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Click any row to inspect topic-level syllabus targets
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/40">
                        <th className="py-3 px-4 font-semibold">Subject</th>
                        <th className="py-3 px-3 font-semibold">Paper</th>
                        <th className="py-3 px-3 font-semibold text-right">Active</th>
                        <th className="py-3 px-3 font-semibold text-right">Target</th>
                        <th className="py-3 px-3 font-semibold w-44">Progress</th>
                        <th className="py-3 px-3 font-semibold text-right">Verified</th>
                        <th className="py-3 px-4 font-semibold text-right">Flagged</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {bankStats.subjects.map((sub) => {
                        const expanded = expandedSubject === sub.subject;
                        return (
                          <React.Fragment key={sub.subject}>
                            <tr
                              onClick={() =>
                                setExpandedSubject(expanded ? null : sub.subject)
                              }
                              className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                            >
                              <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                                <div className="flex items-center gap-2">
                                  {expanded ? (
                                    <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  )}
                                  <span>{sub.subject}</span>
                                </div>
                              </td>
                              <td className="py-3 px-3 text-xs capitalize text-slate-600 dark:text-slate-400">
                                {sub.paper}
                              </td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                                {sub.active.toLocaleString()}
                              </td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                                {sub.target.toLocaleString()}
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-teal-600 dark:bg-teal-400"
                                      style={{ width: `${Math.min(100, sub.completionPct)}%` }}
                                    />
                                  </div>
                                  <span className="font-mono tabular-nums text-xs text-slate-600 dark:text-slate-400 w-12 text-right">
                                    {sub.completionPct}%
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                                {sub.verified.toLocaleString()}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400">
                                {sub.flagged.toLocaleString()}
                              </td>
                            </tr>

                            {expanded && (
                              <tr className="bg-slate-50/80 dark:bg-slate-950/60">
                                <td colSpan={7} className="px-6 py-4">
                                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                                    {sub.subject} Syllabus Topics ({sub.topicCount} topics)
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                                    {sub.topics.map((t) => (
                                      <div
                                        key={t.topic}
                                        className="flex items-center justify-between gap-3 text-xs py-1 border-b border-slate-200/60 dark:border-slate-800/70"
                                      >
                                        <span className="text-slate-700 dark:text-slate-300 truncate">
                                          {t.topic}
                                        </span>
                                        <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400 shrink-0">
                                          {t.current}/{t.target}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ===================== VIEW 3: /admin/users ===================== */}
      {route === 'users' && (
        <div className="space-y-6">
          {usersLoading && !usersData ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-8">
              <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
              <span>Loading learner accounts &amp; live sessions...</span>
            </div>
          ) : (
            <>
              {/* 4 Summary KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Total Registered Users
                  </div>
                  <div className="mt-1 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {(usersData?.summary.totalUsers ?? 0).toLocaleString()}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    DB: {usersData?.dbName || 'fmge_prep'}
                  </div>
                </div>

                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Active Now (Last 5m)</span>
                  </div>
                  <div className="mt-1 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    {(usersData?.summary.activeNow ?? 0).toLocaleString()}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Currently studying in app
                  </div>
                </div>

                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Logged In (24h)
                  </div>
                  <div className="mt-1 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-teal-700 dark:text-teal-400">
                    {(usersData?.summary.loggedInToday ?? 0).toLocaleString()}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Active sessions today
                  </div>
                </div>

                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Total Learner Attempts
                  </div>
                  <div className="mt-1 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {(usersData?.summary.totalAttempts ?? 0).toLocaleString()}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Practice &amp; mock submissions
                  </div>
                </div>
              </div>

              {/* Filter Toolbar & Users Activity Table */}
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Search by email..."
                        className="h-9 pl-8 pr-3 w-56 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <select
                      value={userStatusFilter}
                      onChange={(e) =>
                        setUserStatusFilter(
                          e.target.value as 'all' | 'active_now' | 'logged_in' | 'offline'
                        )
                      }
                      aria-label="Filter users by online status"
                      className="h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="all">All Statuses</option>
                      <option value="active_now">Active Now</option>
                      <option value="logged_in">Logged In (24h)</option>
                      <option value="offline">Offline / Signed Out</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => void loadUsers(false)}
                    disabled={usersLoading}
                    className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${usersLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {!usersData || usersData.users.length === 0 ? (
                  <div className="p-10 text-center space-y-2">
                    <Users className="w-8 h-8 text-slate-400 mx-auto" />
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      No matching users found
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Registered learners who sign in and practice MCQs will appear here with live activity and accuracy stats.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/40">
                          <th className="py-3 px-4 font-semibold">User</th>
                          <th className="py-3 px-3 font-semibold">Session Status</th>
                          <th className="py-3 px-3 font-semibold">Current / Last Activity</th>
                          <th className="py-3 px-3 font-semibold">Last Login</th>
                          <th className="py-3 px-3 font-semibold text-right">Attempts</th>
                          <th className="py-3 px-3 font-semibold text-right">Accuracy</th>
                          <th className="py-3 px-4 font-semibold text-right">Bookmarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {usersData.users.map((u) => (
                          <tr
                            key={u.id}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                {u.email}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                Joined{' '}
                                {new Date(u.createdAt).toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </div>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              {u.status === 'active_now' ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                  <span>Active Now</span>
                                </span>
                              ) : u.status === 'logged_in' ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-400">
                                  <span className="w-2 h-2 rounded-full bg-teal-500" />
                                  <span>Logged In</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                  <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                                  <span>Offline</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <div className="inline-flex items-center gap-1.5 text-xs text-slate-800 dark:text-slate-200">
                                <Activity className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="truncate max-w-[220px]">{u.lastActivity}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                {formatRelativeTime(u.lastActiveAt)}
                              </div>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="text-xs text-slate-700 dark:text-slate-300">
                                {formatRelativeTime(u.lastLoginAt)}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                {u.loginCount} {u.loginCount === 1 ? 'login' : 'logins'}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-slate-900 dark:text-slate-100">
                              <div className="font-semibold">
                                {u.totalAttempts.toLocaleString()}
                              </div>
                              {u.mockAttempts > 0 && (
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {u.mockAttempts} mock
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {u.totalAttempts > 0 ? `${u.accuracyPct}%` : '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600 dark:text-slate-400">
                              {u.bookmarksCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
