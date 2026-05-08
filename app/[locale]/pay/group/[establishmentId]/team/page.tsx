import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { GroupAmountSelector } from '@/components/payment/GroupAmountSelector';

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

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(establishmentId)) {
    notFound();
  }

  const rows = await fetchGroupStaff(establishmentId);
  if (!rows || rows.length === 0) notFound();

  const header = rows[0]!;
  const payableStaff = rows.filter((r) => r.staff_id && r.is_payable);
  if (payableStaff.length === 0) notFound();

  const salonName = header.establishment_name ?? 'Digitip';
  const currency = header.establishment_currency ?? 'EUR';
  const thresholds = header.tip_thresholds ?? [1, 2, 5, 10];

  return (
    <main style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', background: 'var(--bg)', padding: '48px 16px 72px',
    }}>
      <div className="fade-up" style={{ width: '100%', maxWidth: 400 }}>

        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <span style={{
            fontFamily: 'Poppins, var(--font-display), sans-serif',
            fontSize: 15, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.01em',
          }}>
            DigiTip
          </span>
        </div>

        {/* Salon + team identity */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          {header.group_logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={header.group_logo_url}
              alt={salonName}
              style={{ width: 64, height: 64, borderRadius: 16, objectFit: 'cover', marginBottom: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}
            />
          )}
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800,
            color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 6,
          }}>
            {salonName}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-3)' }}>
            Toute l&apos;équipe · {payableStaff.length} membre{payableStaff.length > 1 ? 's' : ''}
          </p>
        </div>

        <GroupAmountSelector
          establishmentId={establishmentId}
          currency={currency}
          thresholds={thresholds}
          staffCount={payableStaff.length}
        />

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <Link
            href={`/pay/group/${establishmentId}`}
            style={{ fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none' }}
          >
            ← Choisir un membre en particulier
          </Link>
        </div>

        <p style={{
          textAlign: 'center', fontSize: 11, color: 'var(--text-3)',
          opacity: 0.5, marginTop: 20, letterSpacing: '0.02em',
        }}>
          Propulsé par DigiTip · Paiements sécurisés par Stripe
        </p>
      </div>
    </main>
  );
}
