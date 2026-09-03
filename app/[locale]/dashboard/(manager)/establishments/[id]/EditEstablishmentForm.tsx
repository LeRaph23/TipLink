'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { updateEstablishment, deleteEstablishment } from '@/actions/establishment';
import { GoogleReviewPicker } from '@/components/onboarding/GoogleReviewPicker';

const COUNTRIES = [
  ['FR', 'France'], ['DE', 'Germany'], ['GB', 'United Kingdom'],
  ['BE', 'Belgium'], ['NL', 'Netherlands'], ['ES', 'Spain'],
  ['IT', 'Italy'], ['PT', 'Portugal'], ['CH', 'Switzerland'],
  ['AT', 'Austria'], ['LU', 'Luxembourg'], ['IE', 'Ireland'],
];

const CURRENCIES = [
  ['eur', 'EUR (Euro)'],
  ['gbp', 'GBP (British Pound)'],
  ['chf', 'CHF (Swiss Franc)'],
  ['usd', 'USD (US Dollar)'],
  ['cad', 'CAD (Canadian Dollar)'],
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

interface Establishment {
  id: string;
  name: string;
  business_type: string;
  country: string;
  currency: string;
  address?: string | null;
  google_place_id?: string | null;
  google_review_url?: string | null;
}

export function EditEstablishmentForm({ establishment }: { establishment: Establishment }) {
  const t = useTranslations('dashboard.establishments');
  const tReview = useTranslations('onboarding.googleReview');
  const router = useRouter();
  const [name, setName] = useState(establishment.name);
  const [businessType, setBusinessType] = useState(establishment.business_type as 'restaurant' | 'beauty');
  const [country, setCountry] = useState(establishment.country);
  const [currency, setCurrency] = useState(establishment.currency);
  const [googlePlaceId, setGooglePlaceId] = useState(establishment.google_place_id ?? '');
  const [googleReviewUrl, setGoogleReviewUrl] = useState(establishment.google_review_url ?? '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('saving');
    setErrorMsg('');
    const result = await updateEstablishment(establishment.id, {
      name: name.trim(), business_type: businessType, country, currency,
      google_place_id: googlePlaceId,
      google_review_url: googleReviewUrl,
    });
    if ('error' in result) {
      setSaveStatus('error');
      setErrorMsg(result.error);
    } else {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('deleteConfirm'))) return;
    setSaveStatus('saving');
    setErrorMsg('');
    const result = await deleteEstablishment(establishment.id);
    if ('success' in result) {
      router.push('/dashboard/establishments');
    } else {
      // Surface the failure instead of leaving the user on a dead button.
      setSaveStatus('error');
      setErrorMsg(result.error);
    }
  };

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <label style={labelStyle}>{t('name')}</label>
        <input type="text" required value={name} onChange={e => setName(e.target.value)} style={fieldStyle} />
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

      <div>
        <label style={labelStyle}>{tReview('fieldLabel')}</label>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 8px', lineHeight: 1.5 }}>
          {tReview('fieldHint')}
        </p>
        <GoogleReviewPicker
          variant="compact"
          name={name}
          address={establishment.address ?? null}
          value={googleReviewUrl}
          placeId={googlePlaceId}
          onChange={({ placeId, reviewUrl }) => {
            setGooglePlaceId(placeId ?? '');
            setGoogleReviewUrl(reviewUrl);
          }}
        />
      </div>

      {saveStatus === 'error' && (
        <p style={{ fontSize: 12.5, color: 'var(--error)', margin: 0 }}>{errorMsg}</p>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="submit"
          disabled={saveStatus === 'saving'}
          style={{
            flex: 1, padding: '9px 16px', borderRadius: 8, border: 'none',
            background: saveStatus === 'saved' ? 'var(--success)' : 'var(--accent)',
            color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font)', opacity: saveStatus === 'saving' ? 0.7 : 1,
            transition: 'background 200ms',
          }}
        >
          {saveStatus === 'saving' ? t('saving') : saveStatus === 'saved' ? t('saved') : t('save')}
        </button>
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
      </div>

      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 18, marginTop: 4 }}>
        <button
          type="button"
          onClick={handleDelete}
          style={{
            padding: '8px 14px', borderRadius: 8,
            border: '1px solid color-mix(in oklch, var(--error) 40%, transparent)',
            background: 'transparent', color: 'var(--error)',
            fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)',
          }}
        >
          {t('delete')}
        </button>
      </div>
    </form>
  );
}
