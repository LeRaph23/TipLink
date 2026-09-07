'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { OrderState } from '@/lib/order-validation';
import { EmailOtpForm } from '@/components/auth/EmailOtpForm';
import { inputStyle, labelStyle } from './formStyles';

type Account = OrderState['account'];

export function StepAccount({
  value,
  onChange,
  verified,
  onVerified,
}: {
  value: Account;
  onChange: (next: Account) => void;
  /** The code already came back good, so the fields are settled. */
  verified: boolean;
  onVerified: () => void;
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

      {verified ? (
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>
          ✓ {t('verified')}
        </p>
      ) : (
        <>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.6 }}>
            {t('codeHint')}
          </p>
          {/* Paying needs a session, so the address has to be proven here
              rather than at checkout. Buying is also the moment an account is
              meant to come into existence, hence shouldCreateUser. */}
          <EmailOtpForm
            key={value.email}
            initialEmail={value.email}
            lockEmail
            shouldCreateUser
            fullName={value.full_name}
            onVerified={onVerified}
            autoFocus={false}
          />
        </>
      )}

      <p style={{ fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center', marginTop: 4 }}>
        {t('already')}{' '}
        <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
          {t('signIn')}
        </Link>
      </p>
    </div>
  );
}
