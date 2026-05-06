import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    establishmentId?: string;
    fullName?: string;
    selectedProfileId?: string | null;
    avatarUrl?: string | null;
  };
  const { establishmentId, fullName, selectedProfileId, avatarUrl } = body;

  if (!establishmentId) {
    return NextResponse.json({ error: 'Missing establishmentId' }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: est } = await service
    .from('establishments')
    .select('id, group_id')
    .eq('id', establishmentId)
    .is('deleted_at', null)
    .single();

  if (!est) return NextResponse.json({ error: 'Establishment not found' }, { status: 404 });

  // If claiming an existing unclaimed profile
  if (selectedProfileId) {
    const { data: profile } = await service
      .from('staff_profiles')
      .select('id, establishment_id')
      .eq('id', selectedProfileId)
      .eq('establishment_id', establishmentId)
      .is('user_id', null)
      .is('deleted_at', null)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profil introuvable ou déjà réclamé.' }, { status: 404 });
    }

    const { error: patchErr } = await service
      .from('staff_profiles')
      .update({
        user_id: user.id,
        avatar_url: avatarUrl ?? null,
        is_active: true,
      })
      .eq('id', selectedProfileId);

    if (patchErr) return NextResponse.json({ error: patchErr.message }, { status: 500 });

    // Ensure staff role exists
    const { data: existingRole } = await service
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .eq('establishment_id', establishmentId)
      .maybeSingle();

    if (!existingRole) {
      await service.from('user_roles').insert({
        user_id: user.id,
        role: 'staff',
        establishment_id: establishmentId,
      });
    }

    return NextResponse.json({ ok: true });
  }

  // Creating a new profile (original flow)
  if (!fullName?.trim()) {
    return NextResponse.json({ error: 'Missing fullName' }, { status: 400 });
  }

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
      avatar_url: avatarUrl ?? null,
      onboarding_status: 'not_started',
      is_active: true,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Ensure staff role exists
  const { data: existingRole } = await service
    .from('user_roles')
    .select('id')
    .eq('user_id', user.id)
    .eq('establishment_id', establishmentId)
    .maybeSingle();

  if (!existingRole) {
    await service.from('user_roles').insert({
      user_id: user.id,
      role: 'staff',
      establishment_id: establishmentId,
    });
  }

  return NextResponse.json({ ok: true });
}
