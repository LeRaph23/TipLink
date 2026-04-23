import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PACKS } from '@/lib/env';

type PackKey = 's' | 'm' | 'l';

function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="7" fill="var(--accent)" />
      <path d="M7 12c0-2.8 2.2-5 5-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M17 12c0 2.8-2.2 5-5 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.8" fill="white" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
      <circle cx="8" cy="8" r="7" fill="rgba(99,102,241,0.15)" />
      <path d="M5 8.5l2 2 4-4.5" stroke="#a5b4fc" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('pricing');
  const tc = await getTranslations('common');

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-IE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
    }).format(cents / 100);

  const packs: Array<{
    id: PackKey;
    popular?: boolean;
  }> = [
    { id: 's' },
    { id: 'm', popular: true },
    { id: 'l' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', overflowX: 'hidden' }}>
      <div style={{ position: 'fixed', top: '-10%', right: '-5%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '10%', left: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      {/* Nav */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 48px', position: 'relative', zIndex: 10,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <LogoMark size={26} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: '#f0f0f8' }}>TipLink</span>
        </Link>
        <nav style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <LanguageSwitcher />
          <Link href="/login" style={{
            padding: '7px 16px', borderRadius: 8, textDecoration: 'none',
            color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 500,
          }}>{tc('login')}</Link>
          <Link href="/contact" style={{
            padding: '7px 14px', textDecoration: 'none',
            color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 500,
          }}>{tc('contact')}</Link>
        </nav>
      </header>

      {/* Hero */}
      <section style={{ padding: '40px 48px 20px', maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(99,102,241,0.85)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 14 }}>{t('kicker')}</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(30px, 4vw, 48px)', fontWeight: 800, color: '#f0f0f8', letterSpacing: '-0.02em', lineHeight: 1.05, marginBottom: 18 }}>
          {t('title')}
        </h1>
        <p style={{ maxWidth: 620, margin: '0 auto', fontSize: 16, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
          {t('subtitle')}
        </p>
      </section>

      {/* Packs grid */}
      <section style={{ padding: '40px 48px 60px', maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 18,
        }}>
          {packs.map(({ id, popular }) => {
            const def = PACKS[id];
            const benefits: string[] = [
              t('benefits.preConfigured'),
              t('benefits.freeShipping'),
              t('benefits.dashboard'),
              t('benefits.app'),
              t('benefits.vatInvoice'),
              t('benefits.noSubscription'),
              ...(id === 'l' ? [t('benefits.prioritySupport')] : []),
              ...(id !== 's' ? [t('benefits.lifetimeReplacement')] : []),
            ];

            return (
              <div key={id} style={{
                position: 'relative',
                padding: '32px 28px',
                borderRadius: 18,
                background: popular
                  ? 'linear-gradient(180deg, rgba(99,102,241,0.1) 0%, var(--surface) 80%)'
                  : 'var(--surface)',
                border: `1px solid ${popular ? 'rgba(99,102,241,0.4)' : 'var(--border-subtle)'}`,
                boxShadow: popular ? '0 20px 60px rgba(99,102,241,0.15)' : 'none',
                display: 'flex',
                flexDirection: 'column',
              }}>
                {popular && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    padding: '4px 12px', borderRadius: 100,
                    background: 'var(--accent)', color: '#fff',
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                    boxShadow: '0 4px 20px rgba(99,102,241,0.45)',
                  }}>
                    {t('mostPopular')}
                  </div>
                )}

                <div style={{
                  display: 'inline-flex', alignSelf: 'flex-start',
                  padding: '3px 10px', borderRadius: 6,
                  background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
                  fontSize: 11, fontWeight: 700, color: '#a5b4fc', letterSpacing: '0.06em', marginBottom: 18,
                }}>
                  {id.toUpperCase()} · {t('packs.' + id + '.name')}
                </div>

                <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 18 }}>
                  {t('packs.' + id + '.tagline')}
                </p>

                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 800, color: '#f0f0f8', letterSpacing: '-0.02em', lineHeight: 1 }}>
                    {formatPrice(def.hardwareAmount)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                    {t('oneTime')}
                  </div>
                </div>

                <div style={{ marginTop: 8, marginBottom: 20 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 8 }}>
                    {t('tagsIncluded', { count: def.quantity })}
                  </div>
                  <div style={{
                    padding: '10px 12px', borderRadius: 10,
                    background: 'rgba(99,102,241,0.08)',
                    border: '1px solid rgba(99,102,241,0.2)',
                    fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.4,
                  }}>
                    <strong style={{ color: '#a5b4fc' }}>{t('commissionLabel')}</strong> · {t('commissionBody')}
                  </div>
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  {benefits.map((b, i) => (
                    <li key={i} style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                      <Check />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={`/order/${id}`}
                  style={{
                    display: 'block', textAlign: 'center',
                    padding: '12px 16px', borderRadius: 12, textDecoration: 'none',
                    background: popular
                      ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                      : 'var(--surface-2)',
                    color: popular ? '#fff' : 'var(--text)',
                    fontSize: 14, fontWeight: 700,
                    border: popular ? 'none' : '1px solid var(--border)',
                    boxShadow: popular ? '0 4px 20px rgba(99,102,241,0.4)' : 'none',
                  }}
                >
                  {t('choose')} {tc('arrowRight')}
                </Link>
              </div>
            );
          })}
        </div>

        {/* Enterprise card */}
        <div style={{
          marginTop: 18, padding: '26px 32px', borderRadius: 18,
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 24, flexWrap: 'wrap',
        }}>
          <div style={{ maxWidth: 560 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(99,102,241,0.85)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
              Enterprise
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: '#f0f0f8', letterSpacing: '-0.03em', marginBottom: 6 }}>
              {t('enterpriseTitle')}
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
              {t('enterpriseBody')}
            </p>
          </div>
          <Link href="/contact" style={{
            padding: '12px 24px', borderRadius: 12, textDecoration: 'none',
            background: 'var(--surface-2)', color: 'var(--text)',
            fontSize: 14, fontWeight: 600, border: '1px solid var(--border)',
          }}>
            {t('enterpriseCta')} {tc('arrowRight')}
          </Link>
        </div>

        {/* Trust bar */}
        <div style={{
          marginTop: 40, padding: 20,
          display: 'flex', gap: 40, justifyContent: 'center', flexWrap: 'wrap',
          fontSize: 12.5, color: 'var(--text-3)',
        }}>
          <span>🔒 {t('trust1')}</span>
          <span>🧾 {t('trust2')}</span>
          <span>✓ {t('trust3')}</span>
        </div>
      </section>
    </div>
  );
}
