import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function BillingSuccessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.billing');
  const tc = await getTranslations('common');

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', textAlign: 'center', padding: '40px 24px',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'var(--success-bg)',
        margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M8 14.5l4 4 8-9" stroke="var(--success)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: 14 }}>
        {t('successTitle')}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.7, marginBottom: 28 }}>
        {t('successBody')}
      </p>
      <Link href="/dashboard" style={{
        display: 'inline-block', padding: '11px 22px', borderRadius: 'var(--radius)',
        background: 'var(--accent)', color: 'var(--accent-fg)',
        fontSize: 14, fontWeight: 600, textDecoration: 'none',
      }}>
        {t('goToDashboard')} {tc('arrowRight')}
      </Link>
    </div>
  );
}
