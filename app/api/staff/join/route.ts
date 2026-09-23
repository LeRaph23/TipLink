import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyTeamJoinToken } from '@/lib/auth/team-join-token';
import { readTeamJoinVersion } from '@/lib/auth/team-join-link';

export const runtime = 'nodejs';

// Joins a staff member to an establishment.
//
// This used to also create a Stripe Standard account for them and hand back a
// hosted-onboarding URL. Employees no longer hold a Stripe account at all: tips
// land in the establishment's single connected account and reach the employee
// through payroll, so there is nothing to verify here and no KYC to sit
// through before their tag works.
//
// Authorisation, which this route previously had none of beyond "is signed
// in": `establishmentId` arrives in the request body and is not a secret (it
// is the href of the "see the team" link on the page every NFC scan lands on),
// so any account could POST any id and land on that salon's public tip page,
// in its payroll export, and in the equal split every group tip is divided by.
// A caller must now match one of the three ways a person legitimately arrives
// here:
//
//   1. they were invited by email  — lib/staff-invite.ts already set
//      staff_profiles.user_id to their auth id before the email went out, so
//      the link is in the database and needs no token;
//   2. they already hold a role in this establishment (a manager adding
//      themselves to the tip list, or a pre-created role);
//   3. they followed the manager's signed team-join link.
//
// Everything else is refused, with one generic message: a caller probing
// establishment ids should not be able to tell "no such profile" from "not
// your profile".
const FORBIDDEN = 'Ce lien n’est plus valide. Demandez une invitation au responsable de l’établissement.';

type JoinBody = {
  establishmentId?: string;
  fullName?: string;
  selectedProfileId?: string | null;
  avatarUrl?: string | null;
  locale?: string;
  /** Signed team-join token from the `?t=` query parameter, when present. */
  teamToken?: string | null;
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: JoinBody;
  try {
    body = (await req.json()) as JoinBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { establishmentId, fullName, selectedProfileId, avatarUrl, teamToken } = body;

  if (!establishmentId) return NextResponse.json({ error: 'Missing establishmentId' }, { status: 400 });

  const service = createServiceClient();

  const { data: est } = await service
    .from('establishments')
    .select('id, group_id')
    .eq('id', establishmentId)
    .is('deleted_at', null)
    .single();

  if (!est) return NextResponse.json({ error: 'Establishment not found' }, { status: 404 });

  // A valid team link stands in for an invitation, and only for the
  // establishment it names. The version is re-read from the row on every use,
  // so a manager who regenerates the link breaks every outstanding copy.
  //
  // Read separately and tolerantly: migrations are pushed independently of the
  // app, and selecting a column that does not exist yet fails the whole query.
  // Folding it into the lookup above would turn "migration 00079 not applied"
  // into "no establishment exists", i.e. nobody can join at all.
  const hasTeamLink = verifyTeamJoinToken(
    teamToken,
    establishmentId,
    await readTeamJoinVersion(service, establishmentId),
  ).valid;

  // Already affiliated: an emailed invitation pre-creates this row, and a
  // manager of the establishment holds one too.
  const { data: existingRole } = await service
    .from('user_roles')
    .select('id')
    .eq('user_id', user.id)
    .eq('establishment_id', establishmentId)
    .maybeSingle();

  if (selectedProfileId) {
    // Claiming a profile the manager created. Read it first: the previous
    // version updated straight through a filter that checked the profile was
    // unclaimed but never that it was *this caller's* to claim, so a signed-in
    // stranger could take a colleague's pending invitation and lock the real
    // employee out permanently.
    const { data: profile } = await service
      .from('staff_profiles')
      .select('id, user_id, is_active')
      .eq('id', selectedProfileId)
      .eq('establishment_id', establishmentId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!profile || profile.is_active) {
      return NextResponse.json({ error: FORBIDDEN }, { status: 403 });
    }

    const isOwnInvite = profile.user_id === user.id;
    // A profile with no auth user yet was pre-created by the manager without
    // sending an email; the team link is what authorises claiming it.
    const isUnclaimed = profile.user_id === null;
    if (!isOwnInvite && !(isUnclaimed && (hasTeamLink || !!existingRole))) {
      return NextResponse.json({ error: FORBIDDEN }, { status: 403 });
    }

    const { data: claimed, error: patchErr } = await service
      .from('staff_profiles')
      .update({
        user_id: user.id,
        avatar_url: avatarUrl ?? null,
        is_active: true,
        onboarding_status: 'not_started',
        ...(fullName?.trim() ? { full_name: fullName.trim() } : {}),
      })
      .eq('id', selectedProfileId)
      .eq('establishment_id', establishmentId)
      // Still filtered on is_active so two people racing for the same invite
      // cannot both win: the second UPDATE matches 0 rows.
      .eq('is_active', false)
      .is('deleted_at', null)
      .select('id');

    if (patchErr) {
      // 23505 = unique (user_id, establishment_id) — this user already has a
      // profile in this establishment.
      if ((patchErr as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'Vous faites déjà partie de cet établissement.' }, { status: 409 });
      }
      return NextResponse.json({ error: patchErr.message }, { status: 500 });
    }
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: 'Profil introuvable ou déjà réclamé.' }, { status: 409 });
    }
  } else {
    // Creating a brand new profile. Nothing in the database vouches for this
    // caller, so the signed team link is the only thing that can.
    if (!hasTeamLink && !existingRole) {
      return NextResponse.json({ error: FORBIDDEN }, { status: 403 });
    }

    if (!fullName?.trim()) return NextResponse.json({ error: 'Missing fullName' }, { status: 400 });

    const { data: existing } = await service
      .from('staff_profiles')
      .select('id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) return NextResponse.json({ error: 'Profile already exists' }, { status: 409 });

    const { data: newProfile, error: insertErr } = await service
      .from('staff_profiles')
      .insert({
        user_id: user.id,
        establishment_id: establishmentId,
        full_name: fullName.trim(),
        avatar_url: avatarUrl ?? null,
        onboarding_status: 'not_started',
        is_active: true,
      })
      .select('id')
      .single();

    if (insertErr || !newProfile) {
      // 23505 = unique (user_id, establishment_id) — concurrent double-submit.
      if (insertErr && (insertErr as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'Profil déjà créé.' }, { status: 409 });
      }
      return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 });
    }
  }

  // Ensure staff role exists
  if (!existingRole) {
    await service.from('user_roles').insert({
      user_id: user.id,
      role: 'staff',
      establishment_id: establishmentId,
    });
  }

  return NextResponse.json({ ok: true });
}
