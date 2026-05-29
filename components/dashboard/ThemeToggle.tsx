'use client';

import { useEffect, useState } from 'react';

import { Icon } from '@/components/ambassadeur/icons';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const initial = stored ?? 'light';
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrates theme from localStorage, unavailable during SSR
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.dataset.theme = next;
  }

  return (
    <button
      onClick={toggle}
      title={theme === 'light' ? 'Passer en mode sombre' : 'Passer en mode clair'}
      style={{
        width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border-subtle)',
        background: 'var(--surface-2)', cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        color: 'var(--text-2)', fontSize: 14, transition: 'all 120ms',
      }}
    >
      <Icon name={theme === 'light' ? 'moon' : 'sun'} size={15} />
    </button>
  );
}
