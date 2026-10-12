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
  const otherPack: PackId = pack === 'solo' ? 'duo' : 'solo';

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
            position: 'sticky', top: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 10, overflow: 'hidden',
                position: 'relative', background: '#ede9fe', flexShrink: 0,
              }}>
                <Image src={visual.img} alt={t(visual.altKey)} fill sizes="56px" style={{ objectFit: 'cover' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f1020' }}>
                  {pack === 'solo' ? 'Digitip Solo' : 'Digitip Duo'}
                </div>
                <div style={{ fontSize: 13, color: '#6b6d85', marginTop: 2 }}>
                  {t('plates', { count: pricing.quantity })}
                </div>
              </div>
            </div>

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
              marginTop: 16, paddingTop: 14, borderTop: '1px solid #f0f0f5',
            }}>
              <span style={{ fontSize: 13, color: '#6b6d85' }}>
                {t('ttcFrance', { price: formattedTtcFr })}
              </span>
              <span style={{ fontSize: 17, fontWeight: 800, color: '#0f1020', whiteSpace: 'nowrap' }}>
                {formattedList && (
                  <s style={{ fontSize: 14, fontWeight: 400, color: '#a0a0b8', marginRight: 8 }}>{formattedList}</s>
                )}
                {formattedPrice} HT
              </span>
            </div>

            <p style={{ fontSize: 13, color: '#6b6d85', margin: '16px 0 0', lineHeight: 1.5 }}>
              {t(pack === 'solo' ? 'switchToDuo' : 'switchToSolo')}{' '}
              <Link
                href={`/checkout?pack=${otherPack}`}
                replace
                style={{ color: '#0f1020', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}
              >
                {t(pack === 'solo' ? 'switchToDuoLink' : 'switchToSoloLink', {
                  price: formatPrice(allPricing[otherPack].unitAmount, allPricing[otherPack].currency, locale),
                })}
              </Link>
            </p>

            <p style={{
              fontSize: 13, color: '#6b6d85', lineHeight: 1.6,
              margin: '16px 0 0', paddingTop: 16, borderTop: '1px solid #f0f0f5',
            }}>
              {t('trustLine')}
            </p>
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

