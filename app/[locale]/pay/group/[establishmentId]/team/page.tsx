import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { GroupAmountSelector } from '@/components/payment/GroupAmountSelector';
import { resolveTipFeeConfig } from '@/lib/pricing/tip-fees';
import {
  Band, BrandMark, Headline, PayColumn, PayIcon, PayMain, PayTitle, Secured, Shimmer,
} from '@/components/pay/ui';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

interface PublicGroupStaffRow {
  establishment_id: string;
  establishment_name: string | null;
  establishment_currency: string | null;
  group_logo_url: string | null;
  tip_thresholds: number[] | null;
  staff_id: string | null;
  is_payable: boolean | null;
  establishment_payable?: boolean | null;
  team_size?: number | null;
  establishment_is_demo?: boolean | null;
  fee_fixed_cents?: number | null;
  fee_bps?: number | null;
}

async function fetchGroupStaff(establishmentId: string): Promise<PublicGroupStaffRow[] | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_public_group_staff`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ p_establishment_id: establishmentId }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicGroupStaffRow[];
  } catch {
    return null;
  }
}

export default async function TeamTipPage({
  params,
}: {
  params: Promise<{ locale: string; establishmentId: string }>;
}) {
  const { locale, establishmentId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('pay');

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(establishmentId)) {
    notFound();
  }

  const rows = await fetchGroupStaff(establishmentId);
  if (!rows || rows.length === 0) notFound();

  const header = rows[0]!;
  const payableStaff = rows.filter((r) => r.staff_id && r.is_payable);
  // Everyone the manager added shares a team tip, joined or still invited
  // (see migration 00085); the establishment just has to be payable.
  const teamSize = header.team_size ?? payableStaff.length;
  const canTipTeam = (header.establishment_payable ?? payableStaff.length > 0) && teamSize > 0;
  if (!canTipTeam) notFound();
  const memberLabel = teamSize === 1
    ? t('group.memberOne')
    : t('group.memberOther', { count: teamSize });

  const salonName = header.establishment_name ?? 'Digitip';
  const currency = (header.establishment_currency ?? 'EUR').toUpperCase();
  const thresholds = (Array.isArray(header.tip_thresholds) && header.tip_thresholds.length > 0)
    ? header.tip_thresholds
    : [5, 10, 20];

  return (
    <PayMain>
      {/* Not mocked in the v2 design: built from the same pieces as the
          single-person tip page, with the whole team in place of a person. */}
      <Band logo={<BrandMark logoUrl={header.group_logo_url} />}>
        <Headline>{t('tipHeadline')}</Headline>
        <p style={{ font: '400 14px/20px var(--font)', color: 'var(--text-2)', marginTop: 4 }}>{t('tipSubhead')}</p>
      </Band>
      <PayColumn>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: -56, position: 'relative' }}>
          <span aria-hidden style={{ width: 80, height: 80, borderRadius: '50%', border: '4px solid var(--bg)', background: 'var(--accent-muted)', display: 'grid', placeItems: 'center' }}>
            <PayIcon name="heart" size={32} color="var(--brand)" />
          </span>
          <p style={{ font: '400 14px/20px var(--font)', color: 'var(--text-2)', marginTop: 12 }}>{t('tipFor')}</p>
          <PayTitle>{t('group.wholeTeam')}</PayTitle>
          <p style={{ font: '400 14px/20px var(--font)', color: 'var(--text-3)', marginTop: 2 }}>{salonName} · {memberLabel}</p>
        </div>

        {/* Amount selector + payment */}
        <Suspense
          fallback={
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 20 }}>
              {[1, 2, 3].map(i => <Shimmer key={i} h={64} r={10} />)}
            </div>
          }
        >
          <GroupAmountSelector
            establishmentId={establishmentId}
            currency={currency}
            thresholds={thresholds}
            staffCount={teamSize}
            isDemo={header.establishment_is_demo ?? false}
            feeConfig={resolveTipFeeConfig({
              fixedCents: header.fee_fixed_cents ?? undefined,
              bps: header.fee_bps ?? undefined,
            })}
          />
        </Suspense>

        <Secured>{t('secured')}</Secured>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
          <Link
            href={`/pay/group/${establishmentId}`}
            className="dg-link"
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 12px', font: '500 14px/20px var(--font)' }}
          >
            {t('group.pickIndividual')}
          </Link>
        </div>
      </PayColumn>
    </PayMain>
  );
}
