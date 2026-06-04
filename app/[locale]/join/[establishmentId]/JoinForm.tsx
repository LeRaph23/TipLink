'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { mapAuthError } from '@/lib/auth/map-auth-error';
import { Icon, type IconName } from '@/components/ambassadeur/icons';
import { StripeOnboardingPrimer } from '@/components/payment/StripeOnboardingPrimer';

interface UnclaimedProfile {
  id: string;
  full_name: string;
  email?: string;
}

type Step = 'welcome' | 'identity' | 'name-photo' | 'payment-intro' | 'email' | 'password' | 'pre-stripe';

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

const btnSecondary: React.CSSProperties = {
  padding: '12px 20px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text-2)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'var(--font)',
  textAlign: 'center' as const,
  width: '100%',
};

// Light reassurance bullet: a line-style icon + one short sentence. Replaces the
// dense reassurance paragraphs on the welcome / payment-intro steps.
function Bullet({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <span style={{
        flexShrink: 0, width: 28, height: 28, borderRadius: 8,
        background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--accent)',
      }}>
        <Icon name={icon} size={15} />
      </span>
      <span style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.5, paddingTop: 4 }}>
        {children}
      </span>
    </li>
  );
}

export function JoinForm({
  establishmentId,
  establishmentName,
  unclaimedProfiles,
}: {
  establishmentId: string;
  establishmentName: string;
  unclaimedProfiles: UnclaimedProfile[];
}) {
  const locale = useLocale();
  const t = useTranslations('join');
  const tAuth = useTranslations('auth');
  const tUpload = useTranslations('imageUpload');
  const [step, setStep] = useState<Step>('welcome');
  const [selectedProfile, setSelectedProfile] = useState<UnclaimedProfile | null>(null);

  // Name + photo
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Account
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: import('@supabase/supabase-js').User | null } }) => {
      if (!user) return;
      setIsAuthenticated(true);
      const profileId = user.user_metadata?.staff_profile_id as string | undefined;
      const byId = profileId ? unclaimedProfiles.find((p) => p.id === profileId) : undefined;
      const byEmail = user.email ? unclaimedProfiles.find((p) => p.email === user.email) : undefined;
      const match = byId ?? byEmail;
      if (match) {
        const parts = match.full_name.trim().split(/\s+/);
        setFirstName(parts[0] ?? '');
        setLastName(parts.slice(1).join(' '));
        if (match.email) setEmail(match.email);
        setSelectedProfile(match);
        setStep('name-photo');
      } else {
        setStep('name-photo');
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
  const firstNameFilled = firstName.trim().length > 0;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  function selectProfile(p: UnclaimedProfile) {
    setSelectedProfile(p);
    const parts = p.full_name.trim().split(/\s+/);
    setFirstName(parts[0] ?? '');
    setLastName(parts.slice(1).join(' '));
    if (p.email) setEmail(p.email);
    setStep('name-photo');
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload/avatar', { method: 'POST', body: form });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? 'Upload failed');
      setAvatarUrl(json.url);
    } catch (err) {
      console.error('[join] avatar upload failed', err);
      setAvatarUrl(null);
      setAvatarPreview(null);
      setAvatarError(tUpload('photoFailed'));
    }
    setAvatarUploading(false);
  }

  async function submitJoin() {
    const res = await fetch('/api/staff/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        establishmentId,
        fullName: effectiveName,
        selectedProfileId: selectedProfile?.id ?? null,
        avatarUrl,
        locale,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      console.error('[join] profile creation failed', res.status, body.error);
      setError(tAuth('errorGeneric'));
      setLoading(false);
      return;
    }

    // Before handing off to Stripe's hosted onboarding, walk the staff member
    // through the same pre-onboarding primer as the dashboard banking setup.
    const body = (await res.json().catch(() => ({}))) as { onboardingUrl?: string };
    if (body.onboardingUrl) {
      setOnboardingUrl(body.onboardingUrl);
      setStep('pre-stripe');
      setLoading(false);
    } else {
      window.location.href = `/${locale}/dashboard`;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (isAuthenticated) {
      // Invited via the magic link → already signed in but with no password yet.
      // Set one now so they can log back in later, then finish joining.
      const supabase = createClient();
      const { error: pwErr } = await supabase.auth.updateUser({ password });
      if (pwErr) {
        setError(mapAuthError(pwErr.message, tAuth));
        setLoading(false);
        return;
      }
      await submitJoin();
      return;
    }

    const supabase = createClient();
    let session: import('@supabase/supabase-js').Session | null = null;

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: effectiveName } },
    });

    if (signUpError) {
      console.error('[join] signup failed', signUpError.message);
      setError(mapAuthError(signUpError.message, tAuth));
      setLoading(false);
      return;
    }

    if (data.user && data.user.identities?.length === 0) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError || !signInData.session) {
        setError(tAuth('errorEmailInUse'));
        setLoading(false);
        return;
      }
      session = signInData.session;
    } else {
      session = data.session;
    }

    if (!session) {
      setDone(true);
      setLoading(false);
      return;
    }

    await submitJoin();
  }

  // ─── Done (email verification pending) ───────────────────────────────────

  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--surface-2)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', color: 'var(--accent)',
        }}><Icon name="mail" size={26} /></div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
          {t('verifyEmail.title')}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.7 }}>
          {t.rich('verifyEmail.body', {
            email,
            name: establishmentName,
            b: (c) => <strong>{c}</strong>,
          })}
        </p>
      </div>
    );
  }

  // ─── Step: welcome ────────────────────────────────────────────────────────

  if (step === 'welcome') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'linear-gradient(135deg, #E57A97, #EC97B0)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', color: '#fff',
        }}><Icon name="bank" size={28} /></div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 8 }}>
          {t('welcome.title', { name: establishmentName })}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
          {t('welcome.subtitle')}
        </p>

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
          <Bullet icon="phone">{t('welcome.bullet1')}</Bullet>
          <Bullet icon="bank">{t('welcome.bullet2')}</Bullet>
          <Bullet icon="clock">{t('welcome.bullet3')}</Bullet>
        </ul>

        <button
          type="button"
          onClick={() => setStep(unclaimedProfiles.length > 0 ? 'identity' : 'name-photo')}
          style={btnPrimary}
        >
          {t('welcome.start')}
        </button>
      </div>
    );
  }

  // ─── Step: identity ───────────────────────────────────────────────────────

  if (step === 'identity') {
    return (
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 8 }}>
          {t('identity.title')}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
          {t('identity.subtitle')}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {unclaimedProfiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectProfile(p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '16px 18px', borderRadius: 14,
                border: '1.5px solid var(--border)',
                background: 'var(--surface)', cursor: 'pointer',
                textAlign: 'left', fontFamily: 'var(--font)',
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
                width: 40, height: 40, borderRadius: '50%',
                background: 'var(--accent)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, flexShrink: 0,
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
            onClick={() => { setSelectedProfile(null); setStep('name-photo'); }}
            style={{
              padding: '14px 18px', borderRadius: 14,
              border: '1.5px dashed var(--border)', background: 'none',
              cursor: 'pointer', textAlign: 'left',
              fontFamily: 'var(--font)', color: 'var(--text-3)',
              fontSize: 13.5, fontWeight: 500,
            }}
          >
            {t('identity.notListed')}
          </button>
        </div>

        <button type="button" onClick={() => setStep('welcome')} style={{ ...btnSecondary, marginTop: 16 }}>
          {t('back')}
        </button>
      </div>
    );
  }

  // ─── Step: name-photo ─────────────────────────────────────────────────────

  if (step === 'name-photo') {
    return (
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 8 }}>
          {t('namePhoto.title')}
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 20 }}>
          {t('namePhoto.subtitle')}
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--text-3)', marginBottom: 6 }}>
            {t('namePhoto.firstName')} <span style={{ color: 'var(--accent)' }}>*</span>
          </label>
          <input
            autoFocus
            type="text"
            placeholder={t('namePhoto.firstNamePlaceholder')}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            style={inp}
          />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--text-3)', marginBottom: 6 }}>
            {t('namePhoto.lastName')} <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>{t('namePhoto.optional')}</span>
          </label>
          <input
            type="text"
            placeholder={t('namePhoto.lastNamePlaceholder')}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            style={inp}
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 16 }}>
            {t.rich('namePhoto.photoTip', { b: (c) => <strong>{c}</strong> })}
          </p>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              position: 'relative', width: 100, height: 100, borderRadius: '50%',
              margin: '0 auto 12px', cursor: 'pointer',
              background: avatarPreview ? 'transparent' : 'var(--surface-2)',
              border: avatarPreview ? 'none' : '2px dashed var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            }}
          >
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 26, color: 'var(--text-3)', marginBottom: 4 }}>+</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>
                  {avatarUploading ? t('namePhoto.uploading') : t('namePhoto.photo')}
                </div>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} style={{ display: 'none' }} />
          <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-3)' }}>{t('namePhoto.photoHint')}</p>
          {avatarError && <p style={{ fontSize: 12.5, color: 'var(--error)', textAlign: 'center', marginTop: 6 }}>{avatarError}</p>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
          <button
            type="button"
            onClick={() => setStep(isAuthenticated ? 'password' : 'email')}
            disabled={!firstNameFilled}
            style={{ ...btnPrimary, opacity: firstNameFilled ? 1 : 0.4 }}
          >
            {t('continue')}
          </button>
          <button type="button" onClick={() => setStep(unclaimedProfiles.length > 0 ? 'identity' : 'welcome')} style={btnSecondary}>
            {t('back')}
          </button>
        </div>
      </div>
    );
  }

  // ─── Step: pre-stripe (the shared pre-onboarding primer before Stripe) ─────

  if (step === 'pre-stripe') {
    return (
      <StripeOnboardingPrimer
        onContinue={() => { window.location.href = onboardingUrl ?? `/${locale}/dashboard`; }}
        error={error}
      />
    );
  }

  // ─── Step: payment-intro ──────────────────────────────────────────────────

  if (step === 'payment-intro') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--surface-2)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', color: 'var(--accent)',
        }}><Icon name="bank" size={26} /></div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 8 }}>
          {t('payment.title')}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 20 }}>
          {t.rich('payment.subtitle', { b: (c) => <strong>{c}</strong> })}
        </p>

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
          <Bullet icon="bank">{t('payment.bullet1')}</Bullet>
          <Bullet icon="lock">{t('payment.bullet2')}</Bullet>
          <Bullet icon="checkCircle">{t('payment.bullet3')}</Bullet>
        </ul>
        {error && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--error-bg)', color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep(isAuthenticated ? 'password' : 'email');
            }}
            style={btnPrimary}
          >
            {t('continue')}
          </button>
          <button type="button" onClick={() => setStep('name-photo')} style={btnSecondary}>
            {t('back')}
          </button>
        </div>
      </div>
    );
  }

  // ─── Step: email ──────────────────────────────────────────────────────────

  if (step === 'email') {
    const prefilledEmail = selectedProfile?.email;
    return (
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 8 }}>
          {t('email.title')}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
          {t('email.subtitle')}
        </p>

        {prefilledEmail && (
          <div style={{
            padding: '10px 14px', borderRadius: 10,
            background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
            fontSize: 12.5, color: 'var(--text-3)', marginBottom: 12,
          }}>
            {t('email.prefilled')}
          </div>
        )}

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
          onKeyDown={(e) => e.key === 'Enter' && emailValid && setStep('password')}
          style={{ ...inp, marginBottom: 20 }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={() => setStep('password')}
            disabled={!emailValid}
            style={{ ...btnPrimary, opacity: emailValid ? 1 : 0.4 }}
          >
            {t('continue')}
          </button>
          <button type="button" onClick={() => setStep('name-photo')} style={btnSecondary}>
            {t('back')}
          </button>
        </div>
      </div>
    );
  }

  // ─── Step: password ───────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 8 }}>
        {t('password.title')}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
        {t('password.subtitle')}
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
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 24 }}>{t('password.hint')}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="submit"
          disabled={loading || password.length < 8}
          style={{ ...btnPrimary, opacity: loading || password.length < 8 ? 0.5 : 1 }}
        >
          {loading ? t('creatingAccount') : t('password.join', { name: establishmentName })}
        </button>
        <button
          type="button"
          onClick={() => { setError(null); setStep(isAuthenticated ? 'name-photo' : 'email'); }}
          style={btnSecondary}
        >
          {t('back')}
        </button>
      </div>
    </form>
  );
}
