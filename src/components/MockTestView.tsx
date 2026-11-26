import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Grid,
  Loader2,
  Play,
  RotateCcw,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import type {
  AuthUser,
  LocalGuestAttempt,
  MockResultResponse,
  MockStartResponse,
  OptionKey,
  PaperType,
  SubjectInfo,
} from '../types.ts';
import { ExplanationPanel } from './ExplanationPanel.tsx';

interface MockTestViewProps {
  subjects: SubjectInfo[];
  token: string | null;
  user: AuthUser | null;
  onRecordGuestAttempt: (attempt: LocalGuestAttempt) => void;
  onDataChanged: () => void;
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function MockTestView({
  subjects,
  token,
  user,
  onRecordGuestAttempt,
  onDataChanged,
}: MockTestViewProps) {
  // Setup state
  const [paper, setPaper] = useState<PaperType>('morning');
  const [format, setFormat] = useState<'full' | 'mini'>('full');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active exam state
  const [session, setSession] = useState<MockStartResponse | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, OptionKey | null>>({});
  const [markedReview, setMarkedReview] = useState<Record<string, boolean>>({});
  const [timePerQ, setTimePerQ] = useState<Record<string, number>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [paletteDrawerOpen, setPaletteDrawerOpen] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Completed exam result + combined pass-mark tracker across both papers
  const [result, setResult] = useState<MockResultResponse | null>(null);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'incorrect' | 'correct' | 'unanswered'>('all');
  const [bestPaperScaled, setBestPaperScaled] = useState<{ morning: number; afternoon: number }>({
    morning: 0,
    afternoon: 0,
  });

  const lastTickRef = useRef<number>(Date.now());
  const autoSubmittedRef = useRef(false);

  const morningSubjects = useMemo(() => subjects.filter((s) => s.paper === 'morning'), [subjects]);
  const afternoonSubjects = useMemo(() => subjects.filter((s) => s.paper === 'afternoon'), [subjects]);
  const morningCount = useMemo(
    () => morningSubjects.reduce((acc, s) => acc + s.questionCount, 0),
    [morningSubjects]
  );
  const afternoonCount = useMemo(
    () => afternoonSubjects.reduce((acc, s) => acc + s.questionCount, 0),
    [afternoonSubjects]
  );

  const handleSubmitExam = useCallback(async () => {
    if (!session || submitting) return;
    setSubmitting(true);
    setConfirmSubmitOpen(false);
    setError(null);
    try {
      const elapsedTotal = Math.max(1, session.durationSec - secondsLeft);
      const payloadAnswers = session.questions.map((q) => ({
        questionId: q.id,
        selectedKey: answers[q.id] ?? null,
        timeTakenSec: timePerQ[q.id] ?? 0,
      }));
      const res = await api.submitMock(
        {
          sessionId: session.sessionId,
          answers: payloadAnswers,
          totalTimeSec: elapsedTotal,
        },
        token
      );
      setResult(res);
      setBestPaperScaled((prev) => ({
        ...prev,
        [res.paper]: Math.max(prev[res.paper], res.scaledPaperScore),
      }));

      if (!user) {
        for (const item of res.review) {
          if (item.selectedKey !== null) {
            onRecordGuestAttempt({
              questionId: item.question.id,
              subject: item.question.subject,
              topic: item.question.topic,
              paper: item.question.paper,
              isCorrect: item.isCorrect,
              timeTakenSec: timePerQ[item.question.id] ?? 0,
              mode: 'mock',
              timestamp: Date.now(),
            });
          }
        }
      } else {
        onDataChanged();
      }
      setSession(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit mock test.');
    } finally {
      setSubmitting(false);
    }
  }, [session, submitting, secondsLeft, answers, timePerQ, token, user, onRecordGuestAttempt, onDataChanged]);

  // Countdown timer & per-question elapsed time tracking
  useEffect(() => {
    if (!session || result) return;
    lastTickRef.current = Date.now();
    const interval = window.setInterval(() => {
      const now = Date.now();
      const delta = Math.max(1, Math.round((now - lastTickRef.current) / 1000));
      lastTickRef.current = now;

      const currentQ = session.questions[currentIdx];
      if (currentQ) {
        setTimePerQ((prev) => ({
          ...prev,
          [currentQ.id]: (prev[currentQ.id] ?? 0) + delta,
        }));
      }

      setSecondsLeft((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === 0 && !autoSubmittedRef.current) {
          autoSubmittedRef.current = true;
          void handleSubmitExam();
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [session, result, currentIdx, handleSubmitExam]);

  async function handleStartMock() {
    setStarting(true);
    setError(null);
    setResult(null);
    autoSubmittedRef.current = false;
    try {
      const started = await api.startMock({ paper, format }, token);
      setSession(started);
      setCurrentIdx(0);
      setAnswers({});
      setMarkedReview({});
      setTimePerQ({});
      setSecondsLeft(started.durationSec);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start mock test.');
    } finally {
      setStarting(false);
    }
  }

  // ===================== RESULT & REVIEW SCREEN =====================
  if (result) {
    const combinedProjected = bestPaperScaled.morning + bestPaperScaled.afternoon;
    const combinedPct = Math.min(100, Math.round((combinedProjected / 300) * 100));

    const filteredReview = result.review.filter((item) => {
      if (reviewFilter === 'incorrect') return item.selectedKey !== null && !item.isCorrect;
      if (reviewFilter === 'correct') return item.isCorrect;
      if (reviewFilter === 'unanswered') return item.selectedKey === null;
      return true;
    });

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
        {/* Top Result Summary */}
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
                {result.paper === 'morning' ? 'Morning Paper (Part I)' : 'Afternoon Paper (Part II)'} ·{' '}
                {result.format === 'full' ? 'Full Paper Simulation' : 'Quick Mini-Mock'}
              </p>
              <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
                Mock Test Results
              </h1>
            </div>

            <button
              type="button"
              onClick={() => setResult(null)}
              className="min-h-[44px] px-5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-semibold text-sm inline-flex items-center gap-2 whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Start Another Mock</span>
            </button>
          </div>

          {/* 4-Column Score Strip */}
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Raw Score (No Neg. Marking)</p>
              <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {result.correctCount} / {result.totalQuestions}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Accuracy</p>
              <p
                className={`mt-1.5 text-2xl font-bold font-mono tabular-nums ${
                  result.passedPaperBenchmark
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {result.accuracyPct}%
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Scaled Paper Score</p>
              <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {result.scaledPaperScore} / 150
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Time Taken</p>
              <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {formatClock(result.totalTimeSec)}
              </p>
            </div>
          </div>

          {/* Official 150 / 300 Combined FMGE Pass-Mark Tracker */}
          <div className="mt-6 p-5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                FMGE Pass Benchmark (150 / 300 Combined Across Both Papers)
              </span>
              <span className="font-mono tabular-nums font-semibold text-teal-800 dark:text-teal-300">
                Morning {bestPaperScaled.morning}/150 + Afternoon {bestPaperScaled.afternoon}/150 ={' '}
                {combinedProjected} / 300
              </span>
            </div>
            <div className="mt-3 relative h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  combinedProjected >= 150 ? 'bg-emerald-600' : 'bg-teal-600 dark:bg-teal-400'
                }`}
                style={{ width: `${combinedPct}%` }}
              />
              {/* 150/300 Pass Mark Threshold Marker */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-slate-900 dark:bg-white"
                style={{ left: '50%' }}
                title="150 / 300 FMGE Pass Mark"
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <span>0</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Pass Mark: 150 / 300 (50%) —{' '}
                {result.passedPaperBenchmark
                  ? 'On pace on this paper'
                  : 'Below 50% pace on this paper'}
              </span>
              <span>300</span>
            </div>
          </div>

          {/* Subject-Wise Accuracy Breakdown */}
          <div className="mt-6">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">
              Subject-Wise Accuracy
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {result.subjectBreakdown.map((sub) => (
                <div
                  key={sub.subject}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {sub.subject}
                    </span>
                    <span className="font-mono tabular-nums text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                      {sub.correct}/{sub.total} ({sub.accuracyPct}%)
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        sub.accuracyPct >= 60
                          ? 'bg-emerald-600'
                          : sub.accuracyPct >= 40
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${sub.accuracyPct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Full Question-by-Question Review */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Full Answer Review ({filteredReview.length})
            </h2>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800/80">
              {(
                [
                  ['all', `All (${result.totalQuestions})`],
                  ['incorrect', `Wrong (${result.incorrectCount})`],
                  ['correct', `Correct (${result.correctCount})`],
                  ['unanswered', `Skipped (${result.unansweredCount})`],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setReviewFilter(val)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    reviewFilter === val
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredReview.map((item, idx) => (
            <article
              key={item.question.id}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    #{idx + 1}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-slate-900 dark:text-slate-200">
                    {item.question.subject}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{item.question.topic}</span>
                </div>
                <span
                  className={`font-semibold inline-flex items-center gap-1 ${
                    item.isCorrect
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : item.selectedKey === null
                      ? 'text-slate-500 dark:text-slate-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {item.isCorrect ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" /> Correct ({item.selectedKey})
                    </>
                  ) : item.selectedKey === null ? (
                    'Unanswered'
                  ) : (
                    <>
                      <XCircle className="w-4 h-4" /> Your Answer: {item.selectedKey} · Key:{' '}
                      {item.question.correctKey}
                    </>
                  )}
                </span>
              </div>

              <p className="mt-4 text-[15px] sm:text-base leading-relaxed font-medium text-slate-900 dark:text-slate-100">
                {item.question.question}
              </p>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {item.question.options.map((opt) => {
                  const isKey = opt.key === item.question.correctKey;
                  const isWrongPick = item.selectedKey === opt.key && !isKey;
                  return (
                    <div
                      key={opt.key}
                      className={`p-3 rounded-lg border text-sm ${
                        isKey
                          ? 'bg-emerald-50 dark:bg-emerald-950/35 border-emerald-500 text-emerald-950 dark:text-emerald-100'
                          : isWrongPick
                          ? 'bg-red-50 dark:bg-red-950/35 border-red-500 text-red-950 dark:text-red-100'
                          : 'bg-slate-50/70 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="font-mono font-semibold mr-2">{opt.key}.</span>
                      <span>{opt.text}</span>
                    </div>
                  );
                })}
              </div>

              <ExplanationPanel
                questionId={item.question.id}
                correctKey={item.question.correctKey}
                selectedKey={item.selectedKey}
                explanation={item.question.explanation}
                source={item.question.source}
                verified={item.question.verified}
                token={token}
              />
            </article>
          ))}
        </section>
      </div>
    );
  }

  // ===================== ACTIVE TIMED EXAM ROOM =====================
  if (session) {
    const q = session.questions[currentIdx];
    const selectedOpt = answers[q.id] ?? null;
    const isMarked = Boolean(markedReview[q.id]);
    const answeredCount = session.questions.filter((item) => answers[item.id] != null).length;
    const markedCount = session.questions.filter((item) => markedReview[item.id]).length;
    const lowTime = secondsLeft <= 300;

    const paletteGrid = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-xs bg-emerald-600 shrink-0" />
            <span>Answered ({answeredCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-xs bg-amber-500 shrink-0" />
            <span>Review ({markedCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-xs bg-slate-200 dark:bg-slate-700 shrink-0" />
            <span>Unanswered ({session.questions.length - answeredCount})</span>
          </div>
        </div>

        <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-5 gap-2 max-h-80 overflow-y-auto pr-1">
          {session.questions.map((item, idx) => {
            const isAns = answers[item.id] != null;
            const isRev = Boolean(markedReview[item.id]);
            const isCurr = idx === currentIdx;

            let btnStyle =
              'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
            if (isRev && isAns) {
              btnStyle = 'bg-amber-600 text-white border-amber-600';
            } else if (isRev) {
              btnStyle = 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border-amber-400';
            } else if (isAns) {
              btnStyle = 'bg-emerald-600 text-white border-emerald-600';
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setCurrentIdx(idx);
                  setPaletteDrawerOpen(false);
                }}
                className={`h-10 rounded-lg border font-mono text-xs font-semibold tabular-nums transition-all ${btnStyle} ${
                  isCurr ? 'ring-2 ring-teal-600 dark:ring-teal-400 ring-offset-2 dark:ring-offset-slate-900' : ''
                }`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </div>
    );

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        {/* Sticky Exam Header */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-bold text-slate-900 dark:text-slate-100">
              {session.paper === 'morning' ? 'Morning Paper' : 'Afternoon Paper'}
            </span>
            <span className="text-slate-400" aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-xs text-slate-600 dark:text-slate-400">
              {answeredCount}/{session.questions.length} Answered
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <div
              className={`px-3 py-1.5 rounded-lg font-mono tabular-nums text-sm font-semibold inline-flex items-center gap-1.5 border ${
                lowTime
                  ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{formatClock(secondsLeft)}</span>
            </div>

            <button
              type="button"
              onClick={() => setPaletteDrawerOpen(true)}
              className="lg:hidden min-h-[40px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
            >
              <Grid className="w-4 h-4" />
              <span>Palette</span>
            </button>

            <button
              type="button"
              onClick={() => setConfirmSubmitOpen(true)}
              className="min-h-[40px] px-4 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-semibold text-xs sm:text-sm inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit Exam</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Exam Question Canvas */}
          <section className="lg:col-span-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                <span className="font-mono font-semibold text-teal-800 dark:text-teal-300 tabular-nums">
                  Question {currentIdx + 1} of {session.questions.length}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-slate-900 dark:text-slate-200">{q.subject}</span>
                <span aria-hidden="true">·</span>
                <span>{q.topic}</span>
              </div>

              <button
                type="button"
                onClick={() =>
                  setMarkedReview((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                }
                className={`min-h-[38px] px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  isMarked
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 text-amber-900 dark:text-amber-200'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>{isMarked ? 'Marked for Review' : 'Mark for Review'}</span>
              </button>
            </div>

            <p className="mt-6 text-[17px] leading-[1.65] font-medium text-slate-900 dark:text-slate-100 max-w-3xl">
              {q.question}
            </p>

            <div className="mt-6 space-y-3">
              {q.options.map((opt) => {
                const chosen = selectedOpt === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.key }))}
                    className={`w-full min-h-[54px] px-4 py-3.5 rounded-xl border text-left flex items-start gap-3.5 transition-colors ${
                      chosen
                        ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-600 dark:border-teal-400 text-teal-950 dark:text-teal-50'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-teal-500 text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-md border font-mono text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5 ${
                        chosen
                          ? 'bg-teal-700 dark:bg-teal-500 text-white dark:text-slate-950 border-teal-700 dark:border-teal-500'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {opt.key}
                    </span>
                    <span className="text-[15px] leading-relaxed">{opt.text}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 pt-5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={selectedOpt === null}
                onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: null }))}
                className="min-h-[42px] px-3.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-40"
              >
                Clear Response
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={currentIdx === 0}
                  onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Prev</span>
                </button>
                <button
                  type="button"
                  disabled={currentIdx >= session.questions.length - 1}
                  onClick={() =>
                    setCurrentIdx((i) => Math.min(session.questions.length - 1, i + 1))
                  }
                  className="min-h-[44px] px-5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-semibold text-sm inline-flex items-center gap-1 disabled:opacity-40"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>

          {/* Desktop Question Palette Rail */}
          <aside className="hidden lg:block lg:col-span-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sticky top-20">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              Question Palette
            </h2>
            {paletteGrid}
          </aside>
        </div>

        {/* Mobile Question Palette Drawer */}
        {paletteDrawerOpen && (
          <div
            className="lg:hidden fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end"
            role="dialog"
            aria-modal="true"
            aria-label="Question palette"
          >
            <div className="w-full max-h-[80vh] rounded-t-3xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-5 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Question Palette
                </h2>
                <button
                  type="button"
                  onClick={() => setPaletteDrawerOpen(false)}
                  aria-label="Close palette"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto">{paletteGrid}</div>
            </div>
          </div>
        )}

        {/* Submit Confirmation Modal */}
        {confirmSubmitOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-mock-title"
          >
            <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
              <h3
                id="submit-mock-title"
                className="text-lg font-bold text-slate-900 dark:text-slate-100"
              >
                Submit Mock Test?
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                You have answered <strong className="font-mono text-slate-900 dark:text-slate-100">{answeredCount}</strong> of{' '}
                <strong className="font-mono text-slate-900 dark:text-slate-100">{session.questions.length}</strong> questions
                {markedCount > 0 ? ` (${markedCount} marked for review)` : ''}. There is no negative marking in FMGE.
              </p>
              <div className="mt-6 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmSubmitOpen(false)}
                  className="h-10 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Resume Exam
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmitExam}
                  className="h-10 px-5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-60"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm & Grade
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===================== MOCK TEST SETUP SCREEN =====================
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
          FMGE Timed Mock Examination
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-2xl">
          Simulate authentic NBE FMGE exam pressure with subject-weighted selection, zero negative marking, and strict answer secrecy until submission.
        </p>
      </div>

      {/* Paper Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setPaper('morning')}
          className={`text-left p-6 rounded-2xl border transition-all ${
            paper === 'morning'
              ? 'bg-teal-50/70 dark:bg-teal-950/30 border-teal-600 dark:border-teal-400'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-base font-bold text-slate-900 dark:text-slate-100">
              Morning Paper (Part I)
            </span>
            <span className="font-mono text-xs tabular-nums text-teal-800 dark:text-teal-300">
              {morningCount} Qs in bank
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            12 Subjects: Anatomy, Physiology, Biochemistry, Pathology, Microbiology, Pharmacology, Dermatology, Pediatrics, Psychiatry, PSM, Anaesthesia, Orthopedics.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setPaper('afternoon')}
          className={`text-left p-6 rounded-2xl border transition-all ${
            paper === 'afternoon'
              ? 'bg-teal-50/70 dark:bg-teal-950/30 border-teal-600 dark:border-teal-400'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-base font-bold text-slate-900 dark:text-slate-100">
              Afternoon Paper (Part II)
            </span>
            <span className="font-mono text-xs tabular-nums text-teal-800 dark:text-teal-300">
              {afternoonCount} Qs in bank
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            7 Subjects: Medicine, General Surgery, Obstetrics & Gynaecology, Radiology, Ophthalmology, ENT, Forensic Medicine.
          </p>
        </button>
      </div>

      {/* Format Selection */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
            Select Test Length
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFormat('full')}
              className={`p-4 rounded-xl border text-left transition-colors ${
                format === 'full'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 border-slate-900 dark:border-slate-100'
                  : 'bg-slate-50 dark:bg-slate-950/60 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="text-sm font-bold">Full FMGE Paper</div>
              <div className="mt-1 text-xs opacity-80 font-mono tabular-nums">
                150 MCQs · 3 Hours (180 min)
              </div>
            </button>

            <button
              type="button"
              onClick={() => setFormat('mini')}
              className={`p-4 rounded-xl border text-left transition-colors ${
                format === 'mini'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 border-slate-900 dark:border-slate-100'
                  : 'bg-slate-50 dark:bg-slate-950/60 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="text-sm font-bold">Quick Timed Mini-Mock</div>
              <div className="mt-1 text-xs opacity-80 font-mono tabular-nums">
                30 MCQs · 36 Minutes (FMGE pace)
              </div>
            </button>
          </div>
        </div>

        {/* Exam Rules Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
          <div>
            <span className="font-semibold text-slate-900 dark:text-slate-100 block">
              Marking Scheme
            </span>
            +1 per correct answer, 0 negative marking.
          </div>
          <div>
            <span className="font-semibold text-slate-900 dark:text-slate-100 block">
              Pass Requirement
            </span>
            150 / 300 combined across Morning & Afternoon papers.
          </div>
          <div>
            <span className="font-semibold text-slate-900 dark:text-slate-100 block">
              Preview Scaling
            </span>
            If the question bank has fewer than 150 Qs for a paper, all available Qs load with proportional time.
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="pt-2 flex items-center justify-end">
          <button
            type="button"
            disabled={starting}
            onClick={handleStartMock}
            className="min-h-[48px] px-6 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-semibold text-sm inline-flex items-center gap-2 transition-colors disabled:opacity-60"
          >
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>
              Start {paper === 'morning' ? 'Morning' : 'Afternoon'}{' '}
              {format === 'full' ? 'Full Paper' : 'Mini-Mock'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
