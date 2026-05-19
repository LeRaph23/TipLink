import Image from 'next/image';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PackCheckout } from '@/components/checkout/PackCheckout';
import { getPackPricing } from '@/lib/mangopay/pricing';
import type { PackId } from '@/lib/env';

const PACK_VISUAL = {
  solo: { img: '/products/solo-3d.jpg', alt: 'Plaque époxy NFC Digitip Solo' },
  duo:  { img: '/products/duo-double.jpg', alt: 'Pack Duo — 2 plaques époxy NFC Digitip' },
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

  if (!isValidPack(pack)) {
    notFound();
  }

  // Pricing comes from Stripe (single source of truth). Visual assets stay local.
  const pricing = await getPackPricing(pack);
  const visual = PACK_VISUAL[pack];
  const formattedPrice = formatPrice(pricing.unitAmount, pricing.currency, locale);
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
            <span aria-hidden style={{ fontSize: 18 }}>←</span> Retour
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
            PAIEMENT SÉCURISÉ
          </div>
        </div>

        <h1 style={{
          fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 900,
          letterSpacing: '-0.03em', marginBottom: 6,
        }}>
          Finaliser votre commande
        </h1>
        <p style={{ fontSize: 14, color: '#6b6d85', marginBottom: 28 }}>
          Un seul paiement, livraison offerte sous 3 jours ouvrés.
        </p>

        {/* Layout: 2 cols on desktop */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)',
          gap: 28,
          alignItems: 'start',
        }} className="checkout-grid">
          <style>{`
            @media (max-width: 900px) {
              .checkout-grid { grid-template-columns: 1fr !important; }
              .checkout-aside { position: static !important; top: auto !important; }
            }
          `}</style>

          {/* Left: order summary + trust signals */}
          <aside className="checkout-aside" style={{
            background: '#fff', borderRadius: 20, padding: 24,
            border: '1px solid #e6e6f0',
            boxShadow: '0 1px 2px rgba(15,16,32,0.04)',
            position: 'sticky', top: 24,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b6d85', letterSpacing: '0.08em', marginBottom: 16 }}>
              VOTRE COMMANDE
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <div style={{
                width: 80, height: 80, borderRadius: 12, overflow: 'hidden',
                position: 'relative', background: '#ede9fe', flexShrink: 0,
              }}>
                <Image src={visual.img} alt={visual.alt} fill sizes="80px" style={{ objectFit: 'cover' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f1020' }}>
                  {pricing.productName}
                </div>
                <div style={{ fontSize: 12.5, color: '#6b6d85', marginTop: 2 }}>
                  {pricing.quantity} plaque{pricing.quantity > 1 ? 's' : ''} époxy NFC
                </div>
                {pricing.savingsPercent != null && (
                  <div style={{
                    display: 'inline-block', marginTop: 6,
                    fontSize: 11, fontWeight: 700, color: '#16a34a',
                  }}>
                    −{pricing.savingsPercent}% vs prix unitaire
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 900, color: '#0f1020', letterSpacing: '-0.02em' }}>
                  {formattedPrice}
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#a0a0b8', marginLeft: 4 }}>HT</span>
                </div>
                {formattedList && (
                  <div style={{ fontSize: 12, color: '#a0a0b8', textDecoration: 'line-through' }}>
                    {formattedList}
                  </div>
                )}
              </div>
            </div>

            {/* Switch pack */}
            <Link
              href={`/checkout?pack=${pack === 'solo' ? 'duo' : 'solo'}`}
              style={{
                display: 'block', padding: '10px 12px', borderRadius: 10,
                border: '1px dashed #E57A97', background: '#FEF1F4',
                color: '#E57A97', fontSize: 12.5, fontWeight: 700,
                textAlign: 'center', textDecoration: 'none',
                marginBottom: 18,
              }}
            >
              Passer au pack {pack === 'solo' ? 'Duo (2 plaques)' : 'Solo (1 plaque)'}
            </Link>

            {/* Trust */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              <Trust
                label="Garantie matériel à vie"
                icon={
                  <svg width={14} height={14} viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path d="M10 2L3 5v5c0 4.5 3 7.5 7 8.5C14 17.5 17 14.5 17 10V5l-7-3z" fill="#0ea36b" opacity=".18" />
                    <path d="M10 2L3 5v5c0 4.5 3 7.5 7 8.5C14 17.5 17 14.5 17 10V5l-7-3z" stroke="#0ea36b" strokeWidth="1.4" strokeLinejoin="round" />
                    <path d="M7 10.5l2 2 4-4" stroke="#0ea36b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                }
              />
              <Trust
                label="Livraison offerte en Europe (3 jours ouvrés)"
                icon={
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="1" y="3" width="15" height="13" rx="1" />
                    <path d="M16 8h4l3 3v5h-7V8z" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                }
              />
              <Trust
                label="Paiement chiffré par Stripe"
                icon={
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                }
              />
              <Trust
                label="Satisfait ou remboursé sous 14 jours"
                icon={
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#E57A97" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 12a9 9 0 1 0 3-6.7" />
                    <path d="M3 4v5h5" />
                  </svg>
                }
              />
            </div>
          </aside>

          {/* Right: Stripe Elements */}
          <main style={{
            background: '#fff', borderRadius: 20, padding: 24,
            border: '1px solid #e6e6f0',
            boxShadow: '0 1px 2px rgba(15,16,32,0.04)',
          }}>
            <PackCheckout pack={pack} locale={locale} />
          </main>
        </div>
      </div>
    </div>
  );
}

function Trust({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#3a3b4f' }}>
      {icon} {label}
    </div>
  );
}
