import { createClient } from '@/lib/supabase/server';

export default async function GroupsPage() {
  const supabase = await createClient();

  const { data: groups } = await supabase
    .from('groups')
    .select('id, name, logo_url, settings, created_at')
    .is('deleted_at', null)
    .order('name');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Groups</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {groups?.length === 0 && (
          <p className="text-muted-foreground">No groups found.</p>
        )}
        {groups?.map((g) => (
          <div key={g.id} className="rounded-xl border p-4 space-y-2">
            <div className="flex items-center gap-3">
              {g.logo_url && (
                <img src={g.logo_url} alt={g.name} className="w-10 h-10 rounded object-cover" />
              )}
              <h2 className="font-semibold">{g.name}</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Created {new Date(g.created_at).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
