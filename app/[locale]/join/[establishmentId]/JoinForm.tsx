'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface UnclaimedProfile {
  id: string;
  full_name: string;
}

const inp: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 12,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 15,
  fontFamily: 'var(--font)',
  boxSizing: 'border-box',
  outline: 'none',
};

const btnPrimary: React.CSSProperties = {
  width: '100%',
  padding: '15px 20px',
  borderRadius: 14,
  border: 'none',
  background: 'linear-gradient(135deg, #E57A97, #EC97B0)',
  color: '#fff',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'var(--font)',
  boxShadow: '0 6px 24px rgba(229,122,151,0.35)',
  transition: 'opacity 150ms',
};

type Step = 'identity' | 'photo' | 'email' | 'password';

export function JoinForm({
  establishmentId,
  establishmentName,
  unclaimedProfiles,
}: {
  establishmentId: string;
  establishmentName: string;
  unclaimedProfiles: UnclaimedProfile[];
}) {
  // Determine first step
  const firstStep: Step = unclaimedProfiles.length > 0 ? 'identity' : 'photo';

  const [step, setStep] = useState<Step>(firstStep);
  const [selectedProfile, setSelectedProfile] = useState<UnclaimedProfile | null>(null);
  const [newProfileName, setNewProfileName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  // The name we'll use for the profile
  const effectiveName = selectedProfile ? selectedProfile.full_name : newProfileName.trim();

  // ─── Photo upload ─────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `avatars/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { data, error: upErr } = await supabase.storage
        .from('public-media')
        .upload(path, file, { upsert: true });

      if (upErr || !data) throw upErr;

      const { data: { publicUrl } } = supabase.storage
        .from('public-media')
        .getPublicUrl(data.path);

      setAvatarUrl(publicUrl);
    } catch {
      setAvatarUrl(null);
      setAvatarPreview(null);
      setAvatarError('Échec de l\'envoi de la photo. Réessayez ou continuez sans photo.');
    }
    setAvatarUploading(false);
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: effectiveName } },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

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
      body: JSON.stringify({
        establishmentId,
        fullName: effectiveName,
        selectedProfileId: selectedProfile?.id ?? null,
        avatarUrl,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Erreur lors de la création du profil.');
      setLoading(false);
      return;
    }

    window.location.href = '/dashboard/onboarding';
  }

  // ─── Confirmation screen ──────────────────────────────────────────────────

  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--surface-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          fontSize: 28,
        }}>
          ✉
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
          Vérifiez votre email
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.7 }}>
          Un lien de confirmation a été envoyé à <strong>{email}</strong>.
          <br />
          Cliquez dessus pour activer votre compte et rejoindre <strong>{establishmentName}</strong>.
        </p>
      </div>
    );
  }

  // ─── Step: identity ───────────────────────────────────────────────────────

  if (step === 'identity') {
    return (
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 8 }}>
          Qui êtes-vous ?
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
          Sélectionnez votre nom pour rejoindre <strong>{establishmentName}</strong>.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {unclaimedProfiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setSelectedProfile(p);
                setStep('photo');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '16px 18px',
                borderRadius: 14,
                border: '1.5px solid var(--border)',
                background: 'var(--surface)',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'var(--font)',
                transition: 'border-color 150ms, background 150ms',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)';
              }}
            >
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'var(--accent)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {p.full_name.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                {p.full_name}
              </span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 18 }}>→</span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => {
              setSelectedProfile(null);
              setStep('photo');
            }}
            style={{
              padding: '14px 18px',
              borderRadius: 14,
              border: '1.5px dashed var(--border)',
              background: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'var(--font)',
              color: 'var(--text-3)',
              fontSize: 13.5,
              fontWeight: 500,
            }}
          >
            Mon nom n&apos;est pas dans la liste →
          </button>
        </div>
      </div>
    );
  }

  // ─── Step: photo ──────────────────────────────────────────────────────────

  if (step === 'photo') {
    return (
      <div>
        {step === 'photo' && selectedProfile && (
          <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 24 }}>
            Bonjour, <strong style={{ color: 'var(--text)' }}>{selectedProfile.full_name}</strong> !
          </p>
        )}
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 8 }}>
          Votre photo
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 28 }}>
          Ajoutez une photo pour que vos clients vous reconnaissent au moment de laisser un pourboire.
        </p>

        {/* Name field — only if creating a new profile */}
        {!selectedProfile && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--text-3)', marginBottom: 6 }}>
              Votre prénom et nom
            </label>
            <input
              autoFocus
              type="text"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              style={inp}
            />
          </div>
        )}

        {/* Photo upload zone */}
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            position: 'relative',
            width: 120,
            height: 120,
            borderRadius: '50%',
            margin: '0 auto 20px',
            cursor: 'pointer',
            background: avatarPreview ? 'transparent' : 'var(--surface-2)',
            border: avatarPreview ? 'none' : '2px dashed var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            transition: 'border-color 150ms',
          }}
        >
          {avatarPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, color: 'var(--text-3)', marginBottom: 4 }}>+</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>
                {avatarUploading ? 'Envoi…' : 'Ajouter'}
              </div>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)', marginBottom: avatarError ? 8 : 28 }}>
          JPG, PNG ou WebP · 2 Mo max
        </p>
        {avatarError && (
          <p style={{ fontSize: 12.5, color: 'var(--error)', textAlign: 'center', marginBottom: 20 }}>
            {avatarError}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={() => setStep('email')}
            disabled={!selectedProfile && !newProfileName.trim()}
            style={{
              ...btnPrimary,
              opacity: (!selectedProfile && !newProfileName.trim()) ? 0.4 : 1,
            }}
          >
            Continuer →
          </button>
          <button
            type="button"
            onClick={() => setStep('email')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-3)',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'var(--font)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              textAlign: 'center',
            }}
          >
            Passer, ajouter plus tard
          </button>
          {unclaimedProfiles.length > 0 && (
            <button
              type="button"
              onClick={() => setStep('identity')}
              style={{
                padding: '12px 20px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-2)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'var(--font)',
                textAlign: 'center',
              }}
            >
              ← Retour
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── Step: email ──────────────────────────────────────────────────────────

  if (step === 'email') {
    return (
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 8 }}>
          Votre email
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 28 }}>
          Utilisé pour vous connecter à votre compte Digitip.
        </p>

        {error && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--error-bg)', color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <input
          autoFocus
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && setStep('password')}
          style={{ ...inp, marginBottom: 20 }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={() => setStep('password')}
            disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
            style={{
              ...btnPrimary,
              opacity: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 1 : 0.4,
            }}
          >
            Continuer →
          </button>
          <button
            type="button"
            onClick={() => setStep('photo')}
            style={{
              padding: '12px 20px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-2)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--font)',
              textAlign: 'center',
            }}
          >
            ← Retour
          </button>
        </div>
      </div>
    );
  }

  // ─── Step: password ───────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit}>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 8 }}>
        Mot de passe
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 28 }}>
        Choisissez un mot de passe pour sécuriser votre compte.
      </p>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--error-bg)', color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <input
        autoFocus
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={8}
        style={{ ...inp, marginBottom: 8 }}
      />
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 20 }}>8 caractères minimum</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="submit"
          disabled={loading || password.length < 8}
          style={{
            ...btnPrimary,
            opacity: loading || password.length < 8 ? 0.5 : 1,
          }}
        >
          {loading ? 'Création du compte…' : `Rejoindre ${establishmentName} →`}
        </button>
        <button
          type="button"
          onClick={() => { setError(null); setStep('email'); }}
          style={{
            padding: '12px 20px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text-2)',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'var(--font)',
            textAlign: 'center',
          }}
        >
          ← Retour
        </button>
      </div>
    </form>
  );
}
