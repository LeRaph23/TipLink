import { createServiceClient } from '@/lib/supabase/service';
import { sendStaffInviteEmail } from '@/lib/email';
import { getBaseUrl } from '@/lib/env';

type ServiceClient = ReturnType<typeof createServiceClient>;

// Generates a Supabase invite link for an already-created staff profile,
// links the new auth user to it, pre-creates the role, and emails the invite.
//
// Uses the service role only, so it works WITHOUT a logged-in session — the
// caller owns authorization (the dashboard action checks the session via RLS;
// the onboarding flow has just created the group + the admin's role).
//
// We generate the link ourselves (rather than Supabase's `inviteUserByEmail`)
// and email the `token_hash` to our own `/[locale]/auth/accept` interstitial,
// which POSTs to `/auth/callback` to verify it server-side and redirect to
// `/join/[establishmentId]` with the email pre-filled. The interstitial keeps
// email security scanners (which pre-fetch links with a GET) from consuming the
// one-time token before the invitee clicks. Best-effort: returns
// `linked`: the email is now attached to the profile (an account exists),
// whether or not the invitation email left. { invited: false } on any failure — the staff profile still exists and the
// admin can resend later.
export async function sendStaffInviteLink(
  service: ServiceClient,
  params: {
    staffProfileId: string;
    fullName: string;
    email: string;
    establishmentId: string;
    establishmentName: string;
    role: 'staff' | 'manager';
    locale: 'fr' | 'en';
  },
): Promise<{ invited: boolean; linked: boolean }> {
  const { staffProfileId, fullName, email, establishmentId, establishmentName, role, locale } = params;
  const base = getBaseUrl();
  const nextPath = `/join/${establishmentId}`;

  // generateLink is not in the generated Supabase types — cast minimally.
  const adminClient = service as unknown as {
    auth: {
      admin: {
        generateLink: (p: {
          type: 'invite' | 'magiclink';
          email: string;
          options?: { redirectTo?: string; data?: Record<string, unknown> };
        }) => Promise<{
          data: { user: { id: string } | null; properties: { hashed_token: string } | null } | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
  };

  const redirectTo = `${base}/auth/callback?next=${encodeURIComponent(nextPath)}&locale=${locale}`;

  try {
    let linkType: 'invite' | 'magiclink' = 'invite';
    let { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo,
        data: {
          full_name: fullName,
          staff_profile_id: staffProfileId,
          establishment_id: establishmentId,
          pending_role: role,
        },
      },
    });

    // The address already has an account: a colleague who scanned the tag and
    // signed up before being invited, or someone working in two salons. An
    // invite link can only create users, so this used to end the invitation
    // right here, with the manager told it had been sent. A magic link signs
    // the existing account in and lands it on the same join page.
    const exists = isEmailExists(linkErr);
    if (exists) {
      linkType = 'magiclink';
      ({ data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo },
      }));
    }

    const userId = linkData?.user?.id ?? null;
    const hashedToken = linkData?.properties?.hashed_token ?? null;
    if (linkErr || !userId) return { invited: false, linked: false };

    // Link the auth user to the profile: that link is what lets them claim it
    // on the join page (POST /api/staff/join, "isOwnInvite"). Fails on 23505
    // when this account already has a profile in the establishment.
    const { error: profileErr } = await service
      .from('staff_profiles')
      .update({ user_id: userId })
      .eq('id', staffProfileId);
    if (profileErr) return { invited: false, linked: false };

    // Pre-create the role for a brand-new account so onboarding works the
    // moment they accept. An existing account only gets it when it joins:
    // typing someone's address must not grant their account a role in a salon
    // they never agreed to work for. Both staff and manager roles carry the
    // establishment (user_roles_scope_check).
    if (!exists) {
      await service.from('user_roles').insert({
        user_id: userId,
        role,
        establishment_id: establishmentId,
      });
    }

    if (!hashedToken) return { invited: false, linked: true };
    // Point at the interstitial page (not /auth/callback directly): email
    // security scanners pre-fetch links with a GET, which would consume this
    // one-time token before the invitee clicks. The interstitial only verifies
    // on a form POST. See app/[locale]/auth/accept/page.tsx.
    // verifyOtp takes 'email' for a magic link's token_hash ('magiclink' is
    // its deprecated alias).
    const verifyType = linkType === 'magiclink' ? 'email' : 'invite';
    const qs = new URLSearchParams({ token_hash: hashedToken, type: verifyType, next: nextPath, locale });
    const { ok } = await sendStaffInviteEmail({
      to: email,
      fullName,
      establishmentName,
      inviteUrl: `${base}/${locale}/auth/accept?${qs.toString()}`,
      locale,
    });
    return { invited: ok, linked: true };
  } catch {
    return { invited: false, linked: false };
  }
}

function isEmailExists(err: { message: string; code?: string } | null): boolean {
  if (!err) return false;
  return err.code === 'email_exists' || /already been registered/i.test(err.message);
}
