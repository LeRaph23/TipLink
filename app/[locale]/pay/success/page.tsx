import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { createServiceClient } from '@/lib/supabase/service';
import { ReviewInvite } from '@/components/pay/ReviewInvite';
import {
  Band, BandBody, DemoBadge, Logo, PayColumn, PayMain, PayTitle, StatusDot, btnProps,
} from '@/components/pay/ui';

export const dynamic = 'force-dynamic';

type RedirectStatus = 'succeeded' | 'processing' | 'requires_payment_method' | 'failed';

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    payment_intent?: string;
    // Appended by Stripe to the return URL; proves this visitor made the payment.
    payment_intent_client_secret?: string;
    redirect_status?: string;
    // Demo mode (no real charge): the pay page routes here directly.
    demo?: string;
    staff?: string;
    establishment?: string;
    amt?: string;
    cur?: string;
  }>;
}

/* One receipt line. The total is the only figure set large. */
function ReceiptRow({ k, v, strong, last }: { k: string; v: string; strong?: boolean; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '12px 0',
      borderBottom: last ? 'none' : '1px solid var(--border-subtle)',
    }}>
      <span style={{ font: '400 14px/20px var(--font)', color: 'var(--text-2)' }}>{k}</span>
      <span style={{
        font: strong ? '600 20px/28px var(--font-display)' : '500 14px/20px var(--font)',
        color: 'var(--text)', fontVariantNumeric: 'tabular-nums', textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere',
      }}>
        {v}
      </span>
    </div>
  );
}

async function callRpc<T>(fn: string, body: Record<string, unknown>): Promise<T[] | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T[];
  } catch {
    return null;
  }
}

// Resolves the tipped staff member's name and the establishment's Google review
// link. Single-staff tips carry staff_id; group tips carry establishment_id.
async function fetchTipContext(
  staffId: string | null,
  establishmentId: string | null,
): Promise<{ staffName: string | null; reviewUrl: string | null }> {
  if (staffId) {
    const rows = await callRpc<{ full_name?: string; establishment_review_url?: string | null }>(
      'get_public_staff',
      { p_staff_id: staffId },
    );
    return {
      staffName: rows?.[0]?.full_name ?? null,
      reviewUrl: rows?.[0]?.establishment_review_url ?? null,
    };
  }
  if (establishmentId) {
    const rows = await callRpc<{ establishment_review_url?: string | null }>(
      'get_public_establishment_review',
      { p_establishment_id: establishmentId },
    );
    return { staffName: null, reviewUrl: rows?.[0]?.establishment_review_url ?? null };
  }
  return { staffName: null, reviewUrl: null };
}

export default async function PaySuccessPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('pay');

  const queryStatus: RedirectStatus = (() => {
    switch (sp.redirect_status) {
      case 'succeeded': return 'succeeded';
      case 'processing': return 'processing';
      case 'requires_payment_method': return 'requires_payment_method';
      // An unrecognised value is a failure. A MISSING one is not: it used to
      // fall through to 'succeeded', so a bare GET of /pay/success — a
      // bookmark, a shared link, back-then-forward — rendered the green tick
      // and "Merci !" for a payment that never happened. That case is caught
      // before this runs; anything reaching here carries a payment_intent.
      default: return 'failed';
    }
  })();

  // Demo mode: no PaymentIntent exists — values come straight from the query
  // string the demo pay button built. Nothing is ever charged or persisted.
  const isDemo = sp.demo === '1';

  // Nothing to confirm. Stripe always returns here with ?payment_intent=…, so
  // its absence means the visitor did not arrive from a payment at all. Saying
  // so plainly beats both alternatives: claiming success is a lie, and
  // "Votre carte a été refusée" would alarm someone who simply opened a
  // bookmark.
  // Whoever holds a PaymentIntent id is not its payer: the id shows up in
  // logs, receipts and support emails. Stripe appends the intent's client
  // secret to the return URL, so only the browser that paid carries it.
  // Without it the page used to show the amount of any intent passed in
  // (seventh QA run). A Stripe outage leaves `intent` null: the page then
  // falls back to the query status, with no amount, as before.
  let intent: Stripe.PaymentIntent | null = null;
  if (!isDemo && sp.payment_intent) {
    try {
      intent = await stripe.paymentIntents.retrieve(sp.payment_intent);
    } catch {
      intent = null;
    }
  }
  const foreignIntent =
    intent !== null && (!sp.payment_intent_client_secret || intent.client_secret !== sp.payment_intent_client_secret);

  if ((!isDemo && !sp.payment_intent) || foreignIntent) {
    return (
      <PayMain pb={32}>
        <Band tone="neutral" pb={48} logo={<Logo />}>
          <PayTitle>{t('nothingToShow')}</PayTitle>
          <BandBody>{t('nothingToShowBody')}</BandBody>
        </Band>
        <PayColumn style={{ display: 'flex', flexDirection: 'column', marginTop: 24 }}>
          <Link href="/" {...btnProps('secondary', 'L', { full: true })}>
            {t('nothingToShowCta')}
          </Link>
        </PayColumn>
      </PayMain>
    );
  }

  // Server-side verification: retrieve real status and amount from Stripe
  let status: RedirectStatus = isDemo ? 'succeeded' : queryStatus;
  let amountCents: number | null = isDemo && sp.amt ? Number(sp.amt) || null : null;
  let currency: string | null = isDemo ? (sp.cur?.toUpperCase() ?? 'EUR') : null;
  let staffId: string | null = isDemo ? (sp.staff ?? null) : null;
  let establishmentId: string | null = isDemo ? (sp.establishment ?? null) : null;
  // The tip and the service fee the tipper added on top, as written server-side
  // at intent creation, so the customer sees what the total is made of.
  let tipCents: number | null = null;
  let feeCents: number | null = null;
  let receiptTransactionId: string | null = null;

  if (intent && sp.redirect_status === 'succeeded') {
    const pi = intent;
    status =
      pi.status === 'succeeded' ? 'succeeded' :
      pi.status === 'processing' ? 'processing' :
      'requires_payment_method';
    amountCents = pi.amount;
    currency = pi.currency?.toUpperCase() ?? null;
    staffId = pi.metadata?.staff_id ?? null;
    establishmentId = pi.metadata?.establishment_id ?? null;
    const tip = Number(pi.metadata?.tip_amount);
    const fee = Number(pi.metadata?.service_fee);
    tipCents = Number.isFinite(tip) && tip > 0 ? tip : null;
    feeCents = tipCents !== null && Number.isFinite(fee) && fee > 0 ? fee : null;
    receiptTransactionId = pi.metadata?.transaction_id ?? null;
  } else if (intent && sp.redirect_status !== 'succeeded') {
    // Even on failure, get the staffId for the retry link
    staffId = intent.metadata?.staff_id ?? null;
    establishmentId = intent.metadata?.establishment_id ?? null;
    amountCents = intent.amount;
    currency = intent.currency?.toUpperCase() ?? null;
  }

  // Only fetch the review link on success — there's nothing to celebrate (or
  // ask a review for) on a failed/processing payment.
  const { staffName, reviewUrl } =
    status === 'succeeded'
      ? await fetchTipContext(staffId, establishmentId)
      : { staffName: staffId ? (await fetchTipContext(staffId, null)).staffName : null, reviewUrl: null };

  // The tip this page is confirming, looked up only when there is an
  // invitation to attribute a click to. It is what turns "somebody clicked"
  // into "12 of your 47 tips this month did", which is the difference between
  // a statistic and something a subscriber can act on. Absent in demo mode:
  // no charge happened, so there is no tip to attribute anything to.
  const transactionId = reviewUrl && !isDemo && sp.payment_intent
    ? (await createServiceClient()
        .from('transactions')
        .select('id')
        .eq('stripe_payment_intent_id', sp.payment_intent)
        .maybeSingle()).data?.id ?? null
    : null;

  const heading =
    status === 'succeeded'
      ? t('success')
      : status === 'processing'
        ? t('processing')
        : t('failed');

  const subheading =
    status === 'succeeded'
      ? (staffName ? t('successBodyNamed', { name: staffName }) : t('successBody'))
      : status === 'processing'
        ? t('processingBody')
        : t('failedBody');

  const money = (cents: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: currency ?? 'EUR', minimumFractionDigits: 2 }).format(cents / 100);
  const fmtAmount = amountCents !== null && currency ? money(amountCents) : null;
  // Opens without an account: the receipt page checks the client secret.
  const receiptHref = status === 'succeeded' && receiptTransactionId && sp.payment_intent && sp.payment_intent_client_secret
    ? `/receipt/${receiptTransactionId}?pi=${encodeURIComponent(sp.payment_intent)}&cs=${encodeURIComponent(sp.payment_intent_client_secret)}`
    : null;

  // Rose only for a payment that went through: there is nothing to celebrate
  // on a failure, and a pending one is not yet good news.
  const succeeded = status === 'succeeded';
  const receiptRows: Array<{ k: string; v: string; strong?: boolean }> = [];
  if (tipCents !== null) receiptRows.push({ k: t('successTip'), v: money(tipCents) });
  if (feeCents !== null) receiptRows.push({ k: t('successFee'), v: money(feeCents) });
  if (fmtAmount) receiptRows.push({ k: tipCents !== null ? t('successTotal') : t('successAmount'), v: fmtAmount, strong: true });
  if (staffName) receiptRows.push({ k: t('sentTo'), v: staffName });

  return (
    <PayMain pb={32}>
      <Band tone={succeeded ? 'brand' : 'neutral'} pb={48} logo={<Logo />}>
        {isDemo && <DemoBadge>🧪 {t('demo.badge')}</DemoBadge>}
        {succeeded ? (
          <StatusDot tone="success" icon="check" />
        ) : status === 'processing' ? (
          <StatusDot tone="warning" icon="clock" />
        ) : (
          <StatusDot tone="error" icon="x" />
        )}
        <PayTitle>{heading}</PayTitle>
        <BandBody>{subheading}</BandBody>
      </Band>

      <PayColumn>
        {receiptRows.length > 0 && (
          <div style={{
            marginTop: 16, padding: '4px 20px', borderRadius: 'var(--radius-lg)',
            background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          }}>
            {receiptRows.map((r, i) => (
              <ReceiptRow key={r.k} k={r.k} v={r.v} strong={r.strong} last={i === receiptRows.length - 1} />
            ))}
          </div>
        )}

        {succeeded && reviewUrl && (
          <ReviewInvite
            reviewUrl={reviewUrl}
            staffName={staffName}
            transactionId={transactionId}
          />
        )}

        {succeeded ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 16 }}>
            {receiptHref && (
              <Link href={receiptHref} {...btnProps('secondary', 'L', { full: true })}>
                {t('successReceipt')}
              </Link>
            )}
            <Link href="/" {...btnProps('ghost', 'M', { full: true })}>
              {t('successBack')}
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
            {staffId && (
              <Link href={`/pay/${staffId}`} {...btnProps('primary', 'L', { full: true })}>
                {t('failedRetry')}
              </Link>
            )}
            <Link href="/" {...btnProps('ghost', 'L', { full: true })}>
              {t('successBack')}
            </Link>
          </div>
        )}
      </PayColumn>
    </PayMain>
  );
}
