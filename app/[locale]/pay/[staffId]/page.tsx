import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { AmountSelector } from '@/components/payment/AmountSelector';

// Edge-safe: uses raw PostgREST fetch against a SECURITY DEFINER RPC
// that only exposes whitelisted columns. No Supabase SDK import here.
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

interface PublicStaffRow {
  id: string;
  full_name: string;
  avatar_url: string | null;
  establishment_name: string | null;
  establishment_currency: string | null;
  tip_thresholds: number[] | null;
  is_payable: boolean;
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
      cache: 'no-store',
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  const rows = (await res.json()) as PublicStaffRow[];
  return rows[0] ?? null;
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

  const staff = await fetchPublicStaff(staffId);
  if (!staff) notFound();

  const t = await getTranslations('pay');

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
              fontSize: 28,
            }}
            aria-hidden
          >
            ⏳
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
          <Link
            href="/"
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
            {t('notReadyBack')}
          </Link>
        </div>
      </main>
    );
  }

  const tipThresholds: number[] = Array.isArray(staff.tip_thresholds)
    ? staff.tip_thresholds
    : [1, 2, 5, 10];

  const currency = staff.establishment_currency ?? 'EUR';

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '24px', position: 'relative', overflow: 'hidden',
    }}>
      {/* Glow */}
      <div style={{ position: 'fixed', top: '-15%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 400, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(99,102,241,0.1) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      <div className="fade-up" style={{ width: '100%', maxWidth: 380, position: 'relative', zIndex: 1 }}>
        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 28 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="7" fill="var(--accent)" />
            <path d="M7 12c0-2.8 2.2-5 5-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M17 12c0 2.8-2.2 5-5 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="12" cy="12" r="1.8" fill="white" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '-0.02em' }}>TipLink</span>
        </div>

        {/* Staff card */}
        <div style={{
          padding: '26px', borderRadius: 20, textAlign: 'center', marginBottom: 12,
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
        }}>
          {staff.avatar_url ? (
            <img
              src={staff.avatar_url}
              alt={staff.full_name}
              style={{ width: 68, height: 68, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 12px', display: 'block' }}
            />
          ) : (
            <div style={{
              width: 68, height: 68, borderRadius: '50%', margin: '0 auto 12px',
              background: 'var(--accent)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 26, fontWeight: 800, color: '#fff',
              position: 'relative',
            }}>
              {staff.full_name.charAt(0).toUpperCase()}
              <div style={{ position: 'absolute', bottom: 3, right: 3, width: 14, height: 14, borderRadius: '50%', background: 'var(--success)', border: '2.5px solid var(--surface)' }} />
            </div>
          )}
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 3 }}>{staff.full_name}</h2>
          {staff.establishment_name && (
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{staff.establishment_name}</p>
          )}
        </div>

        {/* Amount selector + payment */}
        <Suspense
          fallback={
            <div style={{ padding: 20, borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--border-subtle)', marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[1, 2, 3, 4].map(i => <div key={i} className="shimmer" style={{ height: 64, borderRadius: 12 }} />)}
              </div>
            </div>
          }
        >
          <AmountSelector
            staffId={staff.id}
            currency={currency}
            thresholds={tipThresholds}
          />
        </Suspense>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-3)', marginTop: 12, lineHeight: 1.65 }}>
          {t('secured')}
        </p>
      </div>
    </main>
  );
}
