'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Address } from '@/lib/order-validation';
import { inputStyle, labelStyle, EU_COUNTRIES } from './formStyles';

export function StepShipping({
  value,
  onChange,
}: {
  value: Address;
  onChange: (next: Address) => void;
}) {
  const t = useTranslations('order.shipping');
  const tb = useTranslations('auth.business');
  const [focus, setFocus] = useState<string | null>(null);
  const f = (k: string) => focus === k;
  const set = (patch: Partial<Address>) => onChange({ ...value, ...patch });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}>{tb('addrLine1')}</label>
        <input
          type="text" value={value.line1} onChange={(e) => set({ line1: e.target.value })}
          required autoFocus
          style={inputStyle(f('line1'))}
          onFocus={() => setFocus('line1')} onBlur={() => setFocus(null)}
        />
      </div>

      <div>
        <label style={labelStyle}>{tb('addrLine2')}</label>
        <input
          type="text" value={value.line2 ?? ''} onChange={(e) => set({ line2: e.target.value })}
          style={inputStyle(f('line2'))}
          onFocus={() => setFocus('line2')} onBlur={() => setFocus(null)}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12 }}>
        <div>
          <label style={labelStyle}>{tb('city')}</label>
          <input
            type="text" value={value.city} onChange={(e) => set({ city: e.target.value })}
            required
            style={inputStyle(f('city'))}
            onFocus={() => setFocus('city')} onBlur={() => setFocus(null)}
          />
        </div>
        <div>
          <label style={labelStyle}>{tb('postalCode')}</label>
          <input
            type="text" value={value.postal_code} onChange={(e) => set({ postal_code: e.target.value })}
            required
            style={inputStyle(f('zip'))}
            onFocus={() => setFocus('zip')} onBlur={() => setFocus(null)}
          />
        </div>
      </div>

      <div>
        <label style={labelStyle}>{tb('country')}</label>
        <select
          value={value.country} onChange={(e) => set({ country: e.target.value })}
          style={{ ...inputStyle(f('country')), cursor: 'pointer' }}
          onFocus={() => setFocus('country')} onBlur={() => setFocus(null)}
        >
          {EU_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
          {t('subtitle').split('.')[0]}.
        </p>
      </div>
    </div>
  );
}
