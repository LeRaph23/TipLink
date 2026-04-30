'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

const STORAGE_KEY = 'digitip-dashboard-theme';

type Theme = 'light' | 'dark';

type Ctx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
};

const DashboardThemeContext = createContext<Ctx | null>(null);

export function useDashboardTheme() {
  const v = useContext(DashboardThemeContext);
  if (!v) throw new Error('useDashboardTheme must be used within DashboardThemeProvider');
  return v;
}

export function DashboardThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s === 'light' || s === 'dark') setThemeState(s);
    } catch {
      /* ignore */
    }
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  );

  return (
    <DashboardThemeContext.Provider value={value}>
      <div
        data-theme={theme}
        suppressHydrationWarning
        style={{
          display: 'flex',
          height: '100vh',
          overflow: 'hidden',
          background: 'var(--bg)',
          minHeight: 0,
        }}
      >
        {children}
      </div>
    </DashboardThemeContext.Provider>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v1.2M8 13.8V15M1 8h1.2M13.8 8H15M2.8 2.8l.85.85M12.35 12.35l.85.85M2.8 13.2l.85-.85M12.35 3.65l.85-.85" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.2 9.2A5.3 5.3 0 0010.4 2.1a5.3 5.3 0 11-8.2 7.1z" />
    </svg>
  );
}

export function DashboardThemeToggle() {
  const { theme, toggleTheme } = useDashboardTheme();
  const t = useTranslations('dashboard.nav');

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? t('themeToLight') : t('themeToDark')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: 8,
        border: '1px solid var(--border-subtle)',
        background: 'var(--surface-2)',
        color: 'var(--text-2)',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'color 120ms, background 120ms, border-color 120ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--text)';
        e.currentTarget.style.background = 'var(--surface-3)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--text-2)';
        e.currentTarget.style.background = 'var(--surface-2)';
      }}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
