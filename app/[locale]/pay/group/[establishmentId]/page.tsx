import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

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
      cache: 'no-store',
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;
  return (await res.json()) as PublicGroupStaffRow[];
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

  const rows = await fetchGroupStaff(establishmentId);
  if (!rows || rows.length === 0) notFound();

  const t = await getTranslations('pay');

  const header = rows[0]!;
  const payableStaff = rows.filter((r) => r.staff_id && r.is_payable);
  const salonName = header.establishment_name ?? 'Digitip';

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'var(--bg)',
        padding: '48px 16px 72px',
      }}
    >
      <div className="fade-up" style={{ width: '100%', maxWidth: 400 }}>

        {/* Branded "say thanks" hero — same look as the tip page / plaque. */}
        <div style={{ borderRadius: 24, overflow: 'hidden', marginBottom: 18, boxShadow: '0 18px 50px rgba(124,58,237,0.28)' }}>
          <div style={{
            background: 'linear-gradient(135deg, #F2A8B7 0%, #C96CC1 52%, #7C3AED 100%)',
            padding: '30px 24px 26px', textAlign: 'center', color: '#fff',
          }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px', display: 'block' }} aria-hidden>
              <path d="M12 20.4l-1.45-1.32C5.4 14.36 2.5 11.72 2.5 8.5 2.5 5.9 4.54 3.9 7.1 3.9c1.45 0 2.84.67 3.74 1.74L12 6.9l1.16-1.26A4.97 4.97 0 0 1 16.9 3.9c2.56 0 4.6 2 4.6 4.6 0 3.22-2.9 5.86-8.05 10.6L12 20.4z" />
            </svg>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 23, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {t('tipHeadline')}
            </div>
            <div style={{ fontSize: 15, opacity: 0.95, marginTop: 5, fontWeight: 600 }}>{salonName}</div>
          </div>
          <div style={{ background: 'var(--surface)', padding: '14px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>{t('group.pickStaffSubtitle')}</p>
          </div>
        </div>

        {/* Staff list */}
        {payableStaff.length === 0 ? (
          <div
            style={{
              padding: '28px 24px',
              borderRadius: 16,
              background: 'var(--surface)',
              border: '1px solid var(--border-subtle)',
              textAlign: 'center',
              color: 'var(--text-3)',
              fontSize: 14,
            }}
          >
            {t('group.noStaff')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {payableStaff.map((s) => (
              <Link
                key={s.staff_id!}
                href={`/pay/${s.staff_id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '16px 18px',
                  borderRadius: 16,
                  background: 'var(--surface)',
                  border: '1px solid var(--border-subtle)',
                  textDecoration: 'none',
                  color: 'var(--text)',
                  minHeight: 72,
                  transition: 'transform 120ms, border-color 120ms',
                }}
              >
                {s.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.avatar_url}
                    alt={s.full_name ?? ''}
                    style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: 48, height: 48, borderRadius: '50%',
                      background: 'var(--surface-2)', color: 'var(--text-3)',
                      border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                    aria-hidden
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.4" /><path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6" /></svg>
                  </div>
                )}
                <span style={{ flex: 1, fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.full_name}
                </span>
                <span aria-hidden style={{ fontSize: 18, color: 'var(--text-3)', opacity: 0.6 }}>
                  →
                </span>
              </Link>
            ))}

            {/* Whole-team split — only when 2+ members, shown last; neutral card,
                heart icon, no subtitle. */}
            {payableStaff.length > 1 && (
              <Link
                href={`/pay/group/${establishmentId}/team`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '16px 18px', borderRadius: 16,
                  background: 'var(--surface)', border: '1px solid var(--border-subtle)',
                  textDecoration: 'none', color: 'var(--text)', minHeight: 76,
                }}
              >
                <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} aria-hidden>
                  <svg width="23" height="23" viewBox="0 0 24 24" fill="#E57A97" stroke="none"><path d="M12 21s-7.5-4.6-10-9.2C.6 9 1.7 5.5 4.8 4.7 6.7 4.2 8.6 5 9.6 6.4L12 9l2.4-2.6c1-1.4 2.9-2.2 4.8-1.7 3.1.8 4.2 4.3 2.8 7.1C19.5 16.4 12 21 12 21z" /></svg>
                </div>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>
                  {t('group.wholeTeam')}
                </span>
                <span aria-hidden style={{ fontSize: 18, color: 'var(--text-3)', opacity: 0.6, flexShrink: 0 }}>→</span>
              </Link>
            )}
          </div>
        )}

        <p
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--text-3)',
            opacity: 0.5,
            marginTop: 28,
            letterSpacing: '0.02em',
          }}
        >
          {t('group.poweredBy')}
        </p>
      </div>
    </main>
  );
}
