import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { establishmentId?: string; fullName?: string };
  const { establishmentId, fullName } = body;

  if (!establishmentId || !fullName?.trim()) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: est } = await service
    .from('establishments')
    .select('id, group_id')
    .eq('id', establishmentId)
    .is('deleted_at', null)
    .single();

  if (!est) return NextResponse.json({ error: 'Establishment not found' }, { status: 404 });

  const { data: existing } = await service
    .from('staff_profiles')
    .select('id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'Profile already exists' }, { status: 409 });
  }

  const { error } = await service
    .from('staff_profiles')
    .insert({
      user_id: user.id,
      establishment_id: establishmentId,
      full_name: fullName.trim(),
      onboarding_status: 'not_started',
      is_active: true,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
