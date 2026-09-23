'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Sign-out link for the onboarding header. The dashboard's own menu is out of
 * reach until onboarding is finished, and /login sends a signed-in manager
 * straight back here, so without this a wrong account could only be left by
 * clearing cookies. Hidden when there is no session (the anonymous scan flow).
 * Its label lives under `onboarding`: `dashboard` messages are not sent here.
 */
export function OnboardingSignOut() {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
  }, []);

  if (!signedIn) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await createClient().auth.signOut();
        router.push('/login');
        router.refresh();
      }}
      style={{
        marginLeft: 'auto',
        background: 'none',
        border: 'none',
        color: 'var(--text-3)',
        fontSize: 13,
        cursor: 'pointer',
        fontFamily: 'var(--font)',
      }}
    >
      {t('signOut')}
    </button>
  );
}
