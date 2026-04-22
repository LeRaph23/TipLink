import { createClient } from '@/lib/supabase/server';
import { StickerManager } from '@/components/dashboard/StickerManager';

export default async function StickersPage() {
  const supabase = await createClient();

  const [{ data: stickers }, { data: staffMembers }] = await Promise.all([
    supabase
      .from('nfc_stickers')
      .select(`
        id,
        short_id,
        created_at,
        updated_at,
        staff_profiles (id, full_name),
        establishments (id, name)
      `)
      .order('created_at', { ascending: false }),

    supabase
      .from('staff_profiles')
      .select('id, full_name, establishment_id')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('full_name'),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">NFC Stickers</h1>
        <p className="text-muted-foreground mt-1">
          Manage and assign NFC stickers to staff members.
        </p>
      </div>
      <StickerManager
        stickers={stickers ?? []}
        staffMembers={staffMembers ?? []}
      />
    </div>
  );
}
