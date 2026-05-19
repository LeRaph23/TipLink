'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 14, boxSizing: 'border-box', outline: 'none',
};
const label: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block',
};

const DRAFT_KEY = 'digitip_ambassador_draft';

interface Draft {
  firstName: string; lastName: string; city: string; phone: string;
  email: string; siret: string; notes: string;
}

export function RecruitmentLandingForm() {
  const params = useSearchParams();
  const referrerCode = params.get('ref') ?? '';
  const utmId = params.get('utm_id') ?? '';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [siret, setSiret] = useState('');
  const [pledge, setPledge] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d: Partial<Draft> = JSON.parse(raw);
      /* eslint-disable react-hooks/set-state-in-effect -- restores a saved draft
         from localStorage on mount; localStorage is unavailable during SSR. */
      if (d.firstName) setFirstName(d.firstName);
      if (d.lastName) setLastName(d.lastName);
      if (d.city) setCity(d.city);
      if (d.phone) setPhone(d.phone);
      if (d.email) setEmail(d.email);
      if (d.siret) setSiret(d.siret);
      if (d.notes) setNotes(d.notes);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const draft: Draft = { firstName, lastName, city, phone, email, siret, notes };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
  }, [firstName, lastName, city, phone, email, siret, notes]);

  async function submit() {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) { setError('Prénom et nom requis.'); return; }
    if (!city.trim()) { setError('Ville requise.'); return; }
    if (!phone.trim()) { setError('Téléphone requis.'); return; }
    if (!email.trim() || !email.includes('@')) { setError('Email valide requis.'); return; }
    const siretClean = siret.replace(/\s+/g, '');
    if (siretClean && !/^\d{14}$/.test(siretClean)) {
      setError('SIRET : 14 chiffres. Laissez le champ vide si vous n\'en avez pas encore.');
      return;
    }
    if (!pledge) { setError("Vous devez accepter l'engagement de non-fraude."); return; }

    setSubmitting(true);
    try {
      const source = referrerCode ? 'referral' : utmId ? 'cold_email' : 'landing';
      const res = await fetch('/api/ambassadeur/recruitment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          city: city.trim(),
          phone: phone.trim(),
          email: email.trim(),
          siret: siretClean || undefined,
          noFraudPledge: true,
          notes: notes.trim() || undefined,
          referrerCode: referrerCode || undefined,
          source,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erreur.'); return; }
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      setDone(true);
    } catch {
      setError('Erreur réseau, veuillez réessayer.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div style={{
        background: 'var(--success-bg)', border: '1px solid var(--success)',
        borderRadius: 12, padding: '24px 20px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>
          Candidature envoyée !
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Nous revenons vers vous sous 48h avec votre code promo et votre PIN.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {referrerCode && (
        <div style={{
          fontSize: 13, color: 'var(--accent, #22c55e)', padding: '10px 14px',
          background: 'var(--accent-muted, rgba(34,197,94,0.08))',
          border: '1px solid var(--accent-border, rgba(34,197,94,0.2))', borderRadius: 8,
        }}>
          ✓ Vous rejoignez via le parrainage de <strong>{referrerCode}</strong>
        </div>
      )}
      {error && (
        <div style={{
          fontSize: 13, color: 'var(--error)', padding: '10px 14px',
          background: 'var(--error-bg)', borderRadius: 8,
        }}>{error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><span style={label}>Prénom</span><input style={inp} value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
        <div><span style={label}>Nom</span><input style={inp} value={lastName} onChange={e => setLastName(e.target.value)} /></div>
      </div>

      <div><span style={label}>Ville</span><input style={inp} value={city} onChange={e => setCity(e.target.value)} placeholder="Paris" /></div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><span style={label}>Téléphone</span><input style={inp} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="06 12 34 56 78" /></div>
        <div><span style={label}>Email</span><input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@email.com" /></div>
      </div>

      <div>
        <span style={label}>SIRET (14 chiffres) — optionnel</span>
        <input style={inp} value={siret} onChange={e => setSiret(e.target.value)} placeholder="Pas encore de SIRET ? Laisse vide" inputMode="numeric" />
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5, lineHeight: 1.4 }}>
          Pas besoin de SIRET pour postuler. Pour démarcher ensuite, vous devrez avoir déclaré
          votre statut d&apos;auto-entrepreneur — gratuit, ~10 min sur{' '}
          <a href="https://autoentrepreneur.urssaf.fr" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
            autoentrepreneur.urssaf.fr
          </a>{' '}— et vous démarrez le jour même.
        </div>
      </div>

      <div>
        <span style={label}>Un mot sur vous (optionnel)</span>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          style={{ ...inp, resize: 'vertical', fontFamily: 'var(--font)' }}
          placeholder="Parcours, expérience, motivation…"
        />
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '8px 0' }}>
        <input
          type="checkbox"
          checked={pledge}
          onChange={e => setPledge(e.target.checked)}
          style={{ marginTop: 3, accentColor: 'var(--accent)', width: 16, height: 16, flexShrink: 0 }}
        />
        <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Je m&apos;engage à ne pas frauder : pas de fausses ventes, pas d&apos;auto-utilisation de mon code promo,
          pas de transactions montées avec des proches dans le seul but de toucher des commissions.
        </span>
      </label>

      <button
        onClick={submit}
        disabled={submitting}
        style={{
          padding: '13px 24px', borderRadius: 10, border: 'none',
          background: 'var(--accent)', color: '#fff',
          fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
          opacity: submitting ? 0.7 : 1, marginTop: 4,
        }}
      >
        {submitting ? 'Envoi…' : 'Envoyer ma candidature →'}
      </button>
    </div>
  );
}
