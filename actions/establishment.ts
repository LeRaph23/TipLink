'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

const EstSchema = z.object({
  name: z.string().min(1).max(200),
  business_type: z.enum(['restaurant', 'beauty']),
  country: z.string().length(2),
  currency: z.string().length(3),
});

async function resolveGroupId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('user_roles')
    .select('group_id')
    .in('role', ['group_admin', 'super_admin'])
    .eq('user_id', user.id)
    .not('group_id', 'is', null)
    .limit(1)
    .maybeSingle();

  return data?.group_id ?? null;
}

export async function createEstablishment(
  input: z.infer<typeof EstSchema>
): Promise<{ id: string } | { error: string }> {
  const groupId = await resolveGroupId();
  if (!groupId) return { error: 'Unauthorized' };

  const parsed = EstSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const { name, business_type, country, currency } = parsed.data;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const service = createServiceClient();
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
  const groupId = await resolveGroupId();
  if (!groupId) return { error: 'Unauthorized' };

  const service = createServiceClient();

  const { data: est } = await service
    .from('establishments')
    .select('group_id')
    .eq('id', estId)
    .is('deleted_at', null)
    .single();

  if (!est || est.group_id !== groupId) return { error: 'Not found' };

  if (Object.keys(input).length === 0) return { success: true };

  const { error } = await service
    .from('establishments')
    .update({
      ...(input.name ? { name: input.name, slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') } : {}),
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
  const groupId = await resolveGroupId();
  if (!groupId) return { error: 'Unauthorized' };

  const service = createServiceClient();

  const { data: est } = await service
    .from('establishments')
    .select('group_id')
    .eq('id', estId)
    .is('deleted_at', null)
    .single();

  if (!est || est.group_id !== groupId) return { error: 'Not found' };

  const { error } = await service
    .from('establishments')
    .update({ deleted_at: new Date().toISOString(), slug: null } as never)
    .eq('id', estId);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/establishments');
  return { success: true };
}
