import { Suspense, type CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { establishmentTipTag } from '@/lib/cache/pay-tags';
import {
  Avatar, Band, BrandMark, Headline, LogoShimmer, PayColumn, PayIcon, PayMain, Shimmer,
} from '@/components/pay/ui';

// Reached via an internal rewrite from `/s/[shortId]` right after an NFC scan,
// so this is the hottest tip path. The colleague list is cached in the Data
// Cache and tagged per establishment, so repeat scans skip the Supabase
// round-trip. Mutations that change the roster or its display (staff add/edit/
// deactivate, Stripe onboarding, demo mode…) invalidate the tag.
export const runtime = 'edge';

type T = Awaited<ReturnType<typeof getTranslations>>;

interface PublicGroupStaffRow {
  establishment_id: string;
  establishment_name: string | null;
  establishment_currency: string | null;
  group_logo_url: string | null;
  tip_thresholds: number[] | null;
  staff_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_payable: boolean | null;
  /** Migration 00085: the establishment can be paid, whoever has joined. */
  establishment_payable?: boolean | null;
  /** Migration 00085: members the manager added, joined or still invited. */
  team_size?: number | null;
}

async function fetchGroupStaff(establishmentId: string): Promise<PublicGroupStaffRow[] | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_public_group_staff`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ p_establishment_id: establishmentId }),
      next: { revalidate: 300, tags: [establishmentTipTag(establishmentId)] },
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;
  return (await res.json()) as PublicGroupStaffRow[];
}

/* Brand field — same as the tip page. Shared by the streamed content and the
   skeleton so the layout is identical: only the logo and the salon name wait
   for the data, as shimmers. */
function HeroBand({ t, salonName, logoUrl }: { t: T; salonName: string | null; logoUrl?: string | null }) {
  return (
    <Band pb={48} logo={salonName === null ? <LogoShimmer /> : <BrandMark logoUrl={logoUrl} />}>
      <Headline>{t('tipHeadline')}</Headline>
      {salonName === null ? (
        <Shimmer w={140} h={16} style={{ margin: '8px auto 0' }} />
      ) : (
        <p style={{ font: '600 16px/24px var(--font)', color: 'var(--text-2)', marginTop: 4 }}>{salonName}</p>
      )}
    </Band>
  );
}

function Subtitle({ t }: { t: T }) {
  return (
    <p style={{ font: '400 14px/20px var(--font)', color: 'var(--text-2)', textAlign: 'center', margin: '12px 0 16px', textWrap: 'balance' }}>
      {t('group.pickStaffSubtitle')}
    </p>
  );
}

function PoweredBy({ t }: { t: T }) {
  return (
    <p style={{ textAlign: 'center', font: '500 12px/16px var(--font)', color: 'var(--text-3)', marginTop: 24 }}>
      {t('group.poweredBy')}
    </p>
  );
}

/* One card with hairline separators rather than a stack of cards. */
const LIST: CSSProperties = {
  borderRadius: 'var(--radius-lg)', background: 'var(--surface)', border: '1px solid var(--border-subtle)', overflow: 'hidden',
};
const ROW: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16, minHeight: 72, padding: '12px 16px',
  textDecoration: 'none', color: 'var(--text)',
};
const ROW_NAME: CSSProperties = {
  flex: 1, minWidth: 0, font: '600 16px/24px var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const divider = (last: boolean): CSSProperties => (last ? {} : { borderBottom: '1px solid var(--border-subtle)' });

/* Instant shell: brand field (real headline) + shimmer rows matching the real
   list exactly, so there is no layout shift when data streams in. */
function GroupTipSkeleton({ t }: { t: T }) {
  return (
    <>
      <HeroBand t={t} salonName={null} />
      <PayColumn>
        <Subtitle t={t} />
        <div style={LIST} aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ ...ROW, ...divider(i === 2) }}>
              <Shimmer w={48} h={48} r={999} style={{ flexShrink: 0 }} />
              <Shimmer w={`${60 - i * 8}%`} h={16} />
            </div>
          ))}
        </div>
        <PoweredBy t={t} />
      </PayColumn>
    </>
  );
}

/* Async data section — fetches the staff list and renders the real hero + list.
   Lives under a <Suspense> boundary so the skeleton above paints instantly while
   this streams in. */
async function GroupTipContent({ establishmentId, t }: { establishmentId: string; t: T }) {
  const rows = await fetchGroupStaff(establishmentId);
  if (!rows || rows.length === 0) notFound();

  const header = rows[0]!;
  const payableStaff = rows.filter((r) => r.staff_id && r.is_payable);
  const salonName = header.establishment_name ?? 'Digitip';
  // A team tip only needs the establishment to be payable and someone on the
  // team, joined or not: the money goes to the establishment either way. So a
  // freshly set-up restaurant whose staff have not accepted their invitation
  // yet still takes tips from its very first customer.
  const teamSize = header.team_size ?? payableStaff.length;
  const canTipTeam = (header.establishment_payable ?? payableStaff.length > 0) && teamSize > 0;
  const showTeamCard = canTipTeam && (teamSize > 1 || payableStaff.length === 0);

  return (
    <>
      <HeroBand t={t} salonName={salonName} logoUrl={header.group_logo_url} />
      <PayColumn>
        <Subtitle t={t} />

        {payableStaff.length === 0 && !canTipTeam ? (
          <div style={{ ...LIST, padding: 24, textAlign: 'center', color: 'var(--text-2)', font: '400 14px/20px var(--font)' }}>
            {t('group.noStaff')}
          </div>
        ) : (
          <div style={LIST}>
            {/* Whole-team split — when 2+ members, or when nobody has joined yet
                (then it is the only row). First, not last: a customer who does
                not know the waiter's name looks for "everyone" (UX-16). */}
            {showTeamCard && (
              <Link href={`/pay/group/${establishmentId}/team`} className="dg-row" style={{ ...ROW, ...divider(payableStaff.length === 0) }}>
                <span aria-hidden style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent-muted)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <PayIcon name="heart" size={22} color="var(--brand)" />
                </span>
                <span style={ROW_NAME}>{t('group.wholeTeam')}</span>
                <span style={{ color: 'var(--text-3)' }}><PayIcon name="chevron" size={20} /></span>
              </Link>
            )}

            {payableStaff.map((s, i) => (
              <Link
                key={s.staff_id!}
                href={`/pay/${s.staff_id}`}
                className="dg-row"
                style={{ ...ROW, ...divider(i === payableStaff.length - 1) }}
              >
                <Avatar src={s.avatar_url} name={s.full_name} alt="" size={48} ring={0} />
                <span style={ROW_NAME}>{s.full_name}</span>
                <span style={{ color: 'var(--text-3)' }}><PayIcon name="chevron" size={20} /></span>
              </Link>
            ))}

          </div>
        )}

        <PoweredBy t={t} />
      </PayColumn>
    </>
  );
}

export default async function GroupTipPage({
  params,
}: {
  params: Promise<{ locale: string; establishmentId: string }>;
}) {
  const { locale, establishmentId } = await params;
  setRequestLocale(locale);

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(establishmentId)) {
    notFound();
  }

  const t = await getTranslations('pay');

  return (
    <PayMain pb={32}>
      <Suspense fallback={<GroupTipSkeleton t={t} />}>
        <GroupTipContent establishmentId={establishmentId} t={t} />
      </Suspense>
    </PayMain>
  );
}
