import React, { useEffect, useState } from 'react';
import { ArrowRight, Bookmark, Loader2, Search, Trash2 } from 'lucide-react';
import { api } from '../lib/api.ts';
import type {
  AuthUser,
  BookmarkItem,
  PaperType,
  PracticeLaunchPreset,
  PublicQuestion,
} from '../types.ts';

interface BookmarksViewProps {
  token: string | null;
  user: AuthUser | null;
  refreshKey: number;
  onOpenAuth: () => void;
  onLaunchPractice: (preset: PracticeLaunchPreset) => void;
  onDataChanged: () => void;
}

export function BookmarksView({
  token,
  user,
  refreshKey,
  onOpenAuth,
  onLaunchPractice,
  onDataChanged,
}: BookmarksViewProps) {
  const [tab, setTab] = useState<'bookmarks' | 'search'>('bookmarks');

  // Bookmarks state
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [bmLoading, setBmLoading] = useState(false);
  const [noteEdits, setNoteEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Keyword Search state
  const [query, setQuery] = useState('');
  const [paperFilter, setPaperFilter] = useState<PaperType | 'all'>('all');
  const [searchResults, setSearchResults] = useState<PublicQuestion[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setBookmarks([]);
      return;
    }
    let active = true;
    async function load() {
      setBmLoading(true);
      try {
        const res = await api.getBookmarks(token!);
        if (!active) return;
        setBookmarks(res.bookmarks);
        const edits: Record<string, string> = {};
        for (const item of res.bookmarks) {
          edits[item.questionId] = item.note;
        }
        setNoteEdits(edits);
      } catch {
        // Handled cleanly
      } finally {
        if (active) setBmLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [token, refreshKey]);

  useEffect(() => {
    if (tab !== 'search') return;
    let active = true;
    const t = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await api.getQuestions(
          {
            paper: paperFilter,
            search: query.trim() || undefined,
            page: 1,
            limit: 30,
          },
          token
        );
        if (!active) return;
        setSearchResults(res.questions);
        setSearchTotal(res.total);
      } finally {
        if (active) setSearchLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(t);
    };
  }, [tab, query, paperFilter, token]);

  async function handleSaveNote(questionId: string) {
    if (!token) return;
    setSavingId(questionId);
    try {
      await api.updateBookmarkNote(questionId, noteEdits[questionId] ?? '', token);
      setBookmarks((prev) =>
        prev.map((b) =>
          b.questionId === questionId ? { ...b, note: noteEdits[questionId] ?? '' } : b
        )
      );
      onDataChanged();
    } finally {
      setSavingId(null);
    }
  }

  async function handleRemoveBookmark(questionId: string) {
    if (!token) return;
    setSavingId(questionId);
    try {
      await api.deleteBookmark(questionId, token);
      setBookmarks((prev) => prev.filter((b) => b.questionId !== questionId));
      onDataChanged();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
            Bookmarks &amp; Search
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Review your saved high-yield notes or search across the FMGE question bank by keyword.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => setTab('bookmarks')}
            className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              tab === 'bookmarks'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Saved Bookmarks ({bookmarks.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('search')}
            className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              tab === 'search'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Keyword Search
          </button>
        </div>
      </div>

      {tab === 'bookmarks' ? (
        !user ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-4">
            <Bookmark className="w-8 h-8 text-teal-700 dark:text-teal-400 mx-auto" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Sign in to access your bookmarks
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
              Create a free account or sign in to bookmark tricky FMGE questions and attach personal revision notes.
            </p>
            <button
              type="button"
              onClick={onOpenAuth}
              className="h-11 px-5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-semibold text-sm"
            >
              Sign In / Create Account
            </button>
          </div>
        ) : bmLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-8">
            <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
            <span>Loading bookmarks...</span>
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              No bookmarked questions yet
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
              Click the Bookmark button while practicing any question to build your personalized high-yield revision list.
            </p>
            <button
              type="button"
              onClick={() => onLaunchPractice({ paper: 'all' })}
              className="h-11 px-5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-semibold text-sm"
            >
              Go to Practice
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {bookmarks.map((bm) => (
              <article
                key={bm.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {bm.question.subject}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{bm.question.topic}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{bm.question.difficulty}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onLaunchPractice({
                          subjects: [bm.question.subject],
                          status: 'bookmarked',
                        })
                      }
                      className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
                    >
                      <span>Practice</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={savingId === bm.questionId}
                      onClick={() => handleRemoveBookmark(bm.questionId)}
                      aria-label="Remove bookmark"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-[15px] leading-relaxed font-medium text-slate-900 dark:text-slate-100">
                  {bm.question.question}
                </p>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor={`bm-note-${bm.id}`}
                      className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Personal Note
                    </label>
                    <button
                      type="button"
                      disabled={savingId === bm.questionId}
                      onClick={() => handleSaveNote(bm.questionId)}
                      className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline disabled:opacity-50"
                    >
                      {savingId === bm.questionId ? 'Saving...' : 'Save Note'}
                    </button>
                  </div>
                  <textarea
                    id={`bm-note-${bm.id}`}
                    rows={2}
                    value={noteEdits[bm.questionId] ?? ''}
                    onChange={(e) =>
                      setNoteEdits((prev) => ({ ...prev, [bm.questionId]: e.target.value }))
                    }
                    placeholder="Write a personal note or revision tip..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:ring-teal-400"
                  />
                </div>
              </article>
            ))}
          </div>
        )
      ) : (
        /* Keyword Search Tab */
        <div className="space-y-5">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clinical signs, drugs, syndromes, or guidelines (e.g. Burtonian, MgSO4, PICA)..."
                className="w-full h-11 pl-10 pr-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600 dark:focus:ring-teal-400"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 shrink-0">
              {(['all', 'morning', 'afternoon'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPaperFilter(p)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg capitalize transition-colors whitespace-nowrap ${
                    paperFilter === p
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {p === 'all' ? 'All Papers' : p}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {searchLoading ? 'Searching...' : `${searchTotal} matching questions`}
          </div>

          <div className="space-y-3">
            {searchResults.map((q) => (
              <div
                key={q.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-900 dark:text-slate-200">
                      {q.subject}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{q.topic}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{q.difficulty}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {q.source === 'pyq' ? `PYQ ${q.pyqYear ?? ''}` : 'AI-Generated'}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200 line-clamp-2">
                    {q.question}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onLaunchPractice({
                      paper: q.paper,
                      subjects: [q.subject],
                      search: q.question.slice(0, 48),
                    })
                  }
                  className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-teal-600 dark:hover:border-teal-400 text-xs font-semibold text-teal-800 dark:text-teal-300 inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap transition-colors"
                >
                  <span>Solve</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
