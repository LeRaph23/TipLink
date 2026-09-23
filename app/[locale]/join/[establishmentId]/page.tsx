import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyTeamJoinToken } from '@/lib/auth/team-join-token';
import { readTeamJoinVersion, TEAM_TOKEN_PARAM } from '@/lib/auth/team-join-link';
import { JoinForm } from './JoinForm';

export const dynamic = 'force-dynamic';

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; establishmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  // This page used to be fully public and list every pending colleague's name
  // AND email address, one `auth.admin.getUserById` per row. The establishment
  // id is the href of the "see the team" link on the page every NFC scan lands
  // on, so that was a staff roster with contact details, downloadable by anyone
  // who had walked past the salon. It also handed an attacker exactly what the
  // invite-hijack on POST /api/staff/join needed.
  //
  // Who may see what is now decided here, and the two legitimate arrivals get
  // only what they need:
  //
  //   - an invited employee is signed in already (the emailed link runs through
  //     /auth/accept first), so we show them their own pending profile and
  //     nothing else. Their own address is not a disclosure;
  //   - someone following the manager's signed team link sees the profiles the
  //     manager pre-created without an email. Those rows have no auth user and
  //     therefore no address to leak.
  //
  // Anyone else sees the establishment's name and an instruction to ask for an
  // invitation. No roster.
  const sp = await searchParams;
  const rawToken = sp[TEAM_TOKEN_PARAM];
  const teamToken = typeof rawToken === 'string' ? rawToken : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let visibleProfiles: { id: string; full_name: string; email?: string }[] = [];
  let hasTeamLink = false;

  if (user) {
    const { data: own } = await service
      .from('staff_profiles')
      .select('id, full_name')
      .eq('establishment_id', establishmentId)
      .eq('user_id', user.id)
      .eq('is_active', false)
      .is('deleted_at', null)
      .maybeSingle();
    if (own) {
      visibleProfiles = [{ id: own.id, full_name: own.full_name, email: user.email ?? undefined }];
    }
  }

  if (visibleProfiles.length === 0) {
    hasTeamLink = verifyTeamJoinToken(
      teamToken,
      establishmentId,
      await readTeamJoinVersion(service, establishmentId),
    ).valid;

    if (hasTeamLink) {
      // Pre-created by an admin with no email invite: user_id IS NULL, so there
      // is no address attached to any of these rows.
      const { data: unclaimed } = await service
        .from('staff_profiles')
        .select('id, full_name')
        .eq('establishment_id', establishmentId)
        .is('user_id', null)
        .is('deleted_at', null)
        .order('full_name');
      visibleProfiles = (unclaimed ?? []).map((p) => ({ id: p.id, full_name: p.full_name }));
    }
  }

  // Nothing vouches for this visitor: no invitation of their own, no valid
  // team link. POST /api/staff/join would refuse them anyway; saying so here
  // is kinder than letting them fill in a form that cannot succeed.
  const needsInvite = !hasTeamLink && visibleProfiles.length === 0 && !user;

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

        {needsInvite ? (
          <div style={{
            padding: '20px 22px', background: 'var(--surface)',
            border: '1px solid var(--border-subtle)', borderRadius: 16,
            textAlign: 'center', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6,
          }}>
            Pour rejoindre cette équipe, utilisez le lien d’invitation que votre
            responsable vous a envoyé par e-mail, ou demandez-lui le lien de
            l’équipe.
          </div>
        ) : (
          <JoinForm
            establishmentId={est.id}
            establishmentName={est.name}
            unclaimedProfiles={visibleProfiles}
            teamToken={teamToken}
          />
        )}

        <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-3)', marginTop: 24 }}>
          Propulsé par Digitip · Paiements sécurisés par Stripe
        </p>
      </div>
    </main>
  );
}
