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

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        background: 'var(--bg)',
        padding: '32px 20px 48px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'fixed',
          top: '-15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 600,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(99,102,241,0.1) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div className="fade-up" style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 24 }}>
          {header.group_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={header.group_logo_url}
              alt={header.establishment_name ?? ''}
              style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }}
            />
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="7" fill="var(--accent)" />
              <path d="M7 12c0-2.8 2.2-5 5-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M17 12c0 2.8-2.2 5-5 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="12" cy="12" r="1.8" fill="white" />
            </svg>
          )}
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '-0.02em' }}>
            {header.establishment_name ?? 'Digitip'}
          </span>
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            fontWeight: 800,
            textAlign: 'center',
            color: 'var(--text)',
            letterSpacing: '-0.02em',
            marginBottom: 8,
          }}
        >
          {t('group.pickStaffTitle')}
        </h1>
        <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-3)', marginBottom: 24 }}>
          {t('group.pickStaffSubtitle')}
        </p>

        {payableStaff.length === 0 ? (
          <div
            style={{
              padding: 24,
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
          <div style={{ display: 'grid', gap: 10 }}>
            {payableStaff.map((s) => (
              <Link
                key={s.staff_id!}
                href={`/pay/${s.staff_id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 16px',
                  borderRadius: 14,
                  background: 'var(--surface)',
                  border: '1px solid var(--border-subtle)',
                  textDecoration: 'none',
                  color: 'var(--text)',
                  transition: 'transform 120ms, border-color 120ms',
                }}
              >
                {s.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.avatar_url}
                    alt={s.full_name ?? ''}
                    style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 18,
                    }}
                  >
                    {(s.full_name ?? '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{s.full_name}</div>
                <span aria-hidden style={{ fontSize: 18, color: 'var(--text-3)' }}>→</span>
              </Link>
            ))}
          </div>
        )}

        <p
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--text-3)',
            marginTop: 20,
          }}
        >
          {t('group.poweredBy')}
        </p>
      </div>
    </main>
  );
}
