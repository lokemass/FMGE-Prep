import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Bookmark,
  BookOpenCheck,
  ClipboardCheck,
  LogOut,
  Moon,
  Sun,
  User,
} from 'lucide-react';
import { api } from './lib/api.ts';
import type {
  AuthUser,
  LocalGuestAttempt,
  PracticeLaunchPreset,
  SubjectsSummary,
} from './types.ts';
import { AuthModal } from './components/AuthModal.tsx';
import { PracticeView } from './components/PracticeView.tsx';
import { MockTestView } from './components/MockTestView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { BookmarksView } from './components/BookmarksView.tsx';
import { AdminPanel } from './components/AdminPanel.tsx';

type NavTab = 'practice' | 'mock' | 'dashboard' | 'bookmarks';
type AdminRoute = 'flagged' | 'stats' | 'users' | null;

function readAdminRouteFromLocation(): AdminRoute {
  if (typeof window === 'undefined') return null;
  const p = window.location.pathname.replace(/\/+$/, '');
  if (p === '/admin/flagged') return 'flagged';
  if (p === '/admin/users') return 'users';
  if (p === '/admin/stats' || p === '/admin') return 'stats';
  return null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('practice');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  // In-memory JWT & authenticated user (never stored in localStorage/sessionStorage)
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Admin SPA route (/admin/flagged, /admin/stats) & in-memory admin JWT
  const [adminRoute, setAdminRoute] = useState<AdminRoute>(readAdminRouteFromLocation);
  const [adminToken, setAdminToken] = useState<string | null>(null);

  // Exam structure & bank summary
  const [summary, setSummary] = useState<SubjectsSummary | null>(null);
  const [guestAttempts, setGuestAttempts] = useState<LocalGuestAttempt[]>([]);
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);
  const [practicePreset, setPracticePreset] = useState<PracticeLaunchPreset | null>(null);

  // Sync Tailwind v4 `.dark` class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // Fetch subjects & database mode on load and when admin approves/deletes items
  const refreshSubjects = useCallback(() => {
    api
      .getSubjects()
      .then((res) => setSummary(res))
      .catch(() => {
        // Handled cleanly inside child views
      });
  }, []);

  useEffect(() => {
    refreshSubjects();
  }, [refreshSubjects]);

  // Keep browser Back/Forward synced with /admin/* routes
  useEffect(() => {
    const onPopState = () => setAdminRoute(readAdminRouteFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateToPath = useCallback((path: string) => {
    if (typeof window !== 'undefined' && window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setAdminRoute(readAdminRouteFromLocation());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleRecordGuestAttempt = useCallback((attempt: LocalGuestAttempt) => {
    setGuestAttempts((prev) => [attempt, ...prev]);
  }, []);

  const handleDataChanged = useCallback(() => {
    setStatsRefreshKey((k) => k + 1);
  }, []);

  const handleLaunchPractice = useCallback((preset: PracticeLaunchPreset) => {
    setPracticePreset(preset);
    setActiveTab('practice');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleClearPreset = useCallback(() => {
    setPracticePreset(null);
  }, []);

  // Live signed-in user presence heartbeat (so admin panel sees who is currently active)
  useEffect(() => {
    if (!token || !user) return;
    const sectionLabel = adminRoute
      ? 'Viewing Admin Panel'
      : activeTab === 'practice'
        ? 'Practicing MCQs'
        : activeTab === 'mock'
          ? 'In Mock Test'
          : activeTab === 'dashboard'
            ? 'Viewing Dashboard'
            : 'Reviewing Bookmarks';

    const ping = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void api.sendHeartbeat(token, sectionLabel).catch(() => {});
    };

    ping();
    const intervalId = window.setInterval(ping, 60_000);
    return () => window.clearInterval(intervalId);
  }, [token, user, activeTab, adminRoute]);

  const handleSignOut = () => {
    if (token) {
      void api.logout(token).catch(() => {});
    }
    setToken(null);
    setUser(null);
    setStatsRefreshKey((k) => k + 1);
  };

  const navItems: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'practice', label: 'Practice', icon: BookOpenCheck },
    { id: 'mock', label: 'Mock Test', icon: ClipboardCheck },
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 pb-20 md:pb-0">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 h-14 md:h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line wordmark */}
          <button
            type="button"
            onClick={() => {
              if (adminRoute) navigateToPath('/');
              setActiveTab('practice');
            }}
            className="font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            FMGE Prep
          </button>

          {/* Zone 2: 4 clean single-line text nav links (Desktop) */}
          <nav className="hidden md:flex items-center gap-7" aria-label="Primary navigation">
            {navItems.map((item) => {
              const active = !adminRoute && activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (adminRoute) navigateToPath('/');
                    setActiveTab(item.id);
                  }}
                  className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'text-teal-800 dark:text-teal-300 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute left-0 right-0 -bottom-[13px] h-0.5 bg-teal-700 dark:bg-teal-400" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Theme + Primary Account Action */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 max-w-[160px] truncate">
                  <User className="w-3.5 h-3.5 shrink-0 text-teal-700 dark:text-teal-400" />
                  <span className="truncate">{user.email}</span>
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="min-h-[38px] px-4 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-semibold text-xs sm:text-sm transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Quiet Editorial Dataset Context Strip */}
      {summary && (
        <div className="border-b border-slate-200/80 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                {summary.totalQuestions.toLocaleString()} MCQs
              </span>
              <span aria-hidden="true">·</span>
              <span>19 FMGE Subjects (Morning &amp; Afternoon Papers)</span>
              {summary.mode === 'memory' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Preview Mode (30 sample questions; configure MONGODB_URI for Atlas)</span>
                </>
              )}
            </div>
            {!user && (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
              >
                Guest Session · Sign in to save progress
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Active Workspace */}
      <main className="flex-1">
        {adminRoute ? (
          <AdminPanel
            route={adminRoute}
            subjects={summary?.subjects ?? []}
            userToken={token}
            adminToken={adminToken}
            onAdminTokenChange={setAdminToken}
            onNavigate={navigateToPath}
            onBankMutated={refreshSubjects}
          />
        ) : (
          <>
            {activeTab === 'practice' && (
              <PracticeView
                subjects={summary?.subjects ?? []}
                token={token}
                user={user}
                preset={practicePreset}
                onClearPreset={handleClearPreset}
                onOpenAuth={() => setAuthModalOpen(true)}
                onRecordGuestAttempt={handleRecordGuestAttempt}
                onDataChanged={handleDataChanged}
              />
            )}

            {activeTab === 'mock' && (
              <MockTestView
                subjects={summary?.subjects ?? []}
                token={token}
                user={user}
                onRecordGuestAttempt={handleRecordGuestAttempt}
                onDataChanged={handleDataChanged}
              />
            )}

            {activeTab === 'dashboard' && (
              <DashboardView
                subjects={summary?.subjects ?? []}
                token={token}
                user={user}
                guestAttempts={guestAttempts}
                refreshKey={statsRefreshKey}
                onOpenAuth={() => setAuthModalOpen(true)}
                onLaunchPractice={handleLaunchPractice}
              />
            )}

            {activeTab === 'bookmarks' && (
              <BookmarksView
                token={token}
                user={user}
                refreshKey={statsRefreshKey}
                onOpenAuth={() => setAuthModalOpen(true)}
                onLaunchPractice={handleLaunchPractice}
                onDataChanged={handleDataChanged}
              />
            )}
          </>
        )}
      </main>

      {/* Quiet Editorial Footer with Admin Review & Quota Links */}
      <footer className="border-t border-slate-200/80 dark:border-slate-800/80 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>FMGE Prep · Foreign Medical Graduate Examination Practice</span>
          <div className="flex items-center gap-4">
            <a
              href="/admin/flagged"
              onClick={(e) => {
                e.preventDefault();
                navigateToPath('/admin/flagged');
              }}
              className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            >
              Admin: Flagged Review
            </a>
            <span aria-hidden="true">·</span>
            <a
              href="/admin/stats"
              onClick={(e) => {
                e.preventDefault();
                navigateToPath('/admin/stats');
              }}
              className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            >
              Admin: Quota &amp; AI
            </a>
            <span aria-hidden="true">·</span>
            <a
              href="/admin/users"
              onClick={(e) => {
                e.preventDefault();
                navigateToPath('/admin/users');
              }}
              className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            >
              Admin: Users
            </a>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Tab Bar (Thumb-Zone Navigation, <= 15% Viewport Height) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-4 items-center"
        aria-label="Mobile navigation"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = !adminRoute && activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (adminRoute) navigateToPath('/');
                setActiveTab(item.id);
              }}
              className={`min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors ${
                active
                  ? 'text-teal-700 dark:text-teal-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] leading-none">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Auth Modal */}
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(newToken, newUser) => {
          setToken(newToken);
          setUser(newUser);
          setStatsRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
