'use client';

import { useState } from 'react';

interface Props {
  code: string;
  onDone: () => void;
  defaults?: { email?: string | null; phone?: string | null; city?: string | null };
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 13.5, boxSizing: 'border-box', outline: 'none',
};
const label: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block',
};

export function AmbassadeurBankingForm({ code, onDone, defaults }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState(defaults?.city ?? '');
  const [postalCode, setPostalCode] = useState('');
  const [iban, setIban] = useState('');
  const [siret, setSiret] = useState('');
  const [email, setEmail] = useState(defaults?.email ?? '');
  const [phone, setPhone] = useState(defaults?.phone ?? '');
  const [tos, setTos] = useState(false);
  const [pledge, setPledge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) { setError('Prénom et nom requis.'); return; }
    if (!dobDay || !dobMonth || !dobYear) { setError('Date de naissance requise.'); return; }
    if (!addressLine.trim() || !city.trim() || !/^\d{5}$/.test(postalCode)) {
      setError('Adresse complète requise (rue, code postal 5 chiffres, ville).'); return;
    }
    if (iban.replace(/\s/g, '').length < 15) { setError('IBAN invalide.'); return; }
    if (!/^\d{14}$/.test(siret.replace(/\s+/g, ''))) {
      setError("SIRET invalide. Pas encore de SIRET ? Crée-le gratuitement sur autoentrepreneur.urssaf.fr."); return;
    }
    if (!email.trim()) { setError('Email requis.'); return; }
    if (!tos) { setError('Tu dois accepter les conditions Stripe.'); return; }
    if (!pledge) { setError("Tu dois accepter l'engagement de non-fraude."); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/ambassadeur/${encodeURIComponent(code)}/banking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          dob: { day: parseInt(dobDay), month: parseInt(dobMonth), year: parseInt(dobYear) },
          address: { line1: addressLine.trim(), city: city.trim(), postal_code: postalCode, country: 'FR' },
          iban: iban.toUpperCase(),
          siret: siret.replace(/\s+/g, ''),
          email: email.trim(),
          phone: phone.trim() || undefined,
          tosAccepted: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erreur.'); return; }
      onDone();
    } catch {
      setError('Erreur réseau.');
    } finally {
      setSubmitting(false);
    }
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 80 }, (_, i) => currentYear - 18 - i);
  const months = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        background: 'var(--accent-muted)', border: '1px solid var(--accent-border)',
        borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4,
      }}>
        <strong>SIRET obligatoire</strong> pour recevoir tes virements.<br />
        Pas encore de SIRET ? Crée-le gratuitement sur{' '}
        <a href="https://autoentrepreneur.urssaf.fr" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          autoentrepreneur.urssaf.fr
        </a>{' '}avant de continuer.
      </div>

      {error && (
        <div style={{ fontSize: 12.5, color: 'var(--error)', padding: '10px 14px', background: 'var(--error-bg)', borderRadius: 8 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><span style={label}>Prénom</span><input style={inp} value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
        <div><span style={label}>Nom</span><input style={inp} value={lastName} onChange={e => setLastName(e.target.value)} /></div>
      </div>

      <div>
        <span style={label}>Date de naissance</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1.2fr', gap: 8 }}>
          <select style={inp} value={dobDay} onChange={e => setDobDay(e.target.value)}>
            <option value="">Jour</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={String(d).padStart(2,'0')}>{d}</option>)}
          </select>
          <select style={inp} value={dobMonth} onChange={e => setDobMonth(e.target.value)}>
            <option value="">Mois</option>
            {months.map((m, i) => <option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
          </select>
          <select style={inp} value={dobYear} onChange={e => setDobYear(e.target.value)}>
            <option value="">Année</option>
            {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
        </div>
      </div>

      <div><span style={label}>Adresse (rue et numéro)</span><input style={inp} value={addressLine} onChange={e => setAddressLine(e.target.value)} placeholder="12 rue de la Paix" /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
        <div><span style={label}>Code postal</span><input style={inp} value={postalCode} onChange={e => setPostalCode(e.target.value.replace(/\D/g, '').slice(0,5))} placeholder="75002" /></div>
        <div><span style={label}>Ville</span><input style={inp} value={city} onChange={e => setCity(e.target.value)} placeholder="Paris" /></div>
      </div>

      <div><span style={label}>Email</span><input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="toi@email.com" /></div>
      <div><span style={label}>Téléphone (optionnel)</span><input style={inp} value={phone} onChange={e => setPhone(e.target.value)} placeholder="06 12 34 56 78" /></div>

      <div>
        <span style={label}>SIRET (14 chiffres)</span>
        <input style={inp} value={siret} onChange={e => setSiret(e.target.value)} placeholder="12345678901234" inputMode="numeric" />
      </div>

      <div>
        <span style={label}>IBAN</span>
        <input style={inp} value={iban} onChange={e => setIban(e.target.value.toUpperCase())} placeholder="FR76 3000 1007 9412 3456 7890 185" />
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={tos} onChange={e => setTos(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
          J&apos;accepte les{' '}
          <a href="https://stripe.com/fr/legal/connect-account" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
            conditions Stripe Connect
          </a>.
        </span>
      </label>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={pledge} onChange={e => setPledge(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Je m&apos;engage à ne pas frauder (pas de fausses ventes, pas de codes promo utilisés sur mes propres commandes).
        </span>
      </label>

      <button
        onClick={submit}
        disabled={submitting}
        style={{
          padding: '12px 20px', borderRadius: 10, border: 'none',
          background: 'var(--accent)', color: '#fff', fontSize: 13.5, fontWeight: 700,
          cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? 'Configuration…' : 'Configurer mes virements →'}
      </button>
    </div>
  );
}

export function AmbassadeurPayoutPanel({
  code,
  banking,
  payout,
  onChanged,
}: {
  code: string;
  banking: BankingPanelData;
  payout: PayoutData | null;
  onChanged: () => void;
}) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fmt = (cents: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

  async function handlePayout() {
    if (!payout) return;
    setError(null);
    setSuccessMsg(null);
    setRequesting(true);
    try {
      const res = await fetch(`/api/ambassadeur/${encodeURIComponent(code)}/payout`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erreur.'); return; }
      if (data.status === 'paid') {
        setSuccessMsg(`Virement de ${fmt(data.amount)} envoyé ! Arrivée sous 1-2 jours ouvrés.`);
      } else {
        setSuccessMsg(`Demande de ${fmt(data.amount)} enregistrée. ${data.note ?? 'Validation par l\'administrateur.'}`);
      }
      onChanged();
    } catch {
      setError('Erreur réseau.');
    } finally {
      setRequesting(false);
    }
  }

  if (!banking.hasStripeAccount) {
    return (
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', padding: 18, marginBottom: 16,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          💰 Virements
        </div>
        {!setupOpen ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
              Configure ton RIB + SIRET pour recevoir tes commissions par virement bancaire.
            </div>
            <button
              onClick={() => setSetupOpen(true)}
              style={{
                padding: '10px 18px', borderRadius: 10, border: 'none',
                background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Configurer mon compte bancaire →
            </button>
          </>
        ) : (
          <AmbassadeurBankingForm
            code={code}
            onDone={() => { setSetupOpen(false); onChanged(); }}
            defaults={{ email: banking.email, phone: banking.phone, city: banking.city }}
          />
        )}
      </div>
    );
  }

  // Banking is configured — show available balance + payout button
  const available = payout?.available ?? 0;
  const minCents = payout?.minPayoutCents ?? 3000;
  const canPayout = available >= minCents;

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: 18, marginBottom: 16,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
        💰 Virements
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Solde disponible</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1 }}>
            {fmt(available)}
          </div>
        </div>
        {payout && payout.paidOrPendingTotal > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>
            Déjà versé : {fmt(payout.paidOrPendingTotal)}
          </div>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 12.5, color: 'var(--error)', padding: '8px 12px', background: 'var(--error-bg)', borderRadius: 8, marginBottom: 10 }}>
          {error}
        </div>
      )}
      {successMsg && (
        <div style={{ fontSize: 12.5, color: 'var(--success)', padding: '8px 12px', background: 'var(--success-bg)', borderRadius: 8, marginBottom: 10 }}>
          {successMsg}
        </div>
      )}

      <button
        onClick={handlePayout}
        disabled={!canPayout || requesting}
        style={{
          width: '100%', padding: '11px 20px', borderRadius: 10, border: 'none',
          background: canPayout ? 'var(--accent)' : 'var(--surface-3)',
          color: canPayout ? '#fff' : 'var(--text-3)',
          fontSize: 13.5, fontWeight: 700,
          cursor: canPayout && !requesting ? 'pointer' : 'not-allowed',
          opacity: requesting ? 0.7 : 1,
        }}
      >
        {requesting ? 'Demande en cours…' : `Virer ${fmt(available)} sur mon IBAN →`}
      </button>

      {!canPayout && (
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8, textAlign: 'center' }}>
          Minimum 30 € — il te manque {fmt(minCents - available)}.
        </div>
      )}

      {payout && payout.history.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            Historique
          </div>
          {payout.history.slice(0, 5).map((h) => (
            <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 12 }}>
              <span style={{ color: 'var(--text-3)' }}>
                {new Date(h.requested_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
              </span>
              <span style={{ fontWeight: 600 }}>{fmt(h.amount_cents)}</span>
              <span style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 99,
                background: h.status === 'paid' ? 'var(--success-bg)' : h.status === 'pending' ? 'var(--warning-bg)' : 'var(--error-bg)',
                color: h.status === 'paid' ? 'var(--success)' : h.status === 'pending' ? 'var(--warning)' : 'var(--error)',
                fontWeight: 600,
              }}>
                {h.status === 'paid' ? 'Payé' : h.status === 'pending' ? 'En attente' : 'Échec'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface BankingPanelData {
  hasStripeAccount: boolean;
  onboardingStatus: string;
  siret: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
}

interface PayoutData {
  available: number;
  earnedTotal: number;
  paidOrPendingTotal: number;
  minPayoutCents: number;
  history: Array<{ id: string; amount_cents: number; status: string; requested_at: string; paid_at: string | null }>;
}
