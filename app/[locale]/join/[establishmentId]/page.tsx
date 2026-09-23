import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
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

  // Fetch profiles that haven't completed the join flow yet:
  // - is_active = false → invited via email after the current fix (not yet claimed)
  // - user_id IS NULL   → pre-created by admin without sending an email invite
  const { data: pendingProfiles } = await service
    .from('staff_profiles')
    .select('id, full_name, user_id')
    .eq('establishment_id', establishmentId)
    .is('deleted_at', null)
    .or('is_active.eq.false,user_id.is.null')
    .order('full_name');

  // This page is public (the establishment id also appears on the tip page a
  // customer lands on after a scan), so it must not disclose who was invited:
  // an invited profile only carries a masked hint of its address. The visitor's
  // own pending profile, if any, is resolved here from the session instead.
  const { data: { user } } = await (await createClient()).auth.getUser();
  const ownProfileId = pendingProfiles?.find((p) => user && p.user_id === user.id)?.id ?? null;

  const profiles: { id: string; full_name: string; emailHint?: string }[] = [];
  if (pendingProfiles && pendingProfiles.length > 0) {
    await Promise.all(
      pendingProfiles.map(async (p) => {
        let emailHint: string | undefined;
        if (p.user_id) {
          const { data } = await service.auth.admin.getUserById(p.user_id);
          emailHint = maskEmail(data?.user?.email);
        }
        profiles.push({ id: p.id, full_name: p.full_name, emailHint });
      })
    );
    // Sort by full_name after async operations
    profiles.sort((a, b) => a.full_name.localeCompare(b.full_name, 'fr'));
  }

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'flex-start',
      background: 'var(--bg)', padding: '40px 20px 60px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Brand wordmark */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <span style={{
            fontSize: 20,
            fontWeight: 800,
            color: '#E57A97',
            letterSpacing: '-0.03em',
            fontFamily: 'var(--font-poppins), sans-serif',
          }}>
            DigiTip
          </span>
        </div>

        {/* Salon invitation header */}
        <div style={{
          textAlign: 'center',
          marginBottom: 32,
          padding: '16px 20px',
          background: 'var(--surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 16,
        }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            Vous êtes invité(e) à rejoindre
          </p>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', margin: 0 }}>
            {est.name}
          </h2>
        </div>

        <JoinForm
          establishmentId={est.id}
          establishmentName={est.name}
          unclaimedProfiles={profiles}
          ownProfileId={ownProfileId}
        />

        <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-3)', marginTop: 24 }}>
          Propulsé par Digitip · Paiements sécurisés par Stripe
        </p>
      </div>
    </main>
  );
}

/** "marc.serveur@exemple.fr" -> "m•••@exemple.fr": enough to recognise, not to reuse. */
function maskEmail(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const at = email.indexOf('@');
  if (at < 1) return undefined;
  return `${email[0]}•••${email.slice(at)}`;
}
