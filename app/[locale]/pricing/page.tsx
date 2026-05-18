import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PACKS, type PackId } from '@/lib/env';
import { htSuffix } from '@/lib/format-price';
import { createClient } from '@/lib/supabase/server';
import { pageAlternates } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricing' });
  return {
    title: t('title'),
    description: t('subtitle'),
    alternates: pageAlternates(locale, '/pricing'),
  };
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="8" cy="8" r="7.5" fill="#f0fdf4" stroke="#bbf7d0" />
      <path d="M5 8.5l2 2 4-4.5" stroke="#16a34a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const isFr = locale === 'fr';
  const formatPrice = (cents: number) =>
    new Intl.NumberFormat(isFr ? 'fr-FR' : 'en-IE', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: 0,
    }).format(cents / 100);

  const packs: Array<{ id: PackId; popular?: boolean }> = [
    { id: 'solo' },
    { id: 'duo', popular: true },
  ];

  const benefits = [
    t('benefits.preConfigured'),
    t('benefits.dashboard'),
    t('benefits.freeShipping'),
    t('benefits.lifetimeReplacement'),
    t('benefits.vatInvoice'),
    t('benefits.noSubscription'),
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f9f9f7', color: '#111118', fontFamily: 'var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)' }}>

      {/* Nav */}
      <header style={{
        background: '#fff', borderBottom: '1px solid #e4e4ec',
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 clamp(16px,4vw,48px)', height: 62,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <span style={{ fontFamily: 'var(--font-poppins), sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', color: '#111118' }}>DigiTip</span>
        </Link>
        <nav style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <LanguageSwitcher />
          {user ? (
            <Link href="/dashboard" style={{ padding: '7px 16px', borderRadius: 8, textDecoration: 'none', background: '#E57A97', color: '#fff', fontSize: 13, fontWeight: 600 }}>
              ← {isFr ? 'Mon dashboard' : 'My dashboard'}
            </Link>
          ) : (
            <Link href="/login" style={{ padding: '7px 16px', borderRadius: 8, textDecoration: 'none', border: '1px solid #e4e4ec', color: '#3a3b4f', fontSize: 13, fontWeight: 500 }}>
              {tc('login')}
            </Link>
          )}
          <Link href="/contact" style={{ padding: '7px 14px', textDecoration: 'none', color: '#74748a', fontSize: 13, fontWeight: 500 }}>{tc('contact')}</Link>
        </nav>
      </header>

      {/* Hero */}
      <section style={{ background: '#fff', padding: 'clamp(48px,6vw,80px) clamp(16px,4vw,48px) clamp(32px,4vw,56px)', borderBottom: '1px solid #e4e4ec', textAlign: 'center' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#E57A97', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 14 }}>{t('kicker')}</div>
        <h1 style={{ fontSize: 'clamp(28px,4vw,52px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.04em', lineHeight: 1.02, marginBottom: 18 }}>
          {t('title')}
        </h1>
        <p style={{ maxWidth: 560, margin: '0 auto', fontSize: 16, color: '#74748a', lineHeight: 1.75 }}>
          {t('subtitle')}
        </p>
      </section>

      {/* Pack grid */}
      <section style={{ padding: 'clamp(40px,5vw,64px) clamp(16px,4vw,48px)', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {packs.map(({ id, popular }) => {
            const def = PACKS[id];
            const name = t(`packs.${id}.name` as Parameters<typeof t>[0]);
            const tagline = t(`packs.${id}.tagline` as Parameters<typeof t>[0]);

            return (
              <div key={id} style={{
                position: 'relative',
                background: '#fff',
                border: popular ? '2px solid #E57A97' : '1.5px solid #e4e4ec',
                borderRadius: 20,
                overflow: 'hidden',
                boxShadow: popular ? '0 12px 40px rgba(229,122,151,0.14)' : '0 2px 8px rgba(0,0,0,0.04)',
                display: 'flex', flexDirection: 'column',
              }}>
                {popular && (
                  <div style={{
                    position: 'absolute', top: 16, right: 16,
                    background: '#E57A97', color: '#fff',
                    fontSize: 10.5, fontWeight: 800, padding: '4px 12px', borderRadius: 20,
                    letterSpacing: '0.04em', boxShadow: '0 2px 12px rgba(229,122,151,0.35)',
                    zIndex: 2,
                  }}>
                    {t('mostPopular')}
                  </div>
                )}

                {/* Product visual */}
                <div style={{
                  background: popular ? '#FEF1F4' : '#f9f9f7',
                  position: 'relative',
                  aspectRatio: '4/3',
                  overflow: 'hidden',
                }}>
                  <Image
                    src={id === 'duo' ? '/products/duo-double.jpg' : '/products/solo-3d.jpg'}
                    alt={id === 'duo' ? 'Pack Duo — 2 plaques époxy NFC Digitip' : 'Plaque époxy NFC Digitip Solo'}
                    fill
                    sizes="(max-width: 900px) 100vw, 450px"
                    style={{ objectFit: 'cover' }}
                  />
                  <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 2, fontSize: 12.5, fontWeight: 700, color: '#fff', letterSpacing: '0.06em', textTransform: 'uppercase', textShadow: '0 1px 4px rgba(0,0,0,0.4)', whiteSpace: 'nowrap' }}>
                    {name}
                  </div>
                </div>

                {/* Info */}
                <div style={{ padding: '24px 28px 28px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <p style={{ fontSize: 13.5, color: '#74748a', lineHeight: 1.65, marginBottom: 20 }}>{tagline}</p>

                  {/* Pricing */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ fontSize: 42, fontWeight: 900, color: '#111118', letterSpacing: '-0.04em', lineHeight: 1 }}>
                        {formatPrice(def.hardwareAmount)}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#a0a0b8' }}>{htSuffix(locale)}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: '#74748a', marginTop: 4 }}>
                      {t('oneTime')} · {t('tagsIncluded', { count: def.quantity })}
                    </div>
                  </div>

                  {/* Benefits */}
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
                    {benefits.map((b, i) => (
                      <li key={i} style={{ display: 'flex', gap: 10, fontSize: 13.5, color: '#3a3b4f', lineHeight: 1.5 }}>
                        <Check />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={`/order/${id}`}
                    style={{
                      display: 'block', textAlign: 'center',
                      padding: '14px 20px', borderRadius: 12, textDecoration: 'none',
                      background: popular ? '#E57A97' : '#111118',
                      color: '#fff',
                      fontSize: 15, fontWeight: 800,
                      boxShadow: popular ? '0 4px 20px rgba(229,122,151,0.38)' : '0 2px 8px rgba(0,0,0,0.12)',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {t('choose')} →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Enterprise card */}
        <div style={{
          marginTop: 20, padding: 'clamp(22px,3vw,32px) clamp(20px,3vw,32px)',
          background: '#fff', border: '1.5px solid #e4e4ec', borderRadius: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 24, flexWrap: 'wrap',
        }}>
          <div style={{ maxWidth: 520 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#E57A97', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
              Enterprise
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#111118', letterSpacing: '-0.03em', marginBottom: 6 }}>
              {t('enterpriseTitle')}
            </div>
            <p style={{ fontSize: 14, color: '#74748a', lineHeight: 1.65 }}>
              {t('enterpriseBody')}
            </p>
          </div>
          <Link href="/contact" style={{
            padding: '13px 28px', borderRadius: 12, textDecoration: 'none',
            background: '#111118', color: '#fff',
            fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            {t('enterpriseCta')} →
          </Link>
        </div>

        {/* Trust bar */}
        <div style={{
          marginTop: 32, padding: '18px 0',
          display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap',
          fontSize: 13, color: '#74748a', fontWeight: 500,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>🔒 {t('trust1')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>🧾 {t('trust2')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>✓ {t('trust3')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>🚚 {isFr ? 'Livraison gratuite Europe' : 'Free EU shipping'}</span>
        </div>
      </section>
    </div>
  );
}
