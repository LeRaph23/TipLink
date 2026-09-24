import { timingSafeEqual } from 'crypto';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { stripe } from '@/lib/stripe/client';
import { createServiceClient } from '@/lib/supabase/service';
import { signOnboardingToken } from '@/lib/auth/onboarding-token';
import { PixelPurchase } from '@/components/marketing/PixelPurchase';

type PackInfo = {
  label: string;
  quantity: number;
  amount: string;
  // For the pixel's purchase event, which reports revenue excluding VAT.
  paymentIntentId: string;
  pack: 'solo' | 'duo';
  htCents: number;
  currency: string;
  fmtHt: string;
  fmtTax: string;
  fmtDiscount: string | null;
  promoCode: string | null;
  /** Only when the visitor proved they made this payment (client secret). */
  next: { kind: 'setup'; href: string; orderRef: string } | { kind: 'dashboard'; orderRef: string | null } | { kind: 'preparing' } | null;
};

function holdsSecret(intentSecret: string | null, cs: string | undefined): boolean {
  if (!intentSecret || !cs || intentSecret.length !== cs.length) return false;
  return timingSafeEqual(Buffer.from(intentSecret), Buffer.from(cs));
}

// What the buyer does next. An express buyer has no account yet: the webhook
// created their space and emailed a signed setup link; the same link is
// offered here, to whoever holds the payment's client secret (Stripe appends
// it to this return URL), so nobody waits for an email to get started.
async function nextStep(intent: import('stripe').Stripe.PaymentIntent, cs: string | undefined): Promise<PackInfo['next']> {
  if (!holdsSecret(intent.client_secret, cs)) return null;
  const service = createServiceClient();
  const { data: order } = await service
    .from('smarttag_orders')
    .select('id, group_id')
    .eq('stripe_payment_intent_id', intent.id)
    .maybeSingle();
  const orderRef = order ? order.id.slice(0, 8).toUpperCase() : null;
  if (intent.metadata?.source !== 'pack-express') return { kind: 'dashboard', orderRef };
  const email = intent.metadata?.customer_email?.trim() || intent.receipt_email || null;
  if (!order?.group_id || !email || !orderRef) return { kind: 'preparing' };
  const token = signOnboardingToken(order.group_id, email);
  return {
    kind: 'setup',
    href: `/onboarding?group=${order.group_id}&token=${token}&email=${encodeURIComponent(email)}`,
    orderRef,
  };
}

async function resolvePack(paymentIntentId: string | undefined, cs: string | undefined, locale: string): Promise<PackInfo | null> {
  if (!paymentIntentId || !paymentIntentId.startsWith('pi_')) return null;
  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded' && intent.status !== 'processing') return null;
    const rawPack = intent.metadata?.pack;
    const pack = rawPack === 'solo' || rawPack === 'duo' ? rawPack : null;
    if (!pack) return null;
    const quantity = Number(intent.metadata?.quantity ?? 0) || (pack === 'solo' ? 1 : 2);
    const fmt = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
      style: 'currency',
      currency: intent.currency.toUpperCase(),
      minimumFractionDigits: 2,
    });
    const ht = Number(intent.metadata?.ht_amount ?? NaN);
    const tax = Number(intent.metadata?.tax_amount ?? NaN);
    const discount = Number(intent.metadata?.discount_amount ?? 0);
    const htCents = Number.isFinite(ht) ? ht : intent.amount;
    return {
      fmtHt: fmt.format(htCents / 100),
      fmtTax: fmt.format((Number.isFinite(tax) ? tax : intent.amount - htCents) / 100),
      fmtDiscount: discount > 0 ? fmt.format(discount / 100) : null,
      promoCode: intent.metadata?.promo_code ?? null,
      next: await nextStep(intent, cs),
      label: pack === 'solo' ? 'Pack Solo' : 'Pack Duo',
      quantity,
      amount: fmt.format(intent.amount / 100),
      paymentIntentId: intent.id,
      pack,
      htCents,
      currency: intent.currency,
    };
  } catch {
    return null;
  }
}

export default async function OrderSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ payment_intent?: string; payment_intent_client_secret?: string; redirect_status?: string }>;
}) {
  const { locale } = await params;
  const { payment_intent, payment_intent_client_secret } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('orderSuccess');

  const steps = [t('steps.s1'), t('steps.s2'), t('steps.s3')];
  const packInfo = await resolvePack(payment_intent, payment_intent_client_secret, locale);

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

        {packInfo && (
          <PixelPurchase
            eventId={packInfo.paymentIntentId}
            valueCents={packInfo.htCents}
            currency={packInfo.currency}
            pack={packInfo.pack}
            quantity={packInfo.quantity}
          />
        )}

        {/* Order summary (only when we have a PI) */}
        {packInfo && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '14px 18px', marginBottom: 24, textAlign: 'left',
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{packInfo.label}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>
                {packInfo.quantity} plaque{packInfo.quantity > 1 ? 's' : ''} NFC
              </div>
            </div>
            <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text)' }}>
              {packInfo.amount}
            </div>
          </div>
        )}
        {packInfo && (
          <div style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'left', margin: '-14px 0 24px', padding: '0 18px', lineHeight: 1.8 }}>
            {packInfo.fmtDiscount && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{t('discount')}{packInfo.promoCode ? ` (${packInfo.promoCode})` : ''}</span><span>−{packInfo.fmtDiscount}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{t('totalHt')}</span><span>{packInfo.fmtHt}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{t('vat')}</span><span>{packInfo.fmtTax}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--text)' }}><span>{t('totalTtc')}</span><span>{packInfo.amount}</span></div>
            {packInfo.next && 'orderRef' in packInfo.next && packInfo.next.orderRef && (
              <div style={{ marginTop: 6, color: 'var(--text-3)' }}>{t('orderRef', { ref: packInfo.next.orderRef })}</div>
            )}
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
        {packInfo?.next?.kind === 'setup' || packInfo?.next?.kind === 'dashboard' ? (
          <Link
            href={packInfo.next.kind === 'setup' ? packInfo.next.href : '/dashboard'}
            style={{
              display: 'block', padding: '14px', borderRadius: 12, marginBottom: 12,
              background: 'linear-gradient(135deg, #E57A97, #EC97B0)', color: '#fff',
              fontSize: 15, fontWeight: 700, textDecoration: 'none', textAlign: 'center',
            }}
          >
            {packInfo.next.kind === 'setup' ? t('ctaSetup') : t('ctaDashboard')}
          </Link>
        ) : (
          <div style={{
            padding: '16px 20px', borderRadius: 12,
            background: 'var(--surface)', border: '1px solid var(--border)',
            fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 20,
          }}>
            {packInfo?.next?.kind === 'preparing' ? t('preparing') : t('nextStep')}
          </div>
        )}
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
