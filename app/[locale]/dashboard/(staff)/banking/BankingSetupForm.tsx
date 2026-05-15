'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AddressAutocomplete } from '@/components/onboarding/AddressAutocomplete';
import { setupStaffBanking, updateBankAccountIBAN } from '@/actions/stripe';
import type { BankingData } from '@/actions/stripe';
import { validateIban, formatIbanFriendly } from '@/lib/banking/iban';

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 13.5, fontFamily: 'var(--font)',
  boxSizing: 'border-box', outline: 'none',
};
const label: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block',
};
const primaryBtn: React.CSSProperties = {
  padding: '11px 20px', borderRadius: 10, border: 'none',
  background: 'var(--accent)', color: '#fff',
  fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'var(--font)', width: '100%',
};

function parseAddressLabel(label: string): { line1: string; city: string; postal_code: string } {
  // BAN API format: "12 rue de la Paix 75002 Paris" or "12 rue de la Paix, 75002 Paris"
  const normalized = label.replace(',', '');
  const match = normalized.match(/^(.+?)\s+(\d{5})\s+(.+)$/);
  if (match) {
    return { line1: match[1].trim(), postal_code: match[2], city: match[3].trim() };
  }
  return { line1: label, postal_code: '', city: '' };
}

interface SetupProps {
  mode: 'setup';
  fullName: string;
}
interface UpdateProps {
  mode: 'update';
  fullName: string;
}
type Props = SetupProps | UpdateProps;

export function BankingSetupForm({ mode, fullName }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Setup state
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [address, setAddress] = useState('');
  const [iban, setIban] = useState('');
  const [tosAccepted, setTosAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.slice(1).join(' ') || firstName;

  function handleSetup() {
    if (!dobDay || !dobMonth || !dobYear) { setError('Date de naissance requise'); return; }
    if (!address.trim()) { setError('Adresse requise'); return; }
    const ibanResult = validateIban(iban);
    if (!ibanResult.ok) { setError(ibanResult.error); return; }
    if (!tosAccepted) { setError('Vous devez accepter les conditions Stripe'); return; }

    setError(null);
    const parsed = parseAddressLabel(address);
    const data: Omit<BankingData, 'email' | 'ip'> = {
      firstName,
      lastName,
      dob: { day: parseInt(dobDay), month: parseInt(dobMonth), year: parseInt(dobYear) },
      address: { line1: parsed.line1, city: parsed.city, postal_code: parsed.postal_code, country: 'FR' },
      iban: ibanResult.normalized,
      tosTimestamp: Math.floor(Date.now() / 1000),
    };

    startTransition(async () => {
      const res = await setupStaffBanking(data);
      if ('error' in res) { setError(res.error); return; }
      setSuccess(true);
      router.refresh();
    });
  }

  function handleUpdate() {
    const ibanResult = validateIban(iban);
    if (!ibanResult.ok) { setError(ibanResult.error); return; }
    setError(null);

    startTransition(async () => {
      const res = await updateBankAccountIBAN(ibanResult.normalized, fullName);
      if ('error' in res) { setError(res.error); return; }
      setSuccess(true);
      router.refresh();
    });
  }

  if (success) {
    return (
      <div style={{
        background: 'var(--success-bg)', border: '1px solid var(--success)',
        borderRadius: 'var(--radius)', padding: '20px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--success)' }}>
          {mode === 'setup' ? 'Compte bancaire configuré !' : 'IBAN mis à jour !'}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 6 }}>
          Vos virements seront effectués sur ce compte.
        </div>
      </div>
    );
  }

  if (mode === 'update') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <div style={{ fontSize: 12.5, color: 'var(--error)', padding: '10px 14px', background: 'var(--error-bg)', borderRadius: 8 }}>{error}</div>}
        <div>
          <span style={label}>Nouveau numéro IBAN</span>
          <input
            style={inp}
            value={iban}
            onChange={e => setIban(e.target.value.toUpperCase())}
            onBlur={() => iban.trim() && setIban(formatIbanFriendly(iban))}
            placeholder="FR76 3000 1007 9412 3456 7890 185"
          />
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5 }}>
            L&apos;IBAN actuel sera remplacé. Les paiements futurs seront versés sur ce nouveau compte.
          </div>
        </div>
        <button style={primaryBtn} disabled={pending} onClick={handleUpdate}>
          {pending ? 'Mise à jour…' : 'Mettre à jour l\'IBAN →'}
        </button>
      </div>
    );
  }

  // Setup mode
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 80 }, (_, i) => currentYear - 18 - i);
  const months = [
    ['01', 'Janvier'], ['02', 'Février'], ['03', 'Mars'], ['04', 'Avril'],
    ['05', 'Mai'], ['06', 'Juin'], ['07', 'Juillet'], ['08', 'Août'],
    ['09', 'Septembre'], ['10', 'Octobre'], ['11', 'Novembre'], ['12', 'Décembre'],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && <div style={{ fontSize: 12.5, color: 'var(--error)', padding: '10px 14px', background: 'var(--error-bg)', borderRadius: 8 }}>{error}</div>}

      {/* DOB */}
      <div>
        <span style={label}>Date de naissance</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1.5fr', gap: 8 }}>
          <select style={inp} value={dobDay} onChange={e => setDobDay(e.target.value)}>
            <option value="">Jour</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
              <option key={d} value={String(d).padStart(2, '0')}>{d}</option>
            ))}
          </select>
          <select style={inp} value={dobMonth} onChange={e => setDobMonth(e.target.value)}>
            <option value="">Mois</option>
            {months.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
          </select>
          <select style={inp} value={dobYear} onChange={e => setDobYear(e.target.value)}>
            <option value="">Année</option>
            {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5 }}>
          Requise par Stripe pour la vérification d&apos;identité.
        </div>
      </div>

      {/* Address */}
      <div>
        <span style={label}>Adresse personnelle</span>
        <AddressAutocomplete value={address} onChange={setAddress} style={inp} />
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5 }}>
          Transmise à Stripe de façon sécurisée. Jamais visible par votre employeur.
        </div>
      </div>

      {/* IBAN */}
      <div>
        <span style={label}>IBAN</span>
        <input
          style={inp}
          value={iban}
          onChange={e => setIban(e.target.value.toUpperCase())}
          onBlur={() => iban.trim() && setIban(formatIbanFriendly(iban))}
          placeholder="FR76 3000 1007 9412 3456 7890 185"
        />
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5 }}>
          Votre IBAN ne sera jamais visible par votre employeur.
        </div>
      </div>

      {/* ToS */}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={tosAccepted}
          onChange={e => setTosAccepted(e.target.checked)}
          style={{ marginTop: 2, accentColor: 'var(--accent)', flexShrink: 0 }}
        />
        <span style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
          J&apos;accepte les{' '}
          <a href="https://stripe.com/fr/legal/connect-account" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
            conditions d&apos;utilisation de Stripe
          </a>{' '}
          pour les comptes connectés.
        </span>
      </label>

      <button style={primaryBtn} disabled={pending} onClick={handleSetup}>
        {pending ? 'Configuration…' : 'Configurer mon compte bancaire →'}
      </button>
    </div>
  );
}
