import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createServiceClient } from '@/lib/supabase/service';
import { JoinForm } from './JoinForm';

export const dynamic = 'force-dynamic';

export default async function JoinPage({
  params,
}: {
  params: Promise<{ locale: string; establishmentId: string }>;
}) {
  const { locale, establishmentId } = await params;
  setRequestLocale(locale);

  if (!/^[0-9a-f-]{36}$/i.test(establishmentId)) notFound();

  const service = createServiceClient();
  const { data: est } = await service
    .from('establishments')
    .select('id, name, group_id')
    .eq('id', establishmentId)
    .is('deleted_at', null)
    .single();

  if (!est) notFound();

  // Fetch unclaimed staff profiles so the employee can self-identify
  const { data: unclaimedProfiles } = await service
    .from('staff_profiles')
    .select('id, full_name')
    .eq('establishment_id', establishmentId)
    .is('user_id', null)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('full_name');

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'flex-start',
      background: 'var(--bg)', padding: '40px 20px 60px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 36, justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="7" fill="var(--accent)" />
            <path d="M7 12c0-2.8 2.2-5 5-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M17 12c0 2.8-2.2 5-5 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="12" cy="12" r="1.8" fill="white" />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-3)' }}>Digitip</span>
        </div>

        <JoinForm
          establishmentId={est.id}
          establishmentName={est.name}
          unclaimedProfiles={unclaimedProfiles ?? []}
        />

        <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-3)', marginTop: 24 }}>
          Propulsé par Digitip · Paiements sécurisés par Stripe
        </p>
      </div>
    </main>
  );
}
