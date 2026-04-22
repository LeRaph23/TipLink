import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function StaffListPage() {
  const supabase = await createClient();

  const { data: staffMembers } = await supabase
    .from('staff_profiles')
    .select(`
      id,
      full_name,
      avatar_url,
      is_active,
      onboarding_status,
      stripe_account_id,
      establishments (name)
    `)
    .is('deleted_at', null)
    .order('full_name');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Staff</h1>
        <Link
          href="/dashboard/staff/new"
          className="px-4 py-2 rounded-xl bg-foreground text-background text-sm font-medium"
        >
          Add staff member
        </Link>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Establishment</th>
              <th className="text-left px-4 py-3 font-medium">Payout</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {staffMembers?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No staff members yet.
                </td>
              </tr>
            )}
            {staffMembers?.map((s) => {
              const est = Array.isArray(s.establishments) ? s.establishments[0] : s.establishments;
              return (
                <tr key={s.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{s.full_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{est?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                        s.onboarding_status === 'complete' ? 'bg-green-100 text-green-700' :
                        s.onboarding_status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        'bg-muted text-muted-foreground',
                      ].join(' ')}
                    >
                      {s.onboarding_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        'inline-flex px-2 py-0.5 rounded-full text-xs',
                        s.is_active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground',
                      ].join(' ')}
                    >
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/staff/${s.id}`}
                      className="text-muted-foreground hover:text-foreground text-xs underline"
                    >
                      View
                    </Link>
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
