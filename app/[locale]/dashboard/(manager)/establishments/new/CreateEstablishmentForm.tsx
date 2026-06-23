'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { createEstablishment } from '@/actions/establishment';

const COUNTRIES = [
  ['FR', 'France'], ['DE', 'Germany'], ['GB', 'United Kingdom'],
  ['BE', 'Belgium'], ['NL', 'Netherlands'], ['ES', 'Spain'],
  ['IT', 'Italy'], ['PT', 'Portugal'], ['CH', 'Switzerland'],
  ['AT', 'Austria'], ['LU', 'Luxembourg'], ['IE', 'Ireland'],
];

const CURRENCIES = [
  ['eur', 'EUR — Euro'],
  ['gbp', 'GBP — British Pound'],
  ['chf', 'CHF — Swiss Franc'],
  ['usd', 'USD — US Dollar'],
  ['cad', 'CAD — Canadian Dollar'],
];

const fieldStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: 13.5, fontFamily: 'var(--font)',
  boxSizing: 'border-box' as const, outline: 'none',
};

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: 'var(--text-2)', marginBottom: 5, letterSpacing: '0.02em',
};

export function CreateEstablishmentForm() {
  const t = useTranslations('dashboard.establishments');
  const router = useRouter();
  const [name, setName] = useState('');
  const [businessType, setBusinessType] = useState<'restaurant' | 'beauty'>('beauty');
  const [country, setCountry] = useState('FR');
  const [currency, setCurrency] = useState('eur');
  const [status, setStatus] = useState<'idle' | 'creating' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setStatus('creating');
    setErrorMsg('');
    const result = await createEstablishment({ name: name.trim(), business_type: businessType, country, currency });
    if ('error' in result) {
      setStatus('error');
      setErrorMsg(result.error);
    } else {
      router.push('/dashboard/establishments');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm, 8px)', padding: '12px 14px',
      }}>
        <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1, color: 'var(--text-3)' }}>
          <circle cx="8" cy="8" r="6.5" /><path d="M8 7.5v3.5" /><path d="M8 5h.01" />
        </svg>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55, margin: 0 }}>
          {t('createHint')}
        </p>
      </div>

      <div>
        <label style={labelStyle}>{t('name')}</label>
        <input
          type="text" required value={name} onChange={e => setName(e.target.value)}
          placeholder="Ex. Le Comptoir, Salon Lumière…"
          style={fieldStyle}
        />
      </div>

      <div>
        <label style={labelStyle}>{t('type')}</label>
        <select value={businessType} onChange={e => setBusinessType(e.target.value as 'restaurant' | 'beauty')} style={fieldStyle}>
          <option value="beauty">{t('typeBeauty')}</option>
          <option value="restaurant">{t('typeRestaurant')}</option>
        </select>
      </div>

      <div>
        <label style={labelStyle}>{t('country')}</label>
        <select value={country} onChange={e => setCountry(e.target.value)} style={fieldStyle}>
          {COUNTRIES.map(([code, label]) => (
            <option key={code} value={code}>{label} ({code})</option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>{t('currency')}</label>
        <select value={currency} onChange={e => setCurrency(e.target.value)} style={fieldStyle}>
          {CURRENCIES.map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
      </div>

      {status === 'error' && (
        <p style={{ fontSize: 12.5, color: 'var(--error)', margin: 0 }}>{errorMsg}</p>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button
          type="button"
          onClick={() => router.push('/dashboard/establishments')}
          style={{
            padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-2)',
            fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)',
          }}
        >
          {t('back')}
        </button>
        <button
          type="submit"
          disabled={status === 'creating' || !name.trim()}
          style={{
            flex: 1, padding: '9px 16px', borderRadius: 8, border: 'none',
            background: 'var(--accent)', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: status === 'creating' ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font)', opacity: status === 'creating' ? 0.7 : 1,
          }}
        >
          {status === 'creating' ? t('creating') : t('create')}
        </button>
      </div>
    </form>
  );
}
