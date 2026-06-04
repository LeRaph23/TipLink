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

async function fetchStaffName(staffId: string): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_public_staff`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ p_staff_id: staffId }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ full_name?: string }>;
    return rows[0]?.full_name ?? null;
  } catch {
    return null;
  }
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

  // Server-side verification: retrieve real status and amount from Stripe
  let status: RedirectStatus = queryStatus;
  let amountCents: number | null = null;
  let currency: string | null = null;
  let staffId: string | null = null;

  if (sp.payment_intent && sp.redirect_status === 'succeeded') {
    try {
      const pi = await stripe.paymentIntents.retrieve(sp.payment_intent);
      status =
        pi.status === 'succeeded' ? 'succeeded' :
        pi.status === 'processing' ? 'processing' :
        'requires_payment_method';
      amountCents = pi.amount;
      currency = pi.currency?.toUpperCase() ?? null;
      staffId = pi.metadata?.staff_id ?? null;
    } catch {
      // Stripe unreachable — keep query-param as fallback
    }
  } else if (sp.payment_intent && sp.redirect_status !== 'succeeded') {
    // Even on failure, try to get the staffId for the retry link
    try {
      const pi = await stripe.paymentIntents.retrieve(sp.payment_intent);
      staffId = pi.metadata?.staff_id ?? null;
      amountCents = pi.amount;
      currency = pi.currency?.toUpperCase() ?? null;
    } catch {
      // ignore
    }
  }

  const staffName = staffId ? await fetchStaffName(staffId) : null;

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
