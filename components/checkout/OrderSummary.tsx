'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';

// The checkout follows Stripe Checkout's hosted page: system font, near-black
// text at two opacities, hairline dividers, no cards, no badges. The only
// brand colour left is the pay button.
export const SC = {
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
  text: 'rgba(26,26,26,0.9)',
  text2: 'rgba(26,26,26,0.6)',
  line: 'rgba(26,26,26,0.1)',
  fill: 'rgba(26,26,26,0.05)',
  brand: '#C2456A',
} as const;

export type Pack = 'solo' | 'duo';

export type SummaryProduct = {
  pack: Pack;
  name: string;
  description: string;
  image: string;
  alt: string;
  unitAmount: number;
  currency: string;
};

export type SummaryTax = { ht: number; tax: number; total: number; ratePct: number | null; country: string };

/** Two columns on desktop (summary left, form right), stacked on mobile. */
export function CheckoutShell({ summary, form, footer }: { summary: ReactNode; form: ReactNode; footer: ReactNode }) {
  return (
    <div className="sc-root" style={{ fontFamily: SC.font, color: SC.text, background: '#fff' }}>
      <style>{`
        .sc-root { min-height: 100vh; display: flex; flex-direction: column; -webkit-font-smoothing: antialiased; }
        .sc-left { padding: 16px 16px 24px; }
        .sc-right { padding: 32px 16px 40px; box-shadow: 0 -1px 0 ${SC.line}; }
        .sc-col { width: 100%; max-width: 380px; margin: 0 auto; }
        .sc-hero { text-align: center; }
        .sc-details[data-open="false"] { display: none; }
        .sc-footer-left { display: none; }
        @media (min-width: 992px) {
          .sc-root { flex-direction: row; }
          .sc-left { flex: 1; display: flex; justify-content: flex-end; padding: 56px 80px 40px 40px; }
          .sc-right { flex: 1; display: flex; justify-content: flex-start; padding: 56px 40px 40px 80px;
            box-shadow: -15px 0 30px -15px rgba(0,0,0,0.12); }
          .sc-col { margin: 0; display: flex; flex-direction: column; }
          .sc-hero { text-align: left; }
          .sc-details[data-open] { display: block; }
          .sc-toggle { display: none !important; }
          .sc-footer-left { display: block; margin-top: auto; padding-top: 48px; }
          .sc-footer-right { display: none; }
          .sc-footer-left .sc-footer { justify-content: flex-start !important; }
        }
      `}</style>
      <div className="sc-left">
        <div className="sc-col">
          {summary}
          <div className="sc-footer-left">{footer}</div>
        </div>
      </div>
      <div className="sc-right">
        <div className="sc-col">
          {form}
          <div className="sc-footer-right" style={{ marginTop: 32 }}>{footer}</div>
        </div>
      </div>
    </div>
  );
}

export function CheckoutFooter() {
  const t = useTranslations('checkout');
  const link = { color: SC.text2, textDecoration: 'none' } as const;
  return (
    <div className="sc-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, fontSize: 12, color: SC.text2 }}>
      <span>{t('poweredBy')} <strong style={{ fontWeight: 700 }}>stripe</strong></span>
      <span aria-hidden style={{ width: 1, height: 14, background: SC.line }} />
      <Link href="/cgv" style={link}>{t('footerTerms')}</Link>
      <Link href="/privacy" style={link}>{t('footerPrivacy')}</Link>
    </div>
  );
}

export function OrderSummary({
  product,
  locale,
  discount = 0,
  promoCode = null,
  tax = null,
  taxLoading = false,
  promoSlot = null,
}: {
  product: SummaryProduct;
  locale: string;
  discount?: number;
  promoCode?: string | null;
  tax?: SummaryTax | null;
  taxLoading?: boolean;
  promoSlot?: ReactNode;
}) {
  const t = useTranslations('checkout');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const fmt = (cents: number) =>
    new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
      style: 'currency',
      currency: product.currency.toUpperCase(),
    }).format(cents / 100);

  // Until the address is priced, the French total: an HT figure on top that
  // later becomes a bigger charge reads like a hidden fee (UX-12).
  // VAT comes from Stripe Tax for the delivery country (the visitor's, until
  // an address says otherwise). Until it is in, the total stays blank rather
  // than showing a guess.
  const total = tax ? tax.total : null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Link href="/" aria-label={t('back')} style={{ color: SC.text2, display: 'inline-flex', padding: 4, margin: -4 }}>
          <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <span style={{ fontSize: 14, fontWeight: 500 }}>Digitip</span>
      </div>

      <div className="sc-hero">
        <div style={{ fontSize: 16, fontWeight: 500, color: SC.text2 }}>{t('payMerchant')}</div>
        <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.03em', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          {total != null ? fmt(total) : <span style={{ color: SC.text2 }}>{t('vatCalculating')}</span>}
        </div>
        <button
          type="button"
          className="sc-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{
            marginTop: 12, padding: '4px 10px', borderRadius: 6, border: 'none',
            background: SC.fill, color: SC.text, fontSize: 13, fontWeight: 500,
            fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          {t('details')}
          <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="sc-details" data-open={open ? 'true' : 'false'} style={{ marginTop: 32 }}>
        {/* Line item */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{
            width: 42, height: 42, borderRadius: 6, overflow: 'hidden', position: 'relative', flexShrink: 0,
            boxShadow: `0 0 0 1px ${SC.line}`,
          }}>
            <Image src={product.image} alt={product.alt} fill sizes="42px" style={{ objectFit: 'cover' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, fontWeight: 500 }}>
              <span>{product.name}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(product.unitAmount)}</span>
            </div>
            <div style={{ fontSize: 12, color: SC.text2, marginTop: 2 }}>{product.description}</div>
            <label style={{
              position: 'relative', display: 'inline-flex', alignItems: 'center', marginTop: 8,
              borderRadius: 4, background: SC.fill, fontSize: 12, fontWeight: 500,
            }}>
              <span style={{ padding: '3px 0 3px 8px' }}>{t('qty')}</span>
              <select
                value={product.pack}
                onChange={(e) => router.replace(`/checkout?pack=${e.target.value}`)}
                style={{
                  appearance: 'none', WebkitAppearance: 'none', border: 'none', background: 'transparent',
                  font: 'inherit', color: SC.text, padding: '3px 20px 3px 4px', cursor: 'pointer',
                }}
              >
                <option value="solo">1</option>
                <option value="duo">2</option>
              </select>
              <svg width={8} height={8} viewBox="0 0 10 10" aria-hidden style={{ position: 'absolute', right: 7, pointerEvents: 'none' }}>
                <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </label>
          </div>
        </div>

        {/* Totals */}
        <div style={{ marginLeft: 58, marginTop: 24 }}>
          <Row label={t('rowSubtotal')} value={fmt(product.unitAmount)} first />
          {discount > 0 && (
            <Row label={promoCode ?? t('rowDiscount')} value={`−${fmt(discount)}`} />
          )}
          {promoSlot && <div style={{ padding: '0 0 16px' }}>{promoSlot}</div>}
          <Row label={t('rowShipping')} value={t('shippingFree')} />
          <Row
            label={
              tax && tax.ratePct != null
                ? t('rowVatCountry', {
                    country: new Intl.DisplayNames([locale], { type: 'region' }).of(tax.country) ?? tax.country,
                    rate: tax.ratePct,
                  })
                : t('rowVat')
            }
            value={taxLoading ? t('vatCalculating') : tax ? fmt(tax.tax) : '—'}
            muted={!tax || taxLoading}
          />
          {tax?.country === 'CH' && (
            <p style={{ fontSize: 12, color: SC.text2, lineHeight: 1.5, margin: '0 0 12px' }}>{t('exportNoteCH')}</p>
          )}
          <Row label={t('rowTotal')} value={taxLoading ? t('vatCalculating') : total != null ? fmt(total) : '—'} strong />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, first, strong, muted }: { label: string; value: string; first?: boolean; strong?: boolean; muted?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: first || strong ? '16px 0' : '0 0 16px',
      borderTop: first || strong ? `1px solid ${SC.line}` : 'none',
      fontSize: strong ? 16 : 14, fontWeight: strong ? 600 : 500,
    }}>
      <span>{label}</span>
      <span style={{ color: muted ? SC.text2 : SC.text, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}
