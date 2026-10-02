import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { AmountSelector } from '@/components/payment/AmountSelector';
import {
  Avatar, Band, BandBody, BrandMark, Headline, PayColumn, PayMain, PayTitle, Secured, Shimmer, StatusDot, btnProps,
} from '@/components/pay/ui';
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
      <PayMain pb={32}>
        <Band pb={48} logo={<BrandMark logoUrl={staff.group_logo_url} />}>
          <StatusDot tone="warning" icon="clock" />
          <PayTitle>{t('notReadyTitle')}</PayTitle>
          <BandBody>{t('notReady')}</BandBody>
        </Band>
        <PayColumn style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
          {establishmentId && (
            <Link href={`/pay/group/${establishmentId}`} {...btnProps('primary', 'L', { full: true })}>
              {t('notReadyTipGroup')}
            </Link>
          )}
          <Link href="/" {...btnProps('ghost', 'L', { full: true })}>
            {t('notReadyBack')}
          </Link>
        </PayColumn>
      </PayMain>
    );
  }

  const tipThresholds: number[] = Array.isArray(staff.tip_thresholds) && staff.tip_thresholds.length > 0
    ? staff.tip_thresholds
    : [5, 10, 20];

  const currency = (staff.establishment_currency ?? 'EUR').toUpperCase();

  return (
    <PayMain>
      {/* The plaque's colour field and wave: the screen picks up where the
          object the customer just touched leaves off. The establishment's
          logo (or DigiTip) confirms they are in the right place. */}
      <Band logo={<BrandMark logoUrl={staff.group_logo_url} />}>
        <Headline>{t('tipHeadline')}</Headline>
        <p style={{ font: '400 14px/20px var(--font)', color: 'var(--text-2)', marginTop: 4 }}>{t('tipSubhead')}</p>
      </Band>
      <PayColumn>
        {/* Who you're thanking is the strongest thing on the screen. */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: -56, position: 'relative' }}>
          <Avatar src={staff.avatar_url} alt={staff.full_name} size={80} />
          <p style={{ font: '400 14px/20px var(--font)', color: 'var(--text-2)', marginTop: 12 }}>{t('tipFor')}</p>
          <PayTitle>{staff.full_name}</PayTitle>
          {staff.establishment_name && (
            <p style={{ font: '400 14px/20px var(--font)', color: 'var(--text-3)', marginTop: 2 }}>{staff.establishment_name}</p>
          )}
        </div>

        {/* Amount selector + payment */}
        <Suspense
          fallback={
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 20 }}>
              {[1, 2, 3].map(i => <Shimmer key={i} h={64} r={10} />)}
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

        <Secured>{t('secured')}</Secured>
      </PayColumn>
    </PayMain>
  );
}
