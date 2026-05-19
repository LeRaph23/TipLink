import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getPayIn } from '@/lib/mangopay/payins';

type PackInfo = {
  amount: string;
};

async function resolvePack(payInId: string | undefined, locale: string): Promise<PackInfo | null> {
  if (!payInId) return null;
  try {
    const payIn = await getPayIn(payInId);
    if (payIn.Status === 'FAILED') return null;
    const amount = payIn.DebitedFunds?.Amount ?? 0;
    if (amount <= 0) return null;
    const fmt = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
      style: 'currency',
      currency: payIn.DebitedFunds?.Currency ?? 'EUR',
      minimumFractionDigits: 2,
    });
    return { amount: fmt.format(amount / 100) };
  } catch {
    return null;
  }
}

export default async function OrderSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ payin?: string }>;
}) {
  const { locale } = await params;
  const { payin } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('orderSuccess');

  const steps = [t('steps.s1'), t('steps.s2'), t('steps.s3')];
  const packInfo = await resolvePack(payin, locale);

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
        <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 24 }}>
          {t('body')}
        </p>

        {/* Amount paid (only when the PayIn resolved) */}
        {packInfo && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '14px 18px', marginBottom: 24, textAlign: 'left',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              {t('title')}
            </div>
            <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text)' }}>
              {packInfo.amount}
            </div>
          </div>
        )}

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
        <div style={{
          padding: '16px 20px', borderRadius: 12,
          background: 'var(--surface)', border: '1px solid var(--border)',
          fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 20,
        }}>
          {t('nextStep')}
        </div>
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
  );
}
