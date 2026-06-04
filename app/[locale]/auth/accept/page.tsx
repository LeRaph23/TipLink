import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { EmailOtpType } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Interstitial for emailed invite / magic links.
//
// The emailed link points here rather than straight to /auth/callback. Email
// security scanners (Gmail, Outlook Safe Links, corporate filters) pre-fetch
// links with a GET before the recipient ever opens the message — and a GET to
// /auth/callback would consume the one-time Supabase token, leaving the human
// stranded on the login page. This page consumes nothing on load: the token is
// only verified when the user submits the form (a POST), which scanners do not
// perform. See app/auth/callback/route.ts.
export default async function AcceptInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const first = (v: string | string[] | undefined): string | null =>
    typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? null) : null;

  const tokenHash = first(sp.token_hash);
  const type = (first(sp.type) ?? 'invite') as EmailOtpType;
  const next = first(sp.next) ?? '/dashboard';

  // No token to confirm — nothing this page can do. Send to login.
  if (!tokenHash) {
    redirect(`/${locale}/login`);
  }

  const t = await getTranslations('acceptInvite');

  const callbackParams = new URLSearchParams({
    token_hash: tokenHash,
    type,
    next,
    locale,
  });
  const action = `/auth/callback?${callbackParams.toString()}`;

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '40px 20px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <span style={{
            fontSize: 20, fontWeight: 800, color: '#E57A97',
            letterSpacing: '-0.03em', fontFamily: 'var(--font-poppins), sans-serif',
          }}>
            DigiTip
          </span>
        </div>

        <div style={{
          textAlign: 'center',
          padding: '32px 28px',
          background: 'var(--surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 16,
        }}>
          <p style={{
            fontSize: 12.5, color: 'var(--text-3)', marginBottom: 6,
            textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
          }}>
            {t('eyebrow')}
          </p>
          <h1 style={{
            fontSize: 22, fontWeight: 800, color: 'var(--text)',
            letterSpacing: '-0.03em', margin: '0 0 12px',
          }}>
            {t('title')}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 24px' }}>
            {t('body')}
          </p>

          <form method="post" action={action}>
            <button
              type="submit"
              style={{
                width: '100%', padding: '15px 20px', borderRadius: 14, border: 'none',
                background: 'linear-gradient(135deg, #E57A97, #EC97B0)',
                color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'var(--font)', boxShadow: '0 6px 24px rgba(229,122,151,0.35)',
              }}
            >
              {t('cta')}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-3)', marginTop: 24 }}>
          {t('footer')}
        </p>
      </div>
    </main>
  );
}
