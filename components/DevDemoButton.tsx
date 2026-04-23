'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';

// Dev-only button: seeds Supabase with a fully paid/populated demo account,
// signs the browser in with that account and drops you on /dashboard.
//
// The parent component is responsible for not rendering this in production.
export function DevDemoButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dev/seed-demo', { method: 'POST' });
      const text = await res.text();
      let body: { error?: string; step?: string; email?: string; password?: string } = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { error: text || `HTTP ${res.status}` };
      }
      if (!res.ok) {
        const detail = body.step ? `[${body.step}] ` : '';
        throw new Error(`${detail}${body.error ?? `HTTP ${res.status}`}`);
      }
      const { email, password } = body as { email: string; password: string };
      if (!email || !password) throw new Error('seed response missing credentials');

      const supabase = createClient();
      // Make sure we don't inherit a different session.
      await supabase.auth.signOut();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      router.push('/dashboard');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        title="Dev-only: seeds Supabase with a paid demo account and signs you in."
        style={{
          padding: '7px 14px',
          borderRadius: 8,
          border: '1px dashed rgba(251, 191, 36, 0.5)',
          background: loading ? 'rgba(251, 191, 36, 0.1)' : 'rgba(251, 191, 36, 0.14)',
          color: '#fbbf24',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          cursor: loading ? 'wait' : 'pointer',
          fontFamily: 'var(--font)',
        }}
      >
        {loading ? 'Seeding…' : 'DEV · Demo dashboard'}
      </button>
      {error && (
        <span style={{ fontSize: 10.5, color: '#f87171', maxWidth: 220, textAlign: 'right' }}>
          {error}
        </span>
      )}
    </div>
  );
}
