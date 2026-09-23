import { test, expect } from '@playwright/test';
import { admin, createUser, login, seed } from './helpers';

// The /join/<establishmentId> link is not secret: the same id is on the public
// tip page a customer reaches by scanning a tag. A profile created by an email
// invite must therefore stay reserved to the invited account.

test('an invited profile cannot be claimed by someone else, nor its email read', async ({ page }) => {
  const { establishment_id } = seed();
  const stamp = Date.now();
  const victimEmail = `victime.${stamp}@exemple.fr`;
  const attackerEmail = `intrus.${stamp}@exemple.fr`;

  const victimId = await createUser(victimEmail);
  await createUser(attackerEmail);
  const [profile] = await admin<{ id: string }[]>('/rest/v1/staff_profiles', {
    method: 'POST',
    body: {
      establishment_id,
      user_id: victimId,
      full_name: `Victime ${stamp}`,
      is_active: false,
      onboarding_status: 'not_started',
    },
  });

  // Anyone can open the join page: the invitee's address must not be on it.
  await page.goto(`/fr/join/${establishment_id}`);
  expect(await page.content()).not.toContain(victimEmail);

  // Signed in with their own address, the intruder tries to take the profile.
  await login(page, attackerEmail);
  const res = await page.request.post('/api/staff/join', {
    data: { establishmentId: establishment_id, selectedProfileId: profile.id, fullName: 'Intrus' },
  });
  expect(res.status()).toBe(403);

  const [after] = await admin<{ user_id: string; is_active: boolean }[]>(
    `/rest/v1/staff_profiles?id=eq.${profile.id}&select=user_id,is_active`
  );
  expect(after).toEqual({ user_id: victimId, is_active: false });
});
