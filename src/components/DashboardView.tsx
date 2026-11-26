import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { api } from '../lib/api.ts';
import type {
  AuthUser,
  LocalGuestAttempt,
  PracticeLaunchPreset,
  SubjectInfo,
  UserStatsResponse,
} from '../types.ts';

interface DashboardViewProps {
  subjects: SubjectInfo[];
  token: string | null;
  user: AuthUser | null;
  guestAttempts: LocalGuestAttempt[];
  refreshKey: number;
  onOpenAuth: () => void;
  onLaunchPractice: (preset: PracticeLaunchPreset) => void;
}

function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  if (mins < 60) return `${mins}m ${s % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export function DashboardView({
  subjects,
  token,
  user,
  guestAttempts,
  refreshKey,
  onOpenAuth,
  onLaunchPractice,
}: DashboardViewProps) {
  const [serverStats, setServerStats] = useState<UserStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setServerStats(null);
      return;
    }
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getStats(token!);
        if (active) setServerStats(res);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load stats.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [token, refreshKey]);

  // Build guest stats from in-memory session attempts when not signed in
  const computedStats: UserStatsResponse = useMemo(() => {
    if (serverStats) return serverStats;

    const totalAttempted = guestAttempts.length;
    const totalCorrect = guestAttempts.filter((a) => a.isCorrect).length;
    const accuracyPct = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;
    const totalTimeSec = guestAttempts.reduce((sum, a) => sum + a.timeTakenSec, 0);

    const subjMap = new Map<string, { attempted: number; correct: number }>();
    const topicMap = new Map<
      string,
      { subject: string; topic: string; attempted: number; correct: number }
    >();

    for (const att of guestAttempts) {
      const s = subjMap.get(att.subject) ?? { attempted: 0, correct: 0 };
      s.attempted++;
      if (att.isCorrect) s.correct++;
      subjMap.set(att.subject, s);

      const tKey = `${att.subject}:::${att.topic}`;
      const t = topicMap.get(tKey) ?? {
        subject: att.subject,
        topic: att.topic,
        attempted: 0,
        correct: 0,
      };
      t.attempted++;
      if (att.isCorrect) t.correct++;
      topicMap.set(tKey, t);
    }

    const subjectPerformance = subjects.map((def) => {
      const st = subjMap.get(def.name) ?? { attempted: 0, correct: 0 };
      return {
        subject: def.name,
        shortName: def.shortName,
        paper: def.paper,
        attempted: st.attempted,
        correct: st.correct,
        accuracyPct: st.attempted > 0 ? Math.round((st.correct / st.attempted) * 100) : 0,
      };
    });

    const weakTopics = Array.from(topicMap.values())
      .map((t) => ({
        ...t,
        accuracyPct: t.attempted > 0 ? Math.round((t.correct / t.attempted) * 100) : 0,
      }))
      .filter((t) => t.accuracyPct < 75)
      .sort((a, b) => a.accuracyPct - b.accuracyPct || b.attempted - a.attempted)
      .slice(0, 8);

    const morningAtt = guestAttempts.filter((a) => a.paper === 'morning');
    const afternoonAtt = guestAttempts.filter((a) => a.paper === 'afternoon');
    const bestMorningScaled =
      morningAtt.length > 0
        ? Math.round((morningAtt.filter((a) => a.isCorrect).length / morningAtt.length) * 150)
        : 0;
    const bestAfternoonScaled =
      afternoonAtt.length > 0
        ? Math.round((afternoonAtt.filter((a) => a.isCorrect).length / afternoonAtt.length) * 150)
        : 0;

    return {
      totalAttempted,
      totalCorrect,
      accuracyPct,
      dailyStreak: totalAttempted > 0 ? 1 : 0,
      totalTimeSec,
      bookmarksCount: 0,
      bestMorningScaled,
      bestAfternoonScaled,
      combinedMockEstimate: bestMorningScaled + bestAfternoonScaled,
      subjectPerformance,
      weakTopics,
    };
  }, [serverStats, guestAttempts, subjects]);

  const morningPerf = computedStats.subjectPerformance.filter((s) => s.paper === 'morning');
  const afternoonPerf = computedStats.subjectPerformance.filter((s) => s.paper === 'afternoon');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
            Performance Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {user
              ? `Synced progress for ${user.email}`
              : 'Showing your live guest session stats — sign in to save progress permanently.'}
          </p>
        </div>

        {!user && (
          <button
            type="button"
            onClick={onOpenAuth}
            className="min-h-[42px] px-4 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-semibold text-sm whitespace-nowrap"
          >
            Sign In to Save Progress
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
          <span>Refreshing analytics...</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* 4-Column Tabular KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Questions Attempted</p>
          <p className="mt-2 text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {computedStats.totalAttempted}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {computedStats.totalCorrect} correct
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Overall Accuracy</p>
          <p
            className={`mt-2 text-3xl font-bold font-mono tabular-nums ${
              computedStats.totalAttempted === 0
                ? 'text-slate-900 dark:text-slate-100'
                : computedStats.accuracyPct >= 50
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {computedStats.accuracyPct}%
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            FMGE pass threshold: 50%
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Daily Streak</p>
          <p className="mt-2 text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {computedStats.dailyStreak}
            <span className="text-base font-sans font-normal text-slate-500 dark:text-slate-400 ml-1">
              {computedStats.dailyStreak === 1 ? 'day' : 'days'}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Consecutive active study days
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Time Spent</p>
          <p className="mt-2 text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatDuration(computedStats.totalTimeSec)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Projected: {computedStats.combinedMockEstimate}/300
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 19-Subject Horizontal Bar Chart */}
        <section className="lg:col-span-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-6">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Subject-Wise Accuracy (All 19 FMGE Subjects)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Click any subject to jump straight into targeted practice.
              </p>
            </div>
          </div>

          {/* Morning Paper (12 Subjects) */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-teal-800 dark:text-teal-300">
              Morning Paper (12 Subjects)
            </h3>
            {morningPerf.map((item) => (
              <button
                key={item.subject}
                type="button"
                onClick={() =>
                  onLaunchPractice({ paper: 'morning', subjects: [item.subject] })
                }
                className="w-full text-left group py-1.5 px-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center justify-between gap-3 text-xs mb-1">
                  <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-teal-700 dark:group-hover:text-teal-300 truncate">
                    {item.subject}
                  </span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400 shrink-0">
                    {item.attempted > 0
                      ? `${item.correct}/${item.attempted} · ${item.accuracyPct}%`
                      : 'Not attempted'}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      item.attempted === 0
                        ? 'bg-transparent'
                        : item.accuracyPct >= 65
                        ? 'bg-emerald-600'
                        : item.accuracyPct >= 45
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${item.attempted > 0 ? Math.max(4, item.accuracyPct) : 0}%` }}
                  />
                </div>
              </button>
            ))}
          </div>

          {/* Afternoon Paper (7 Subjects) */}
          <div className="space-y-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-teal-800 dark:text-teal-300">
              Afternoon Paper (7 Subjects)
            </h3>
            {afternoonPerf.map((item) => (
              <button
                key={item.subject}
                type="button"
                onClick={() =>
                  onLaunchPractice({ paper: 'afternoon', subjects: [item.subject] })
                }
                className="w-full text-left group py-1.5 px-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center justify-between gap-3 text-xs mb-1">
                  <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-teal-700 dark:group-hover:text-teal-300 truncate">
                    {item.subject}
                  </span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400 shrink-0">
                    {item.attempted > 0
                      ? `${item.correct}/${item.attempted} · ${item.accuracyPct}%`
                      : 'Not attempted'}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      item.attempted === 0
                        ? 'bg-transparent'
                        : item.accuracyPct >= 65
                        ? 'bg-emerald-600'
                        : item.accuracyPct >= 45
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${item.attempted > 0 ? Math.max(4, item.accuracyPct) : 0}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Weak Topics Rail */}
        <aside className="lg:col-span-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
          <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Weak Topics to Focus On
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Topics scoring under 75% accuracy across your attempts.
            </p>
          </div>

          {computedStats.weakTopics.length === 0 ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {computedStats.totalAttempted === 0
                  ? 'Answer a few practice questions or complete a mock test to identify your weak topics.'
                  : 'Strong work—no topics are currently below 75% accuracy.'}
              </p>
              <button
                type="button"
                onClick={() => onLaunchPractice({ paper: 'all' })}
                className="h-10 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-semibold text-xs"
              >
                Start Practicing
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {computedStats.weakTopics.map((wt) => (
                <div key={`${wt.subject}-${wt.topic}`} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                        {wt.topic}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {wt.subject} · {wt.correct}/{wt.attempted} correct
                      </p>
                    </div>
                    <span className="font-mono tabular-nums text-xs font-semibold text-red-600 dark:text-red-400 shrink-0">
                      {wt.accuracyPct}%
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onLaunchPractice({ subjects: [wt.subject], topic: wt.topic })
                    }
                    className="mt-2.5 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
                  >
                    <span>Practice Topic</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
