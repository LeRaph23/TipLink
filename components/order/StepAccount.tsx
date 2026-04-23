'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { OrderState } from '@/lib/order-validation';
import { inputStyle, labelStyle } from './formStyles';

type Account = OrderState['account'];

export function StepAccount({
  value,
  onChange,
}: {
  value: Account;
  onChange: (next: Account) => void;
}) {
  const t = useTranslations('order.account');
  const ta = useTranslations('auth');
  const [focus, setFocus] = useState<string | null>(null);
  const f = (k: string) => focus === k;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}>{ta('fullName')}</label>
        <input
          type="text" value={value.full_name}
          onChange={(e) => onChange({ ...value, full_name: e.target.value })}
          required autoFocus autoComplete="name"
          style={inputStyle(f('name'))}
          onFocus={() => setFocus('name')} onBlur={() => setFocus(null)}
        />
      </div>

      <div>
        <label style={labelStyle}>{ta('emailAddress')}</label>
        <input
          type="email" value={value.email}
          onChange={(e) => onChange({ ...value, email: e.target.value.trim() })}
          required autoComplete="email"
          placeholder="you@example.com"
          style={inputStyle(f('email'))}
          onFocus={() => setFocus('email')} onBlur={() => setFocus(null)}
        />
      </div>

      <div>
        <label style={labelStyle}>{ta('password')}</label>
        <input
          type="password" value={value.password}
          onChange={(e) => onChange({ ...value, password: e.target.value })}
          required minLength={8} autoComplete="new-password"
          style={inputStyle(f('pwd'))}
          onFocus={() => setFocus('pwd')} onBlur={() => setFocus(null)}
        />
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
          {t('passwordHint')}
        </p>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center', marginTop: 4 }}>
        {t('already')}{' '}
        <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
          {t('signIn')}
        </Link>
      </p>
    </div>
  );
}
