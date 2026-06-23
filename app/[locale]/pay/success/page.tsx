import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { stripe } from '@/lib/stripe/client';

export const dynamic = 'force-dynamic';

type RedirectStatus = 'succeeded' | 'processing' | 'requires_payment_method' | 'failed';

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    payment_intent?: string;
    redirect_status?: string;
    // Demo mode (no real charge): the pay page routes here directly.
    demo?: string;
    staff?: string;
    establishment?: string;
    amt?: string;
    cur?: string;
  }>;
}

function StatusIcon({ status }: { status: RedirectStatus }) {
  if (status === 'succeeded') {
    return (
      <div className="check-in" style={{
        width: 80, height: 80, borderRadius: '50%', margin: '0 auto 24px',
        background: 'var(--success-bg)',
        border: '1.5px solid color-mix(in oklch, var(--success) 40%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="34" height="34" viewBox="0 0 34 34" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17l7 7 13-13" />
        </svg>
      </div>
    );
  }
  if (status === 'processing') {
    return (
      <div style={{
        width: 80, height: 80, borderRadius: '50%', margin: '0 auto 24px',
        background: 'var(--warning-bg)',
        border: '1.5px solid color-mix(in oklch, var(--warning) 40%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="34" height="34" viewBox="0 0 34 34" fill="none" stroke="var(--warning)" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="17" cy="17" r="12" />
          <path d="M17 10v7l4 4" />
        </svg>
      </div>
    );
  }
  // failed / requires_payment_method
  return (
    <div style={{
      width: 80, height: 80, borderRadius: '50%', margin: '0 auto 24px',
      background: 'var(--error-bg)',
      border: '1.5px solid color-mix(in oklch, var(--error) 40%, transparent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none" stroke="var(--error)" strokeWidth="2.5" strokeLinecap="round">
        <path d="M10 10l14 14M24 10L10 24" />
      </svg>
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
      default: return sp.redirect_status === undefined ? 'succeeded' : 'failed';
    }
  })();

  // Demo mode: no PaymentIntent exists — values come straight from the query
  // string the demo pay button built. Nothing is ever charged or persisted.
  const isDemo = sp.demo === '1';

  // Server-side verification: retrieve real status and amount from Stripe
  let status: RedirectStatus = isDemo ? 'succeeded' : queryStatus;
  let amountCents: number | null = isDemo && sp.amt ? Number(sp.amt) || null : null;
  let currency: string | null = isDemo ? (sp.cur?.toUpperCase() ?? 'EUR') : null;
  let staffId: string | null = isDemo ? (sp.staff ?? null) : null;
  let establishmentId: string | null = isDemo ? (sp.establishment ?? null) : null;

  if (!isDemo && sp.payment_intent && sp.redirect_status === 'succeeded') {
    try {
      const pi = await stripe.paymentIntents.retrieve(sp.payment_intent);
      status =
        pi.status === 'succeeded' ? 'succeeded' :
        pi.status === 'processing' ? 'processing' :
        'requires_payment_method';
      amountCents = pi.amount;
      currency = pi.currency?.toUpperCase() ?? null;
      staffId = pi.metadata?.staff_id ?? null;
      establishmentId = pi.metadata?.establishment_id ?? null;
    } catch {
      // Stripe unreachable — keep query-param as fallback
    }
  } else if (sp.payment_intent && sp.redirect_status !== 'succeeded') {
    // Even on failure, try to get the staffId for the retry link
    try {
      const pi = await stripe.paymentIntents.retrieve(sp.payment_intent);
      staffId = pi.metadata?.staff_id ?? null;
      establishmentId = pi.metadata?.establishment_id ?? null;
      amountCents = pi.amount;
      currency = pi.currency?.toUpperCase() ?? null;
    } catch {
      // ignore
    }
  }

  // Only fetch the review link on success — there's nothing to celebrate (or
  // ask a review for) on a failed/processing payment.
  const { staffName, reviewUrl } =
    status === 'succeeded'
      ? await fetchTipContext(staffId, establishmentId)
      : { staffName: staffId ? (await fetchTipContext(staffId, null)).staffName : null, reviewUrl: null };

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

  const glowColor =
    status === 'succeeded' ? 'rgba(34,197,94,0.08)' :
    status === 'processing' ? 'rgba(251,191,36,0.08)' :
    'rgba(239,68,68,0.08)';

  const fmtAmount = amountCents !== null && currency
    ? new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(amountCents / 100)
    : null;

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '24px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 400, height: 400, borderRadius: '50%', background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`, pointerEvents: 'none' }} />

      <div className="fade-up" style={{ width: '100%', maxWidth: 380, textAlign: 'center', position: 'relative', zIndex: 1 }}>
        {isDemo && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14,
            padding: '4px 12px', borderRadius: 100,
            background: 'var(--surface-2)', border: '1px dashed var(--border)',
            color: 'var(--text-3)', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em',
          }}>
            🧪 {t('demo.badge')}
          </div>
        )}
        <StatusIcon status={status} />

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 8 }}>
          {heading}
        </h1>
        <p style={{ fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 28 }}>
          {subheading}
        </p>

        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)', padding: 20, textAlign: 'left', marginBottom: 20,
          boxShadow: 'var(--shadow)',
        }}>
          {fmtAmount && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: staffName ? '1px solid var(--border-subtle)' : undefined }}>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('successAmount')}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>{fmtAmount}</span>
            </div>
          )}
          {staffName && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0' }}>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('sentTo')}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{staffName}</span>
            </div>
          )}
        </div>

        {status === 'succeeded' && reviewUrl && (
          <a
            href={reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', textDecoration: 'none',
              background: 'var(--surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)', padding: 20, marginBottom: 20,
              boxShadow: 'var(--shadow)',
            }}
          >
            <div style={{ fontSize: 22, letterSpacing: 2, color: '#f5a623', marginBottom: 8 }}>
              ★★★★★
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              {staffName ? t('reviewTitleNamed', { name: staffName }) : t('reviewTitle')}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 14 }}>
              {t('reviewBody')}
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', boxSizing: 'border-box',
              padding: '12px 20px', borderRadius: 'var(--radius)',
              background: 'var(--accent)', color: 'var(--accent-fg, #fff)',
              fontSize: 14, fontWeight: 700,
            }}>
              {t('reviewButton')}
            </span>
          </a>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {status !== 'succeeded' && staffId && (
            <Link href={`/pay/${staffId}`} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '10px 20px', borderRadius: 'var(--radius)',
              background: 'var(--accent)', color: 'var(--accent-fg)',
              fontSize: 13.5, fontWeight: 600, textDecoration: 'none',
            }}>
              {t('failedRetry')} →
            </Link>
          )}
          <Link href="/" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '10px 20px', borderRadius: 'var(--radius)',
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontSize: 13, fontWeight: 500, textDecoration: 'none',
          }}>
            ← {t('successBack')}
          </Link>
        </div>
      </div>
    </main>
  );
}
