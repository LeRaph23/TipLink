'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const inp: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font)',
  boxSizing: 'border-box',
};

export function JoinForm({
  establishmentId,
  establishmentName,
}: {
  establishmentId: string;
  establishmentName: string;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (signUpError) { setError(signUpError.message); setLoading(false); return; }

    if (data.user && data.user.identities?.length === 0) {
      setError('Un compte existe déjà avec cet email.');
      setLoading(false);
      return;
    }

    if (!data.session) {
      setDone(true);
      setLoading(false);
      return;
    }

    const res = await fetch('/api/staff/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ establishmentId, fullName }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setError(body.error ?? 'Erreur lors de la création du profil.');
      setLoading(false);
      return;
    }

    window.location.href = '/dashboard/onboarding';
  }

  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📧</div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Vérifiez votre email</h2>
        <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6 }}>
          Un lien de confirmation a été envoyé à <strong>{email}</strong>.<br />
          Cliquez dessus pour activer votre compte et rejoindre <strong>{establishmentName}</strong>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--error-bg)', color: 'var(--error)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <label>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 5, fontWeight: 500 }}>Votre prénom et nom</div>
        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Marie Dupont" style={inp} />
      </label>

      <label>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 5, fontWeight: 500 }}>Email</div>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="marie@example.com" style={inp} />
      </label>

      <label>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 5, fontWeight: 500 }}>Mot de passe</div>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="8 caractères minimum" style={inp} />
      </label>

      <button
        type="submit"
        disabled={loading || !fullName.trim() || !email || !password}
        style={{
          padding: '13px 20px', borderRadius: 12, border: 'none',
          background: loading ? 'var(--surface-2)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: loading ? 'var(--text-3)' : '#fff',
          fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font)', marginTop: 4,
          boxShadow: loading ? 'none' : '0 6px 24px rgba(99,102,241,0.3)',
        }}
      >
        {loading ? 'Création du compte…' : 'Rejoindre et configurer le paiement →'}
      </button>
    </form>
  );
}
