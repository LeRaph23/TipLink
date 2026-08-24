import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { AmountSelector } from '@/components/payment/AmountSelector';
import { Icon } from '@/components/ambassadeur/icons';
import { staffTipTag } from '@/lib/cache/pay-tags';
import { resolveTipFeeConfig } from '@/lib/pricing/tip-fees';

// Edge-safe: uses raw PostgREST fetch against a SECURITY DEFINER RPC
// that only exposes whitelisted columns. No Supabase SDK import here.
//
// The two Supabase reads are cached in the Next.js Data Cache and tagged per
// staff member, so a scanned tag is served without a database round-trip after
// the first hit. Dashboard mutations (name/avatar, activation, Stripe
// onboarding completion, demo mode…) invalidate `staffTipTag(staffId)`, and the
// `revalidate` windows below bound staleness if a path is ever missed.
export const runtime = 'edge';

interface PublicStaffRow {
  id: string;
  full_name: string;
  avatar_url: string | null;
  establishment_name: string | null;
  establishment_currency: string | null;
  tip_thresholds: number[] | null;
  is_payable: boolean;
  group_logo_url: string | null;
  establishment_is_demo?: boolean | null;
  fee_fixed_cents?: number | null;
  fee_bps?: number | null;
}

async function fetchPublicStaff(staffId: string): Promise<PublicStaffRow | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) return null;

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_public_staff`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ p_staff_id: staffId }),
      // Cache the profile (name, avatar, payable status, thresholds) for a few
      // minutes; invalidated on-demand via staffTipTag when any of it changes.
      next: { revalidate: 300, tags: [staffTipTag(staffId)] },
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  const rows = (await res.json()) as PublicStaffRow[];
  return rows[0] ?? null;
}

async function fetchEstablishmentId(staffId: string): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) return null;

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/staff_profiles?id=eq.${encodeURIComponent(staffId)}&select=establishment_id&limit=1`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          Accept: 'application/json',
        },
        // A staff member's establishment never changes, so this can be cached
        // aggressively; still tagged so it's purged alongside the profile.
        next: { revalidate: 3600, tags: [staffTipTag(staffId)] },
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ establishment_id: string | null }>;
    return rows[0]?.establishment_id ?? null;
  } catch {
    return null;
  }
}

export default async function StaffTipPage({
  params,
}: {
  params: Promise<{ locale: string; staffId: string }>;
}) {
  const { locale, staffId } = await params;
  setRequestLocale(locale);

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staffId)) {
    notFound();
  }

  // Fire the two independent lookups (staff profile + establishment id) and the
  // translations in parallel rather than waterfalling them — saves a full
  // round-trip on the payment page. establishmentId is used both by the
  // "tip the team" link in the not-payable view and by the AmountSelector
  // cross-tenant guard below; fetching it eagerly only wastes a query in the
  // rare notFound() case.
  const [staff, establishmentId, t] = await Promise.all([
    fetchPublicStaff(staffId),
    fetchEstablishmentId(staffId),
    getTranslations('pay'),
  ]);
  if (!staff) notFound();

  if (!staff.is_payable) {

    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 380,
            padding: 28,
            borderRadius: 20,
            background: 'var(--surface)',
            border: '1px solid var(--border-subtle)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(255,193,7,0.12)',
              border: '1px solid rgba(255,193,7,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: 'var(--warning, #f59e0b)',
            }}
            aria-hidden
          >
            <Icon name="hourglass" size={28} />
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 800,
              color: 'var(--text)',
              marginBottom: 8,
              letterSpacing: '-0.02em',
            }}
          >
            {t('notReadyTitle')}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 20, lineHeight: 1.5 }}>
            {t('notReady')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {establishmentId && (
              <Link
                href={`/pay/group/${establishmentId}`}
                style={{
                  display: 'inline-block',
                  padding: '10px 18px',
                  borderRadius: 10,
                  background: 'var(--accent)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 14,
                  textDecoration: 'none',
                }}
              >
                {t('notReadyTipGroup')}
              </Link>
            )}
            <Link
              href="/"
              style={{
                display: 'inline-block',
                padding: '10px 18px',
                borderRadius: 10,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-2)',
                fontWeight: 500,
                fontSize: 14,
                textDecoration: 'none',
              }}
            >
              {t('notReadyBack')}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const tipThresholds: number[] = Array.isArray(staff.tip_thresholds) && staff.tip_thresholds.length > 0
    ? staff.tip_thresholds
    : [5, 10, 20];

  const currency = (staff.establishment_currency ?? 'EUR').toUpperCase();

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '20px',
    }}>
      <div className="fade-up" style={{ width: '100%', maxWidth: 400 }}>
        {/* Branded "say thanks" hero — echoes the physical NFC plaque: a
            pink→purple gradient with a white heart and a clear "leave a tip"
            message, so the customer instantly understands what this is for. */}
        <div style={{ borderRadius: 24, overflow: 'hidden', marginBottom: 14, boxShadow: '0 18px 50px rgba(124,58,237,0.28)' }}>
          <div style={{
            background: 'linear-gradient(135deg, #F2A8B7 0%, #C96CC1 52%, #7C3AED 100%)',
            padding: '30px 24px 28px', textAlign: 'center', color: '#fff',
          }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px', display: 'block' }} aria-hidden>
              <path d="M12 20.4l-1.45-1.32C5.4 14.36 2.5 11.72 2.5 8.5 2.5 5.9 4.54 3.9 7.1 3.9c1.45 0 2.84.67 3.74 1.74L12 6.9l1.16-1.26A4.97 4.97 0 0 1 16.9 3.9c2.56 0 4.6 2 4.6 4.6 0 3.22-2.9 5.86-8.05 10.6L12 20.4z" />
            </svg>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 23, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {t('tipHeadline')}
            </div>
            <div style={{ fontSize: 14, opacity: 0.95, marginTop: 5 }}>
              {t('tipSubhead')}
            </div>
          </div>
          {/* Who you're tipping, on white */}
          <div style={{ background: 'var(--surface)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 13 }}>
            {staff.avatar_url ? (
              <img src={staff.avatar_url} alt={staff.full_name} width={52} height={52} decoding="async" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.4" /><path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6" /></svg>
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('tipFor')}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{staff.full_name}</div>
              {staff.establishment_name && (
                <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{staff.establishment_name}</div>
              )}
            </div>
          </div>
        </div>

        {/* Amount selector + payment */}
        <Suspense
          fallback={
            <div style={{ padding: 20, borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[1, 2, 3].map(i => <div key={i} className="shimmer" style={{ height: 64, borderRadius: 12 }} />)}
              </div>
            </div>
          }
        >
          <AmountSelector
            staffId={staff.id}
            currency={currency}
            thresholds={tipThresholds}
            expectedEstablishmentId={establishmentId ?? undefined}
            isDemo={staff.establishment_is_demo ?? false}
            feeConfig={resolveTipFeeConfig({
              fixedCents: staff.fee_fixed_cents ?? undefined,
              bps: staff.fee_bps ?? undefined,
            })}
          />
        </Suspense>

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6, margin: '0 0 8px' }}>{t('secured')}</p>
          {staff.group_logo_url ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 24 }}>
              <img src={staff.group_logo_url} alt="" height={24} style={{ height: 24, maxWidth: 110, objectFit: 'contain', opacity: 0.75 }} />
            </span>
          ) : (
            <span style={{ fontFamily: 'var(--font-poppins), sans-serif', fontWeight: 800, fontSize: 14, letterSpacing: '-0.03em', color: '#E57A97' }}>DigiTip</span>
          )}
        </div>
      </div>
    </main>
  );
}
