-- Revocable "join my team" links.
--
-- POST /api/staff/join used to accept any establishment id from the request
-- body, so any signed-in account could insert itself as active staff in any
-- establishment: onto that salon's public tip page, into its payroll export,
-- and into the equal split every group tip is divided by. The establishment id
-- is not a secret either, since it is the href of the "see the team" link on
-- the page every NFC scan lands on.
--
-- Joining now requires either an invitation the manager actually sent (those
-- already pre-link staff_profiles.user_id, see lib/staff-invite.ts) or a signed
-- team-join token. This column is what lets a manager revoke the latter: the
-- version is signed into the token and re-checked on use, so bumping it makes
-- every link printed from the old QR stop working immediately.
--
-- Starts at 1 rather than 0 so that "never rotated" and "rotated once" are
-- distinguishable from the value alone.

ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS team_join_version integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.establishments.team_join_version IS
  'Signed into team-join tokens. Incremented to revoke every outstanding link.';
