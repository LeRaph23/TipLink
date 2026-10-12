import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PackCheckout, type CheckoutAccount } from '@/components/checkout/PackCheckout';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { findBuyerGroup } from '@/lib/billing/buyer-group';
import { getAllPackPricing } from '@/lib/stripe/pricing';
import { buildPageMetadata } from '@/lib/seo';
import type { PackId } from '@/lib/env';
import type { Metadata } from 'next';

// Transactional page: never index it. Without its own `alternates` it would
// also inherit the homepage canonical from the locale layout and tell Google
// it is a duplicate of "/".
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'checkout' });
  return buildPageMetadata({
    locale,
    path: '/checkout',
    title: t('metaTitle'),
    description: t('metaDescription'),
    noindex: true,
  });
}

const PACK_VISUAL = {
  solo: { img: '/products/solo-3d.jpg', altKey: 'altSolo' },
  duo:  { img: '/products/duo-double.jpg', altKey: 'altDuo' },
} as const;

function isValidPack(s: string | undefined): s is PackId {
  return s === 'solo' || s === 'duo';
}

function formatPrice(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ pack?: string }>;
}) {
  const { locale } = await params;
  const { pack } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('checkout');

  if (!isValidPack(pack)) {
    notFound();
  }

  // Pricing comes from Stripe (single source of truth). Visual assets stay local.
  // Both packs, for the Solo/Duo toggle; cached, so no extra Stripe round trip.
  const allPricing = await getAllPackPricing();
  const pricing = allPricing[pack];

  // Signed in, the same page, already filled in: the account's email and,
  // for a business owner, the last delivery address. The order then joins
  // their business (see create-pack-intent).
  const { data: { user } } = await (await createClient()).auth.getUser();
  let account: CheckoutAccount | null = null;
  if (user?.email) {
    const buyer = await findBuyerGroup(createServiceClient(), user.id);
    account = { email: user.email, name: buyer?.legalName ?? null, shipping: buyer?.shipping ?? null };
  }
  const visual = PACK_VISUAL[pack];
  const formattedPrice = formatPrice(pricing.unitAmount, pricing.currency, locale);
  // The French price incl. VAT, shown from the start: 69 € HT turning into
  // "Pay 82,80 €" on the last button read like a hidden charge (UX-12). The
  // exact VAT still follows the delivery country below.
  const formattedTtcFr = formatPrice(Math.round(pricing.unitAmount * 1.2), pricing.currency, locale);
  const formattedList = pricing.listAmount != null
    ? formatPrice(pricing.listAmount, pricing.currency, locale)
    : null;

  return (
    <div style={{
      minHeight: '100vh', background: '#fafafa', color: '#0f1020',
      padding: '32px 20px',
    }}>
      <div style={{
        maxWidth: 1080, margin: '0 auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 28, gap: 16, flexWrap: 'wrap',
        }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              fontSize: 14, fontWeight: 600, color: '#3a3b4f',
              textDecoration: 'none',
            }}
          >
            <span aria-hidden style={{ fontSize: 18 }}>←</span> {t('back')}
          </Link>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, fontWeight: 700, color: '#6b6d85',
            letterSpacing: '0.08em',
          }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#6b6d85" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            {t('securePayment')}
          </div>
        </div>

        <h1 style={{
          fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 900,
          letterSpacing: '-0.03em', marginBottom: 20,
        }}>
          {t('title')}
        </h1>

        {/* Layout: 2 cols on desktop */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)',
          gap: 20,
          alignItems: 'start',
        }} className="checkout-grid">
          <style>{`
            @media (max-width: 900px) {
              .checkout-grid { grid-template-columns: minmax(0, 1fr) !important; }
              .checkout-aside { position: static !important; top: auto !important; }
            }
          `}</style>

          {/* Left: order summary + trust signals */}
          <aside className="checkout-aside" style={{
            background: '#fff', borderRadius: 20, padding: 20,
            border: '1px solid #e6e6f0',
            boxShadow: '0 1px 2px rgba(15,16,32,0.04)',
            position: 'sticky', top: 24,
          }}>
            {/* Pack choice: a plain two-way toggle instead of an upsell link,
                so switching reads as picking an option, not as an extra step. */}
            <nav aria-label={t('packChoice')} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4,
              padding: 4, borderRadius: 12, background: '#f2f2f7', marginBottom: 18,
            }}>
              {(['solo', 'duo'] as const).map((p) => {
                const active = p === pack;
                return (
                  <Link
                    key={p}
                    href={`/checkout?pack=${p}`}
                    replace
                    aria-current={active ? 'page' : undefined}
                    style={{
                      padding: '8px 10px', borderRadius: 9, textAlign: 'center',
                      textDecoration: 'none', lineHeight: 1.25,
                      background: active ? '#fff' : 'transparent',
                      boxShadow: active ? '0 1px 3px rgba(15,16,32,0.12)' : 'none',
                    }}
                  >
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: active ? '#0f1020' : '#6b6d85' }}>
                      {p === 'solo' ? 'Solo' : 'Duo'}
                    </span>
                    <span style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: '#6b6d85' }}>
                      {t('plaquesShort', { count: allPricing[p].quantity })}
                    </span>
                  </Link>
                );
              })}
            </nav>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 12, overflow: 'hidden',
                position: 'relative', background: '#ede9fe', flexShrink: 0,
              }}>
                <Image src={visual.img} alt={t(visual.altKey)} fill sizes="64px" style={{ objectFit: 'cover' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f1020', lineHeight: 1.3 }}>
                  {t('plates', { count: pricing.quantity })}
                </div>
                <div style={{ fontSize: 12.5, color: '#6b6d85', marginTop: 2 }}>
                  {t('ttcFrance', { price: formattedTtcFr })}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 900, color: '#0f1020', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                  {formattedPrice}
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#a0a0b8', marginLeft: 4 }}>HT</span>
                </div>
                {formattedList && (
                  <div style={{ fontSize: 12, marginTop: 2, whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#a0a0b8', textDecoration: 'line-through' }}>{formattedList}</span>
                    {pricing.savingsPercent != null && (
                      <span style={{ marginLeft: 6, fontWeight: 800, color: '#16a34a' }}>
                        −{pricing.savingsPercent}%
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Trust: short, one neutral icon, no repeat of what the page
                header and the legal line under the pay button already say. */}
            <ul style={{
              listStyle: 'none', padding: 0, margin: '18px 0 0',
              paddingTop: 16, borderTop: '1px solid #f0f0f5',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {(['trustDelivery', 'trustWarranty', 'trustRefund'] as const).map((key) => (
                <li key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#3a3b4f', lineHeight: 1.4 }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, marginTop: 2 }}>
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                  {t(key)}
                </li>
              ))}
            </ul>
          </aside>

          {/* Right: Stripe Elements */}
          <main style={{
            background: '#fff', borderRadius: 20, padding: 24,
            border: '1px solid #e6e6f0',
            boxShadow: '0 1px 2px rgba(15,16,32,0.04)',
          }}>
            <PackCheckout pack={pack} locale={locale} account={account} />
          </main>
        </div>
      </div>
    </div>
  );
}

