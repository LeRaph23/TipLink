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

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'flex-start',
      background: 'var(--bg)', padding: '40px 20px 60px',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32, justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="7" fill="var(--accent)" />
            <path d="M7 12c0-2.8 2.2-5 5-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M17 12c0 2.8-2.2 5-5 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="12" cy="12" r="1.8" fill="white" />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-3)' }}>Digitip</span>
        </div>

        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 6 }}>
            Rejoignez {est.name}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6 }}>
            Créez votre compte pour recevoir des pourboires directement sur votre compte bancaire.
          </p>
        </div>

        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 16, padding: 24,
        }}>
          <JoinForm establishmentId={est.id} establishmentName={est.name} />
        </div>

        <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-3)', marginTop: 20 }}>
          Propulsé par Digitip · Paiements sécurisés par Stripe
        </p>
      </div>
    </main>
  );
}
