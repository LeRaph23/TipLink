import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function OrderSuccessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('orderSuccess');

  const steps = [t('steps.s1'), t('steps.s2'), t('steps.s3')];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>

      {/* Success icon */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: '#f0fdf4', border: '2px solid #bbf7d0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 28,
      }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M9 16.5l5 5 9-10" stroke="#0ea36b" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <h1 style={{ fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: 14 }}>
          {t('title')}
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 32 }}>
          {t('body')}
        </p>

        {/* Steps */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '20px 24px', marginBottom: 32, textAlign: 'left',
        }}>
          {steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: i < steps.length - 1 ? 16 : 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: i === 0 ? '#f0fdf4' : 'var(--bg)',
                border: `2px solid ${i === 0 ? '#0ea36b' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800, color: i === 0 ? '#0ea36b' : 'var(--text-3)',
              }}>
                {i === 0 ? (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l3.5 3.5L13 5" stroke="#0ea36b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (i + 1)}
              </div>
              <span style={{ fontSize: 14, color: i === 0 ? 'var(--text)' : 'var(--text-3)', fontWeight: i === 0 ? 600 : 400 }}>
                {step}
              </span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 20 }}>
          {t('nextStep')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link href="/auth/signup" style={{
            display: 'block', padding: '14px', borderRadius: 12,
            background: '#E57A97', color: '#fff',
            fontSize: 15, fontWeight: 700, textDecoration: 'none', textAlign: 'center',
            boxShadow: '0 4px 20px rgba(229,122,151,0.30)',
          }}>
            {t('ctaSignup')}
          </Link>
          <Link href="/" style={{
            display: 'block', padding: '12px',
            borderRadius: 12, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-2)',
            fontSize: 14, fontWeight: 500, textDecoration: 'none', textAlign: 'center',
          }}>
            {t('ctaHome')}
          </Link>
        </div>
      </div>
    </div>
  );
}
