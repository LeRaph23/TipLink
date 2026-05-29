import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Icon } from '@/components/ambassadeur/icons';

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

        {/* Brand mark */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <span
            style={{
              fontFamily: 'Poppins, var(--font-display), sans-serif',
              fontSize: 15,
              fontWeight: 800,
              color: 'var(--accent)',
              letterSpacing: '-0.01em',
            }}
          >
            DigiTip
          </span>
        </div>

        {/* Salon identity */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginBottom: 36 }}>
          {header.group_logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={header.group_logo_url}
              alt={salonName}
              style={{
                width: 80,
                height: 80,
                borderRadius: 20,
                objectFit: 'cover',
                boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
              }}
            />
          )}
          <div style={{ textAlign: 'center' }}>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 32,
                fontWeight: 800,
                color: 'var(--text)',
                letterSpacing: '-0.03em',
                lineHeight: 1.15,
                marginBottom: 10,
              }}
            >
              {salonName}
            </h1>
            <p
              style={{
                fontSize: 15,
                color: 'var(--text-3)',
                lineHeight: 1.5,
                maxWidth: 280,
                margin: '0 auto',
              }}
            >
              {t('group.pickStaffSubtitle')}
            </p>
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
            {/* "Whole team" option */}
            {payableStaff.length > 1 && (
              <Link
                href={`/pay/group/${establishmentId}/team`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '16px 18px',
                  borderRadius: 16,
                  background: 'linear-gradient(135deg, rgba(229,122,151,0.12), rgba(236,151,176,0.06))',
                  border: '1.5px solid rgba(229,122,151,0.3)',
                  textDecoration: 'none',
                  color: 'var(--text)',
                  minHeight: 72,
                  transition: 'transform 120ms, border-color 120ms',
                }}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'var(--accent)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon name="users" size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em', display: 'block' }}>
                    {t('group.wholeTeam')}
                  </span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                    {t('group.splitEqually', { count: payableStaff.length })}
                  </span>
                </div>
                <span aria-hidden style={{ fontSize: 18, color: 'var(--accent)', opacity: 0.8 }}>→</span>
              </Link>
            )}
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
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 20,
                      flexShrink: 0,
                    }}
                  >
                    {(s.full_name ?? '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <span style={{ flex: 1, fontWeight: 600, fontSize: 16, letterSpacing: '-0.01em' }}>
                  {s.full_name}
                </span>
                <span aria-hidden style={{ fontSize: 18, color: 'var(--text-3)', opacity: 0.6 }}>
                  →
                </span>
              </Link>
            ))}
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
