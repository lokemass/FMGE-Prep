import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flag,
  Loader2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import type {
  AnswerSubmissionResult,
  AuthUser,
  DifficultyLevel,
  LocalGuestAttempt,
  OptionKey,
  PaperType,
  PracticeLaunchPreset,
  PublicQuestion,
  QuestionSource,
  SubjectInfo,
} from '../types.ts';
import { ExplanationPanel } from './ExplanationPanel.tsx';

interface PracticeViewProps {
  subjects: SubjectInfo[];
  token: string | null;
  user: AuthUser | null;
  preset: PracticeLaunchPreset | null;
  onClearPreset: () => void;
  onOpenAuth: () => void;
  onRecordGuestAttempt: (attempt: LocalGuestAttempt) => void;
  onDataChanged: () => void;
}

const KEY_TO_OPTION: Record<string, OptionKey> = {
  a: 'A',
  b: 'B',
  c: 'C',
  d: 'D',
  '1': 'A',
  '2': 'B',
  '3': 'C',
  '4': 'D',
};

export function PracticeView({
  subjects,
  token,
  user,
  preset,
  onClearPreset,
  onOpenAuth,
  onRecordGuestAttempt,
  onDataChanged,
}: PracticeViewProps) {
  // Filter state
  const [paper, setPaper] = useState<PaperType | 'all'>('all');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [topic, setTopic] = useState<string>('');
  const [source, setSource] = useState<QuestionSource | 'all'>('all');
  const [status, setStatus] = useState<'all' | 'unattempted' | 'incorrect' | 'bookmarked'>('all');
  const [difficulty, setDifficulty] = useState<DifficultyLevel | 'all'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  // Mobile filter drawer
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Question list & current question
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Per-question answer results keyed by questionId
  const [answersByQId, setAnswersByQId] = useState<Record<string, AnswerSubmissionResult>>({});
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const questionStartTimeRef = useRef<number>(Date.now());

  // Bookmark note UI
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [bookmarkSaving, setBookmarkSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Report modal state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Apply external preset (e.g. clicking a weak topic in Dashboard or a bookmark)
  useEffect(() => {
    if (!preset) return;
    setPaper(preset.paper ?? 'all');
    setSelectedSubjects(preset.subjects ?? []);
    setTopic(preset.topic ?? '');
    setSearchInput(preset.search ?? '');
    setDebouncedSearch(preset.search ?? '');
    setStatus(preset.status ?? 'all');
    setSource('all');
    setDifficulty('all');
    setPage(1);
    setCurrentIndex(0);
    onClearPreset();
  }, [preset, onClearPreset]);

  // Debounce search input
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // Show temporary toast
  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  // Available subjects filtered by chosen paper
  const visibleSubjects = useMemo(() => {
    if (paper === 'all') return subjects;
    return subjects.filter((s) => s.paper === paper);
  }, [subjects, paper]);

  // Available topics based on selected subjects (or paper)
  const availableTopics = useMemo(() => {
    const relevant =
      selectedSubjects.length > 0
        ? subjects.filter((s) => selectedSubjects.includes(s.name))
        : visibleSubjects;
    const topicSet = new Map<string, number>();
    for (const s of relevant) {
      for (const t of s.topics) {
        topicSet.set(t.name, (topicSet.get(t.name) ?? 0) + t.count);
      }
    }
    return Array.from(topicSet.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [subjects, selectedSubjects, visibleSubjects]);

  // Fetch questions from backend (strictly sanitized — no correctKey or explanation!)
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setFetchError(null);
      try {
        const res = await api.getQuestions(
          {
            paper,
            subjects: selectedSubjects,
            topic: topic || undefined,
            source,
            status,
            difficulty,
            search: debouncedSearch || undefined,
            page,
            limit: 20,
          },
          token
        );
        if (!active) return;
        setQuestions(res.questions);
        setTotal(res.total);
        setTotalPages(Math.max(1, res.totalPages));
        setCurrentIndex(0);
        questionStartTimeRef.current = Date.now();
      } catch (err) {
        if (!active) return;
        setFetchError(err instanceof Error ? err.message : 'Unable to load questions.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [paper, selectedSubjects, topic, source, status, difficulty, debouncedSearch, page, token]);

  const currentQuestion = questions[currentIndex] ?? null;
  const currentAnswer = currentQuestion ? answersByQId[currentQuestion.id] ?? null : null;

  // Reset per-question timer and bookmark note draft whenever currentQuestion changes
  useEffect(() => {
    questionStartTimeRef.current = Date.now();
    setNoteOpen(false);
    setNoteDraft(currentQuestion?.bookmarkNote ?? '');
  }, [currentQuestion?.id]);

  const handleSelectOption = useCallback(
    async (key: OptionKey) => {
      if (!currentQuestion || currentAnswer || submittingAnswer) return;
      setSubmittingAnswer(true);
      const elapsedSec = Math.max(1, Math.round((Date.now() - questionStartTimeRef.current) / 1000));
      try {
        const result = await api.submitAnswer(
          {
            questionId: currentQuestion.id,
            selectedKey: key,
            timeTakenSec: elapsedSec,
            mode: 'practice',
          },
          token
        );
        setAnswersByQId((prev) => ({ ...prev, [currentQuestion.id]: result }));
        if (!user) {
          onRecordGuestAttempt({
            questionId: currentQuestion.id,
            subject: currentQuestion.subject,
            topic: currentQuestion.topic,
            paper: currentQuestion.paper,
            isCorrect: result.isCorrect,
            timeTakenSec: elapsedSec,
            mode: 'practice',
            timestamp: Date.now(),
          });
        } else {
          onDataChanged();
        }
      } catch (err) {
        flashToast(err instanceof Error ? err.message : 'Failed to submit answer.');
      } finally {
        setSubmittingAnswer(false);
      }
    },
    [currentQuestion, currentAnswer, submittingAnswer, token, user, onRecordGuestAttempt, onDataChanged, flashToast]
  );

  const handleNext = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else if (page < totalPages) {
      setPage((p) => p + 1);
    }
  }, [currentIndex, questions.length, page, totalPages]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    } else if (page > 1) {
      setPage((p) => p - 1);
    }
  }, [currentIndex, page]);

  // Keyboard shortcuts: A-D or 1-4 to answer, N for next
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (reportOpen || e.metaKey || e.ctrlKey || e.altKey) return;

      const lower = e.key.toLowerCase();
      if (KEY_TO_OPTION[lower]) {
        if (currentQuestion && !currentAnswer) {
          e.preventDefault();
          void handleSelectOption(KEY_TO_OPTION[lower]);
        }
      } else if (lower === 'n') {
        if (questions.length > 0) {
          e.preventDefault();
          handleNext();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentQuestion, currentAnswer, handleSelectOption, handleNext, questions.length, reportOpen]);

  function toggleSubject(name: string) {
    setPage(1);
    setTopic('');
    setSelectedSubjects((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    );
  }

  function resetAllFilters() {
    setPaper('all');
    setSelectedSubjects([]);
    setTopic('');
    setSource('all');
    setStatus('all');
    setDifficulty('all');
    setSearchInput('');
    setDebouncedSearch('');
    setPage(1);
  }

  async function handleToggleBookmark() {
    if (!currentQuestion) return;
    if (!token) {
      onOpenAuth();
      flashToast('Sign in to bookmark questions and save personal notes.');
      return;
    }
    setBookmarkSaving(true);
    try {
      if (currentQuestion.bookmarked) {
        await api.deleteBookmark(currentQuestion.id, token);
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === currentQuestion.id ? { ...q, bookmarked: false, bookmarkNote: '' } : q
          )
        );
        setNoteOpen(false);
        setNoteDraft('');
        flashToast('Bookmark removed.');
      } else {
        await api.saveBookmark(currentQuestion.id, noteDraft, token);
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === currentQuestion.id ? { ...q, bookmarked: true, bookmarkNote: noteDraft } : q
          )
        );
        setNoteOpen(true);
        flashToast('Question bookmarked.');
      }
      onDataChanged();
    } catch (err) {
      flashToast(err instanceof Error ? err.message : 'Unable to update bookmark.');
    } finally {
      setBookmarkSaving(false);
    }
  }

  async function handleSaveNote() {
    if (!currentQuestion || !token) return;
    setBookmarkSaving(true);
    try {
      await api.saveBookmark(currentQuestion.id, noteDraft, token);
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === currentQuestion.id ? { ...q, bookmarked: true, bookmarkNote: noteDraft } : q
        )
      );
      flashToast('Personal note saved.');
      onDataChanged();
    } catch (err) {
      flashToast(err instanceof Error ? err.message : 'Unable to save note.');
    } finally {
      setBookmarkSaving(false);
    }
  }

  async function handleSubmitReport(e: React.FormEvent) {
    e.preventDefault();
    if (!currentQuestion) return;
    setReportError(null);
    setReportSubmitting(true);
    try {
      await api.reportQuestion(currentQuestion.id, reportText, token);
      setReportOpen(false);
      setReportText('');
      flashToast('Thank you — question issue reported for editorial review.');
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Could not submit report.');
    } finally {
      setReportSubmitting(false);
    }
  }

  const activeFilterCount =
    (paper !== 'all' ? 1 : 0) +
    selectedSubjects.length +
    (topic ? 1 : 0) +
    (source !== 'all' ? 1 : 0) +
    (status !== 'all' ? 1 : 0) +
    (difficulty !== 'all' ? 1 : 0) +
    (debouncedSearch ? 1 : 0);

  const filterPanelContent = (
    <div className="space-y-6">
      {/* Keyword Search */}
      <div>
        <label
          htmlFor="practice-search"
          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2"
        >
          Keyword Search
        </label>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="practice-search"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="e.g. Nikolsky, PICA, NTEP..."
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:ring-teal-400"
          />
        </div>
      </div>

      {/* Paper Selector */}
      <div>
        <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
          FMGE Paper
        </span>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
          {(['all', 'morning', 'afternoon'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPaper(p);
                setSelectedSubjects([]);
                setTopic('');
                setPage(1);
              }}
              className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                paper === p
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {p === 'all' ? 'All Papers' : p === 'morning' ? 'Morning' : 'Afternoon'}
            </button>
          ))}
        </div>
      </div>

      {/* Subject Multi-Select */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Subjects ({selectedSubjects.length || 'All'})
          </span>
          {selectedSubjects.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelectedSubjects([]);
                setTopic('');
                setPage(1);
              }}
              className="text-xs text-teal-700 dark:text-teal-400 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
        <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
          {visibleSubjects.map((subj) => {
            const checked = selectedSubjects.includes(subj.name);
            return (
              <label
                key={subj.name}
                className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-xs transition-colors ${
                  checked
                    ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-950 dark:text-teal-100 font-medium'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSubject(subj.name)}
                    className="rounded border-slate-300 dark:border-slate-600 text-teal-700 focus:ring-teal-600"
                  />
                  <span className="truncate">{subj.name}</span>
                </span>
                <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                  {subj.questionCount}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Topic Selector */}
      <div>
        <label
          htmlFor="practice-topic"
          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2"
        >
          Topic (Optional)
        </label>
        <select
          id="practice-topic"
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value);
            setPage(1);
          }}
          className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:ring-teal-400"
        >
          <option value="">All Topics</option>
          {availableTopics.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name} ({t.count})
            </option>
          ))}
        </select>
      </div>

      {/* Source Filter */}
      <div>
        <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
          Question Source
        </span>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
          {(
            [
              ['all', 'All'],
              ['pyq', 'PYQ Only'],
              ['ai_generated', 'AI Bank'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => {
                setSource(val);
                setPage(1);
              }}
              className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                source === val
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Status Filter */}
      <div>
        <label
          htmlFor="practice-status"
          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2"
        >
          Attempt Status
        </label>
        <select
          id="practice-status"
          value={status}
          onChange={(e) => {
            const val = e.target.value as 'all' | 'unattempted' | 'incorrect' | 'bookmarked';
            if ((val === 'incorrect' || val === 'bookmarked') && !token) {
              onOpenAuth();
              flashToast('Sign in to filter by previously incorrect or bookmarked questions.');
              return;
            }
            setStatus(val);
            setPage(1);
          }}
          className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:ring-teal-400"
        >
          <option value="all">All Questions</option>
          <option value="unattempted">Unattempted</option>
          <option value="incorrect">Previously Incorrect</option>
          <option value="bookmarked">Bookmarked</option>
        </select>
      </div>

      {/* Difficulty Filter */}
      <div>
        <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
          Difficulty
        </span>
        <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
          {(['all', 'easy', 'medium', 'hard'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDifficulty(d);
                setPage(1);
              }}
              className={`py-1.5 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap ${
                difficulty === d
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={resetAllFilters}
          className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset All Filters
        </button>
      )}
    </div>
  );

  const globalQuestionNumber = (page - 1) * 20 + currentIndex + 1;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-20 md:bottom-6 right-4 z-50 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-sm font-medium shadow-lg"
        >
          {toast}
        </div>
      )}

      {/* Mobile Top Controls Bar */}
      <div className="lg:hidden flex items-center justify-between gap-3 mb-4">
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-medium text-slate-800 dark:text-slate-100 inline-flex items-center gap-2"
        >
          <SlidersHorizontal className="w-4 h-4 text-teal-700 dark:text-teal-400" />
          <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
        </button>
        <div className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
          {total > 0 ? `${globalQuestionNumber} / ${total} MCQs` : '0 MCQs'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Desktop Filter Rail */}
        <aside className="hidden lg:block lg:col-span-4 xl:col-span-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sticky top-20">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Practice Filters
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {total} matched
            </span>
          </div>
          {filterPanelContent}
        </aside>

        {/* Focused Single-Question Stage */}
        <section className="lg:col-span-8 xl:col-span-9 space-y-4">
          {loading ? (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-5 animate-pulse">
              <div className="h-4 w-56 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="space-y-2">
                <div className="h-5 w-full rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-5 w-5/6 rounded bg-slate-200 dark:bg-slate-800" />
              </div>
              <div className="space-y-3 pt-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-14 w-full rounded-xl bg-slate-100 dark:bg-slate-800/70" />
                ))}
              </div>
            </div>
          ) : fetchError ? (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/70 p-8 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Could not load questions
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">{fetchError}</p>
            </div>
          ) : !currentQuestion ? (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 sm:p-12 text-center space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                No questions match these filters
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                Try broadening your selected subject, topic, or difficulty filter—or reset to view all available FMGE questions.
              </p>
              <button
                type="button"
                onClick={resetAllFilters}
                className="h-11 px-5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-semibold text-sm transition-colors"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <article className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-8">
              {/* Top Question Metadata Strip (Zero-Pill Clean Typography) */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-mono font-semibold text-teal-800 dark:text-teal-300 tabular-nums">
                    Q{globalQuestionNumber}/{total}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-slate-900 dark:text-slate-200">
                    {currentQuestion.subject}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{currentQuestion.topic}</span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">
                    {currentQuestion.paper} Paper
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">{currentQuestion.difficulty}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-slate-800 dark:text-slate-300">
                    {currentQuestion.source === 'pyq'
                      ? `FMGE PYQ${currentQuestion.pyqYear ? ` ${currentQuestion.pyqYear}` : ''}`
                      : 'AI-Generated'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={bookmarkSaving}
                    onClick={handleToggleBookmark}
                    title={currentQuestion.bookmarked ? 'Remove bookmark' : 'Bookmark question'}
                    className={`min-h-[40px] px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      currentQuestion.bookmarked
                        ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {currentQuestion.bookmarked ? (
                      <BookmarkCheck className="w-4 h-4" />
                    ) : (
                      <Bookmark className="w-4 h-4" />
                    )}
                    <span>{currentQuestion.bookmarked ? 'Bookmarked' : 'Bookmark'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReportOpen(true);
                      setReportError(null);
                    }}
                    title="Report wrong question"
                    className="min-h-[40px] px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Report</span>
                  </button>
                </div>
              </div>

              {/* Inline Bookmark Note Editor */}
              {(noteOpen || currentQuestion.bookmarked) && token && (
                <div className="mt-4 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="bookmark-note-input"
                      className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Personal Study Note
                    </label>
                    <button
                      type="button"
                      disabled={bookmarkSaving}
                      onClick={handleSaveNote}
                      className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline disabled:opacity-50"
                    >
                      {bookmarkSaving ? 'Saving...' : 'Save Note'}
                    </button>
                  </div>
                  <textarea
                    id="bookmark-note-input"
                    rows={2}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Add a revision reminder, textbook page, or personal mnemonic..."
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:ring-teal-400"
                  />
                </div>
              )}

              {/* Question Stem */}
              <div className="mt-6">
                <h2 className="text-[17px] sm:text-[18px] leading-[1.65] font-medium text-slate-900 dark:text-slate-100 max-w-3xl">
                  {currentQuestion.question}
                </h2>
              </div>

              {/* 4 Options (A-D) */}
              <div className="mt-6 space-y-3" role="radiogroup" aria-label="Answer options">
                {currentQuestion.options.map((opt, idx) => {
                  const answered = Boolean(currentAnswer);
                  const isCorrectOpt = answered && currentAnswer!.correctKey === opt.key;
                  const isPickedWrong =
                    answered &&
                    currentAnswer!.selectedKey === opt.key &&
                    currentAnswer!.correctKey !== opt.key;

                  let containerClasses =
                    'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-teal-600 dark:hover:border-teal-400 hover:bg-slate-50/70 dark:hover:bg-slate-800/50 text-slate-900 dark:text-slate-100';
                  let keyBadgeClasses =
                    'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';

                  if (isCorrectOpt) {
                    containerClasses =
                      'bg-emerald-50 dark:bg-emerald-950/35 border-emerald-500 dark:border-emerald-500 text-emerald-950 dark:text-emerald-50';
                    keyBadgeClasses =
                      'bg-emerald-600 text-white border-emerald-600';
                  } else if (isPickedWrong) {
                    containerClasses =
                      'bg-red-50 dark:bg-red-950/35 border-red-500 dark:border-red-500 text-red-950 dark:text-red-50';
                    keyBadgeClasses =
                      'bg-red-600 text-white border-red-600';
                  } else if (answered) {
                    containerClasses =
                      'bg-slate-50/60 dark:bg-slate-900/40 border-slate-200/70 dark:border-slate-800/70 text-slate-500 dark:text-slate-400';
                  }

                  return (
                    <button
                      key={opt.key}
                      type="button"
                      disabled={answered || submittingAnswer}
                      onClick={() => handleSelectOption(opt.key)}
                      className={`w-full min-h-[54px] px-4 py-3.5 rounded-xl border text-left flex items-center justify-between gap-4 transition-all duration-150 ${containerClasses} ${
                        !answered ? 'cursor-pointer active:scale-[0.995]' : 'cursor-default'
                      }`}
                    >
                      <span className="flex items-start gap-3.5 min-w-0">
                        <span
                          className={`w-7 h-7 rounded-md border font-mono text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5 ${keyBadgeClasses}`}
                        >
                          {opt.key}
                        </span>
                        <span className="text-[15px] leading-relaxed">{opt.text}</span>
                      </span>

                      <span className="shrink-0 flex items-center gap-1.5">
                        {!answered && (
                          <span className="hidden sm:inline font-mono text-[11px] text-slate-400 dark:text-slate-500">
                            {idx + 1}
                          </span>
                        )}
                        {isCorrectOpt && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Correct</span>
                          </span>
                        )}
                        {isPickedWrong && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400">
                            <XCircle className="w-4 h-4" />
                            <span>Incorrect</span>
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              {submittingAnswer && (
                <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                  <span>Checking answer and loading clinical explanation...</span>
                </div>
              )}

              {/* Detailed Explanation + Gemini Study Tutor */}
              {currentAnswer && (
                <ExplanationPanel
                  key={currentQuestion.id}
                  questionId={currentQuestion.id}
                  correctKey={currentAnswer.correctKey}
                  selectedKey={currentAnswer.selectedKey}
                  explanation={currentAnswer.explanation}
                  source={currentAnswer.source}
                  verified={currentAnswer.verified}
                  token={token}
                />
              )}

              {/* Bottom Question Navigation & Shortcut Hint */}
              <div className="mt-8 pt-5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    Keys: <kbd className="font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">A–D</kbd> or{' '}
                    <kbd className="font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">1–4</kbd> to answer
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    <kbd className="font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">N</kbd> for next
                  </span>
                </div>

                <div className="flex items-center gap-2.5 ml-auto">
                  <button
                    type="button"
                    disabled={currentIndex === 0 && page === 1}
                    onClick={handlePrev}
                    className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 whitespace-nowrap"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </button>

                  <button
                    type="button"
                    disabled={currentIndex >= questions.length - 1 && page >= totalPages}
                    onClick={handleNext}
                    className="min-h-[44px] px-5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-semibold text-sm inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 whitespace-nowrap"
                  >
                    <span>Next Question</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </article>
          )}
        </section>
      </div>

      {/* Mobile Slide-Up Filter Sheet */}
      {mobileFiltersOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end"
          role="dialog"
          aria-modal="true"
          aria-label="Practice filters"
        >
          <div className="w-full max-h-[85vh] rounded-t-3xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Filter Questions
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {total} questions matched
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                aria-label="Close filters"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">{filterPanelContent}</div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="w-full h-12 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-500 text-white dark:text-slate-950 font-semibold text-sm"
              >
                Show {total} Questions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Wrong Question Modal */}
      {reportOpen && currentQuestion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="report-modal-title"
                  className="text-lg font-bold text-slate-900 dark:text-slate-100"
                >
                  Report Question Issue
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {currentQuestion.subject} · {currentQuestion.topic}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                aria-label="Close report dialog"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitReport} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="report-issue-text"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  What looks incorrect or outdated?
                </label>
                <textarea
                  id="report-issue-text"
                  required
                  minLength={5}
                  rows={4}
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  placeholder="Describe the error (e.g., wrong answer key, outdated Indian guideline, typo in stem)..."
                  className="w-full p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:ring-teal-400"
                />
              </div>

              {reportError && (
                <p className="text-sm text-red-600 dark:text-red-400">{reportError}</p>
              )}

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  className="h-10 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reportSubmitting}
                  className="h-10 px-5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
                >
                  {reportSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
