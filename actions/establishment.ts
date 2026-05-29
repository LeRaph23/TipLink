'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { getManageScope, canManageGroup } from '@/lib/auth/ownership';
import { makeUniqueEstablishmentSlug } from '@/lib/establishment-slug';

const EstSchema = z.object({
  name: z.string().min(1).max(200),
  business_type: z.enum(['restaurant', 'beauty']),
  country: z.string().length(2),
  currency: z.string().length(3),
});

export async function createEstablishment(
  input: z.infer<typeof EstSchema>
): Promise<{ id: string } | { error: string }> {
  const scope = await getManageScope();
  if (!scope) return { error: 'Unauthorized' };

  // The new establishment is created under a group the caller administers.
  const groupId = scope.groupIds[0];
  if (!groupId) return { error: 'Unauthorized' };

  const parsed = EstSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const { name, business_type, country, currency } = parsed.data;

  const service = createServiceClient();
  const slug = await makeUniqueEstablishmentSlug(service, name);
  const { data, error } = await service
    .from('establishments')
    .insert({
      group_id: groupId,
      name,
      business_type,
      slug,
      country: country.toUpperCase(),
      currency: currency.toLowerCase(),
      onboarding_status: 'not_started',
    })
    .select('id')
    .single();

  if (error) return { error: error.message };

  revalidatePath('/dashboard/establishments');
  return { id: data.id };
}

export async function updateEstablishment(
  estId: string,
  input: Partial<z.infer<typeof EstSchema>>
): Promise<{ success: true } | { error: string }> {
  const scope = await getManageScope();
  if (!scope) return { error: 'Unauthorized' };

  const service = createServiceClient();

  const { data: est } = await service
    .from('establishments')
    .select('group_id')
    .eq('id', estId)
    .is('deleted_at', null)
    .single();

  // Service client bypasses RLS — ownership must be checked here.
  if (!est || !canManageGroup(scope, est.group_id)) return { error: 'Not found' };

  if (Object.keys(input).length === 0) return { success: true };

  const slug = input.name
    ? await makeUniqueEstablishmentSlug(service, input.name, estId)
    : undefined;

  const { error } = await service
    .from('establishments')
    .update({
      ...(input.name ? { name: input.name, slug } : {}),
      ...(input.business_type ? { business_type: input.business_type } : {}),
      ...(input.country ? { country: input.country.toUpperCase() } : {}),
      ...(input.currency ? { currency: input.currency.toLowerCase() } : {}),
    })
    .eq('id', estId);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/establishments');
  return { success: true };
}

export async function deleteEstablishment(
  estId: string
): Promise<{ success: true } | { error: string }> {
  const scope = await getManageScope();
  if (!scope) return { error: 'Unauthorized' };

  const service = createServiceClient();

  const { data: est } = await service
    .from('establishments')
    .select('group_id')
    .eq('id', estId)
    .is('deleted_at', null)
    .single();

  // Service client bypasses RLS — ownership must be checked here.
  if (!est || !canManageGroup(scope, est.group_id)) return { error: 'Not found' };

  const { error } = await service
    .from('establishments')
    .update({ deleted_at: new Date().toISOString(), slug: `__deleted__${estId}` } as never)
    .eq('id', estId);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/establishments');
  return { success: true };
}
