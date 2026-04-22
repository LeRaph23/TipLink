import { createClient } from '@/lib/supabase/server';

export default async function EstablishmentsPage() {
  const supabase = await createClient();

  const { data: establishments } = await supabase
    .from('establishments')
    .select(`
      id, name, business_type, slug, country, currency,
      onboarding_status, deleted_at,
      groups (name)
    `)
    .is('deleted_at', null)
    .order('name');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Establishments</h1>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Group</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">Currency</th>
              <th className="text-left px-4 py-3 font-medium">Stripe</th>
            </tr>
          </thead>
          <tbody>
            {establishments?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No establishments found.
                </td>
              </tr>
            )}
            {establishments?.map((e) => {
              const group = Array.isArray(e.groups) ? e.groups[0] : e.groups;
              return (
                <tr key={e.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{e.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{group?.name ?? '—'}</td>
                  <td className="px-4 py-3 capitalize">{e.business_type}</td>
                  <td className="px-4 py-3 uppercase font-mono">{e.currency}</td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                        e.onboarding_status === 'complete' ? 'bg-green-100 text-green-700' :
                        'bg-muted text-muted-foreground',
                      ].join(' ')}
                    >
                      {e.onboarding_status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
