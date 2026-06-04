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
// { invited: false } on any failure — the staff profile still exists and the
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
): Promise<{ invited: boolean }> {
  const { staffProfileId, fullName, email, establishmentId, establishmentName, role, locale } = params;
  const base = getBaseUrl();
  const nextPath = `/join/${establishmentId}`;

  // generateLink is not in the generated Supabase types — cast minimally.
  const adminClient = service as unknown as {
    auth: {
      admin: {
        generateLink: (p: {
          type: 'invite';
          email: string;
          options?: { redirectTo?: string; data?: Record<string, unknown> };
        }) => Promise<{
          data: { user: { id: string } | null; properties: { hashed_token: string } | null } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };

  try {
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo: `${base}/auth/callback?next=${encodeURIComponent(nextPath)}&locale=${locale}`,
        data: {
          full_name: fullName,
          staff_profile_id: staffProfileId,
          establishment_id: establishmentId,
          pending_role: role,
        },
      },
    });

    const userId = linkData?.user?.id ?? null;
    const hashedToken = linkData?.properties?.hashed_token ?? null;
    if (linkErr || !userId) return { invited: false };

    // Link the auth user to the profile and pre-create their role so
    // onboarding works the moment they accept the invite.
    await service.from('staff_profiles').update({ user_id: userId }).eq('id', staffProfileId);
    await service.from('user_roles').insert({
      user_id: userId,
      role,
      establishment_id: role === 'manager' ? establishmentId : null,
    });

    if (!hashedToken) return { invited: false };
    // Point at the interstitial page (not /auth/callback directly): email
    // security scanners pre-fetch links with a GET, which would consume this
    // one-time token before the invitee clicks. The interstitial only verifies
    // on a form POST. See app/[locale]/auth/accept/page.tsx.
    const qs = new URLSearchParams({ token_hash: hashedToken, type: 'invite', next: nextPath, locale });
    const { ok } = await sendStaffInviteEmail({
      to: email,
      fullName,
      establishmentName,
      inviteUrl: `${base}/${locale}/auth/accept?${qs.toString()}`,
      locale,
    });
    return { invited: ok };
  } catch {
    return { invited: false };
  }
}
