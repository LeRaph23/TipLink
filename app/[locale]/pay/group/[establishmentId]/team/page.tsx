import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { GroupAmountSelector } from '@/components/payment/GroupAmountSelector';
import { resolveTipFeeConfig } from '@/lib/pricing/tip-fees';

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
  if (payableStaff.length === 0) notFound();
  const memberLabel = payableStaff.length === 1
    ? t('group.memberOne')
    : t('group.memberOther', { count: payableStaff.length });

  const salonName = header.establishment_name ?? 'Digitip';
  const currency = (header.establishment_currency ?? 'EUR').toUpperCase();
  const thresholds = (Array.isArray(header.tip_thresholds) && header.tip_thresholds.length > 0)
    ? header.tip_thresholds
    : [5, 10, 20];

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '20px',
    }}>
      <div className="fade-up" style={{ width: '100%', maxWidth: 400 }}>
        {/* Branded "say thanks" hero — identical to the single-person tip page
            so the team flow looks and feels the same. */}
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
          {/* Who you're tipping, on white — the whole team. */}
          <div style={{ background: 'var(--surface)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 13 }}>
            {header.group_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={header.group_logo_url} alt={salonName} style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20.4l-1.45-1.32C5.4 14.36 2.5 11.72 2.5 8.5 2.5 5.9 4.54 3.9 7.1 3.9c1.45 0 2.84.67 3.74 1.74L12 6.9l1.16-1.26A4.97 4.97 0 0 1 16.9 3.9c2.56 0 4.6 2 4.6 4.6 0 3.22-2.9 5.86-8.05 10.6L12 20.4z" /></svg>
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('tipFor')}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('group.wholeTeam')}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{salonName} · {memberLabel}</div>
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
          <GroupAmountSelector
            establishmentId={establishmentId}
            currency={currency}
            thresholds={thresholds}
            staffCount={payableStaff.length}
            isDemo={header.establishment_is_demo ?? false}
            feeConfig={resolveTipFeeConfig({
              fixedCents: header.fee_fixed_cents ?? undefined,
              bps: header.fee_bps ?? undefined,
            })}
          />
        </Suspense>

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6, margin: '0 0 8px' }}>{t('secured')}</p>
          <Link
            href={`/pay/group/${establishmentId}`}
            style={{ fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none' }}
          >
            {t('group.pickIndividual')}
          </Link>
          <div style={{ marginTop: 10 }}>
            {header.group_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={header.group_logo_url} alt="" style={{ height: 24, maxWidth: 110, objectFit: 'contain', opacity: 0.75 }} />
            ) : (
              <span style={{ fontFamily: 'var(--font-poppins), sans-serif', fontWeight: 800, fontSize: 14, letterSpacing: '-0.03em', color: '#E57A97' }}>DigiTip</span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
