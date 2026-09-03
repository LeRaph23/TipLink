'use client';

import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { EmailOtpForm } from '@/components/auth/EmailOtpForm';

const banner: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 8,
  background: 'rgba(22, 163, 74, 0.08)',
  border: '1px solid rgba(22, 163, 74, 0.35)',
  color: '#16a34a',
  fontSize: 13.5,
  fontWeight: 500,
};

export function LoginForm({ verified }: { verified?: boolean }) {
  const router = useRouter();
  const t = useTranslations('auth');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Kept one release past the switch: confirmation links sent under the
          password flow still land here with ?verified=true. */}
      {verified && <div style={banner}>✓ {t('emailVerifiedBanner')}</div>}

      <EmailOtpForm
        // Signing in must never create the account. An unknown address that
        // silently became a user would arrive on a dashboard with no group,
        // no role and nothing to explain why it is empty; "no account for this
        // address" is the true and useful answer.
        shouldCreateUser={false}
        onVerified={() => {
          router.push('/dashboard');
          router.refresh();
        }}
      />
    </div>
  );
}
