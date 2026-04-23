'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { OrderState, Address } from '@/lib/order-validation';
import { inputStyle, labelStyle, EU_COUNTRIES } from './formStyles';

type Business = OrderState['business'];

export function StepBilling({
  value,
  onChange,
}: {
  value: Business;
  onChange: (next: Business) => void;
}) {
  const t = useTranslations('order.billing');
  const tb = useTranslations('auth.business');
  const [focus, setFocus] = useState<string | null>(null);
  const f = (k: string) => focus === k;

  const billing: Address = value.billing ?? { line1: '', line2: '', city: '', postal_code: '', country: 'FR' };
  const setBilling = (patch: Partial<Address>) =>
    onChange({ ...value, billing: { ...billing, ...patch } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}>{tb('legalName')}</label>
        <input
          type="text" value={value.legal_name}
          onChange={(e) => onChange({ ...value, legal_name: e.target.value })}
          placeholder={tb('legalNamePlaceholder')} required autoFocus
          style={inputStyle(f('legal'))}
          onFocus={() => setFocus('legal')} onBlur={() => setFocus(null)}
        />
      </div>

      <div>
        <label style={labelStyle}>{tb('vatNumber')}</label>
        <input
          type="text" value={value.vat_number}
          onChange={(e) => onChange({ ...value, vat_number: e.target.value.toUpperCase() })}
          placeholder="FR12345678901"
          style={inputStyle(f('vat'))}
          onFocus={() => setFocus('vat')} onBlur={() => setFocus(null)}
        />
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
          {t('vatAutoReverse')}
        </p>
      </div>

      <label style={{
        display: 'flex', alignItems: 'center', gap: 10, marginTop: 4,
        fontSize: 13, color: 'var(--text-2)', cursor: 'pointer',
        padding: '10px 12px', background: 'var(--surface)',
        borderRadius: 10, border: '1px solid var(--border-subtle)',
      }}>
        <input
          type="checkbox"
          checked={value.billing_same}
          onChange={(e) => onChange({ ...value, billing_same: e.target.checked })}
          style={{ cursor: 'pointer' }}
        />
        {tb('billingSameAsShipping')}
      </label>

      {!value.billing_same && (
        <div style={{
          borderTop: '1px solid var(--border-subtle)', paddingTop: 14, marginTop: 4,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>
            {tb('billingAddress')}
          </div>
          <input
            type="text" value={billing.line1} onChange={(e) => setBilling({ line1: e.target.value })}
            placeholder={tb('addrLine1')} required
            style={inputStyle(f('bline1'))}
            onFocus={() => setFocus('bline1')} onBlur={() => setFocus(null)}
          />
          <input
            type="text" value={billing.line2 ?? ''} onChange={(e) => setBilling({ line2: e.target.value })}
            placeholder={tb('addrLine2')}
            style={inputStyle(f('bline2'))}
            onFocus={() => setFocus('bline2')} onBlur={() => setFocus(null)}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12 }}>
            <input
              type="text" value={billing.city} onChange={(e) => setBilling({ city: e.target.value })}
              placeholder={tb('city')} required
              style={inputStyle(f('bcity'))}
              onFocus={() => setFocus('bcity')} onBlur={() => setFocus(null)}
            />
            <input
              type="text" value={billing.postal_code} onChange={(e) => setBilling({ postal_code: e.target.value })}
              placeholder={tb('postalCode')} required
              style={inputStyle(f('bzip'))}
              onFocus={() => setFocus('bzip')} onBlur={() => setFocus(null)}
            />
          </div>
          <select
            value={billing.country} onChange={(e) => setBilling({ country: e.target.value })}
            style={{ ...inputStyle(f('bcountry')), cursor: 'pointer' }}
            onFocus={() => setFocus('bcountry')} onBlur={() => setFocus(null)}
          >
            {EU_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
