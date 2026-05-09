'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AddressAutocomplete } from '@/components/onboarding/AddressAutocomplete';

interface UnclaimedProfile {
  id: string;
  full_name: string;
  email?: string;
}

type Step = 'welcome' | 'identity' | 'name-photo' | 'payment-intro' | 'banking' | 'email' | 'password';

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

function parseAddressLabel(label: string): { line1: string; city: string; postal_code: string } {
  // BAN API format: "12 rue de la Paix, 75002 Paris"
  const commaIdx = label.lastIndexOf(',');
  if (commaIdx === -1) return { line1: label, city: '', postal_code: '' };
  const line1 = label.slice(0, commaIdx).trim();
  const rest = label.slice(commaIdx + 1).trim(); // "75002 Paris"
  const spaceIdx = rest.indexOf(' ');
  if (spaceIdx === -1) return { line1, city: rest, postal_code: '' };
  const postal_code = rest.slice(0, spaceIdx).trim();
  const city = rest.slice(spaceIdx + 1).trim();
  return { line1, city, postal_code };
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = [
  { value: 1, label: 'Janvier' }, { value: 2, label: 'Février' },
  { value: 3, label: 'Mars' }, { value: 4, label: 'Avril' },
  { value: 5, label: 'Mai' }, { value: 6, label: 'Juin' },
  { value: 7, label: 'Juillet' }, { value: 8, label: 'Août' },
  { value: 9, label: 'Septembre' }, { value: 10, label: 'Octobre' },
  { value: 11, label: 'Novembre' }, { value: 12, label: 'Décembre' },
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 1924 }, (_, i) => currentYear - 18 - i);

export function JoinForm({
  establishmentId,
  establishmentName,
  unclaimedProfiles,
}: {
  establishmentId: string;
  establishmentName: string;
  unclaimedProfiles: UnclaimedProfile[];
}) {
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

  // Banking
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [addressLabel, setAddressLabel] = useState('');
  const [iban, setIban] = useState('');
  const [tosAccepted, setTosAccepted] = useState(false);

  // Account
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
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
  const bankingFilled = dobDay && dobMonth && dobYear && addressLabel.trim() && iban.trim().length >= 15 && tosAccepted;
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
    } catch {
      setAvatarUrl(null);
      setAvatarPreview(null);
      setAvatarError('Échec de l\'envoi de la photo. Réessayez ou continuez sans photo.');
    }
    setAvatarUploading(false);
  }

  async function submitJoin() {
    const parsed = parseAddressLabel(addressLabel);
    const tosTimestamp = Math.floor(Date.now() / 1000);

    const res = await fetch('/api/staff/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        establishmentId,
        fullName: effectiveName,
        selectedProfileId: selectedProfile?.id ?? null,
        avatarUrl,
        bankingData: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          dob: { day: Number(dobDay), month: Number(dobMonth), year: Number(dobYear) },
          address: { ...parsed, country: 'FR' },
          iban: iban.replace(/\s/g, '').toUpperCase(),
          tosTimestamp,
        },
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Erreur lors de la création du profil.');
      setLoading(false);
      return;
    }

    window.location.href = '/dashboard';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (isAuthenticated) {
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
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.user && data.user.identities?.length === 0) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError || !signInData.session) {
        setError('Un compte existe déjà avec cet email. Vérifiez votre mot de passe ou utilisez un autre email.');
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
          margin: '0 auto 20px', fontSize: 28,
        }}>✉</div>
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

  // ─── Step: welcome ────────────────────────────────────────────────────────

  if (step === 'welcome') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'linear-gradient(135deg, #E57A97, #EC97B0)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', fontSize: 28,
        }}>💸</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 10 }}>
          Rejoignez {establishmentName}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.7, marginBottom: 8 }}>
          DigiTip permet à vos clients de vous laisser un pourboire directement depuis leur téléphone — sans espèces, sans appli.
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.7, marginBottom: 32 }}>
          En 2 minutes, vous serez prêt(e) à recevoir vos premiers pourboires sur votre compte bancaire.
        </p>
        <button
          type="button"
          onClick={() => setStep(unclaimedProfiles.length > 0 ? 'identity' : 'name-photo')}
          style={btnPrimary}
        >
          Commencer →
        </button>
      </div>
    );
  }

  // ─── Step: identity ───────────────────────────────────────────────────────

  if (step === 'identity') {
    return (
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 8 }}>
          Qui êtes-vous ?
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
          Sélectionnez votre prénom pour rejoindre l&apos;équipe.
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
            Mon prénom n&apos;est pas dans la liste →
          </button>
        </div>

        <button type="button" onClick={() => setStep('welcome')} style={{ ...btnSecondary, marginTop: 16 }}>
          ← Retour
        </button>
      </div>
    );
  }

  // ─── Step: name-photo ─────────────────────────────────────────────────────

  if (step === 'name-photo') {
    return (
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 8 }}>
          Votre prénom et photo
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 20 }}>
          C&apos;est ainsi que vous apparaîtrez sur la page de paiement de vos clients.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--text-3)', marginBottom: 6 }}>
            Prénom <span style={{ color: 'var(--accent)' }}>*</span>
          </label>
          <input
            autoFocus
            type="text"
            placeholder="ex : Océane"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            style={inp}
          />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--text-3)', marginBottom: 6 }}>
            Nom <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>(facultatif)</span>
          </label>
          <input
            type="text"
            placeholder="ex : Dupont"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            style={inp}
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 16 }}>
            Les profils avec photo reçoivent en moyenne <strong>3× plus de pourboires</strong>.
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
                  {avatarUploading ? 'Envoi…' : 'Photo'}
                </div>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} style={{ display: 'none' }} />
          <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-3)' }}>JPG, PNG ou WebP · 2 Mo max</p>
          {avatarError && <p style={{ fontSize: 12.5, color: 'var(--error)', textAlign: 'center', marginTop: 6 }}>{avatarError}</p>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
          <button
            type="button"
            onClick={() => setStep('payment-intro')}
            disabled={!firstNameFilled}
            style={{ ...btnPrimary, opacity: firstNameFilled ? 1 : 0.4 }}
          >
            Continuer →
          </button>
          <button type="button" onClick={() => setStep(unclaimedProfiles.length > 0 ? 'identity' : 'welcome')} style={btnSecondary}>
            ← Retour
          </button>
        </div>
      </div>
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
          margin: '0 auto 20px', fontSize: 26,
        }}>🏦</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 12 }}>
          Vos coordonnées bancaires
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 12 }}>
          Pour virer vos pourboires directement sur votre compte, nous avons besoin de votre IBAN et de quelques informations personnelles.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 32 }}>
          Ces informations sont transmises de façon chiffrée à notre partenaire de paiement <strong>Stripe</strong>. Votre IBAN ne sera jamais visible par votre employeur.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button type="button" onClick={() => setStep('banking')} style={btnPrimary}>
            Continuer →
          </button>
          <button type="button" onClick={() => setStep('name-photo')} style={btnSecondary}>
            ← Retour
          </button>
        </div>
      </div>
    );
  }

  // ─── Step: banking ────────────────────────────────────────────────────────

  if (step === 'banking') {
    const selectStyle: React.CSSProperties = {
      ...inp,
      appearance: 'none' as const,
      backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%23888\' stroke-width=\'1.5\' fill=\'none\'/%3E%3C/svg%3E")',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 14px center',
      paddingRight: 36,
    };

    return (
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 20 }}>
          Informations bancaires
        </h1>

        {error && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--error-bg)', color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* DOB */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--text-3)', marginBottom: 8 }}>
            Date de naissance <span style={{ color: 'var(--accent)' }}>*</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1.5fr', gap: 8 }}>
            <select value={dobDay} onChange={(e) => setDobDay(e.target.value)} style={selectStyle}>
              <option value="">Jour</option>
              {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={dobMonth} onChange={(e) => setDobMonth(e.target.value)} style={selectStyle}>
              <option value="">Mois</option>
              {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select value={dobYear} onChange={(e) => setDobYear(e.target.value)} style={selectStyle}>
              <option value="">Année</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Address */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--text-3)', marginBottom: 8 }}>
            Adresse personnelle <span style={{ color: 'var(--accent)' }}>*</span>
          </label>
          <AddressAutocomplete
            value={addressLabel}
            onChange={setAddressLabel}
            style={inp}
          />
        </div>

        {/* IBAN */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--text-3)', marginBottom: 8 }}>
            IBAN <span style={{ color: 'var(--accent)' }}>*</span>
          </label>
          <input
            type="text"
            value={iban}
            onChange={(e) => setIban(e.target.value.toUpperCase())}
            placeholder="FR76 3000 4000 0312 3456 7890 143"
            style={{ ...inp, fontFamily: 'monospace', letterSpacing: '0.05em' }}
            autoComplete="off"
          />
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
            Votre IBAN se trouve sur votre relevé de compte ou dans votre application bancaire.
          </p>
        </div>

        {/* ToS */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 24 }}>
          <input
            type="checkbox"
            checked={tosAccepted}
            onChange={(e) => setTosAccepted(e.target.checked)}
            style={{ marginTop: 2, flexShrink: 0, accentColor: '#E57A97', width: 16, height: 16 }}
          />
          <span style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
            J&apos;accepte les{' '}
            <a href="https://stripe.com/fr/legal/connect-account" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
              Conditions d&apos;utilisation de Stripe
            </a>
            {' '}pour la réception de paiements sur mon compte.
          </span>
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={async () => {
              if (isAuthenticated) {
                setError(null);
                setLoading(true);
                await submitJoin();
              } else {
                setStep('email');
              }
            }}
            disabled={!bankingFilled || loading}
            style={{ ...btnPrimary, opacity: bankingFilled && !loading ? 1 : 0.4 }}
          >
            {loading ? 'Création du compte…' : 'Continuer →'}
          </button>
          <button type="button" onClick={() => { setError(null); setStep('payment-intro'); }} style={btnSecondary}>
            ← Retour
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
          Votre email
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
          Utilisé pour vous connecter à votre compte DigiTip.
        </p>

        {prefilledEmail && (
          <div style={{
            padding: '10px 14px', borderRadius: 10,
            background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
            fontSize: 12.5, color: 'var(--text-3)', marginBottom: 12,
          }}>
            Votre responsable a pré-renseigné votre email. Vous pouvez le modifier si nécessaire.
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
            Continuer →
          </button>
          <button type="button" onClick={() => setStep('banking')} style={btnSecondary}>
            ← Retour
          </button>
        </div>
      </div>
    );
  }

  // ─── Step: password ───────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 8 }}>
        Mot de passe
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
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
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 24 }}>8 caractères minimum</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="submit"
          disabled={loading || password.length < 8}
          style={{ ...btnPrimary, opacity: loading || password.length < 8 ? 0.5 : 1 }}
        >
          {loading ? 'Création du compte…' : `Rejoindre ${establishmentName} →`}
        </button>
        <button
          type="button"
          onClick={() => { setError(null); setStep('email'); }}
          style={btnSecondary}
        >
          ← Retour
        </button>
      </div>
    </form>
  );
}
