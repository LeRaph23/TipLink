'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { createClient } from '@/lib/supabase/client';

export default function SetupPage() {
  const router = useRouter();
  const locale = useLocale();
  const supabase = createClient();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace(`/${locale}/login`);
        return;
      }
      const gid = user.user_metadata?.pending_group_id as string | undefined;
      setPendingGroupId(gid ?? null);
      setReady(true);
    });
  }, [supabase, router, locale]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError('Mot de passe trop court (8 caractères minimum).');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    setError(null);

    const { error: pwErr } = await supabase.auth.updateUser({ password });
    if (pwErr) {
      setError(pwErr.message);
      setLoading(false);
      return;
    }

    if (pendingGroupId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('user_roles').upsert(
          { user_id: user.id, role: 'group_admin', group_id: pendingGroupId },
          { onConflict: 'user_id,role,group_id' }
        );
      }
    }

    router.replace(`/${locale}/dashboard`);
  }

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
        <div style={{ fontSize: 14, color: '#6b6d85' }}>Chargement…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', padding: '20px' }}>
      <div style={{
        background: '#fff', border: '1px solid #e6e6f0', borderRadius: 20,
        padding: '40px', width: '100%', maxWidth: 420,
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🎉</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f1020', letterSpacing: '-0.02em', marginBottom: 8 }}>
            Bienvenue sur TipLink !
          </h1>
          <p style={{ fontSize: 14, color: '#6b6d85', lineHeight: 1.65 }}>
            Votre commande est confirmée. Définissez un mot de passe pour accéder à votre dashboard.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3a3b4f', marginBottom: 6 }}>
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8 caractères minimum"
              required
              minLength={8}
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 8, fontSize: 14,
                border: '1px solid #e6e6f0', background: '#fafafa', color: '#0f1020',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3a3b4f', marginBottom: 6 }}>
              Confirmer le mot de passe
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Répétez votre mot de passe"
              required
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 8, fontSize: 14,
                border: '1px solid #e6e6f0', background: '#fafafa', color: '#0f1020',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{
              marginBottom: 16, padding: '10px 14px', borderRadius: 8,
              background: '#fef2f2', border: '1px solid #fecaca',
              fontSize: 13, color: '#dc2626',
            }}>{error}</div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '13px', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer',
            background: loading ? '#F2B3C4' : '#E57A97',
            color: '#fff', fontSize: 15, fontWeight: 700, border: 'none',
          }}>
            {loading ? 'Activation…' : 'Accéder à mon dashboard →'}
          </button>
        </form>
      </div>
    </div>
  );
}
