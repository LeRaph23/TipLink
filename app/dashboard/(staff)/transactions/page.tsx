import { createClient } from '@/lib/supabase/server';

export default async function StaffTransactionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: staffProfile } = await supabase
    .from('staff_profiles')
    .select('id, currency:establishments(currency)')
    .eq('user_id', user!.id)
    .is('deleted_at', null)
    .single();

  const staffId = staffProfile?.id;

  const { data: transactions } = await supabase
    .from('transactions')
    .select('id, amount, currency, status, created_at, metadata')
    .eq('staff_id', staffId ?? '')
    .order('created_at', { ascending: false })
    .limit(100);

  const currency = transactions?.[0]?.currency ?? 'EUR';
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });

  const total = transactions
    ?.filter((t) => t.status === 'succeeded')
    .reduce((sum, t) => sum + t.amount, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-muted-foreground mt-1">
          Total received: <span className="font-semibold text-foreground">{formatter.format(total / 100)}</span>
        </p>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Amount</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions?.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  No transactions yet.
                </td>
              </tr>
            )}
            {transactions?.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 font-medium">{formatter.format(t.amount / 100)}</td>
                <td className="px-4 py-3">
                  <span
                    className={[
                      'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                      t.status === 'succeeded' ? 'bg-green-100 text-green-700' :
                      t.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700',
                    ].join(' ')}
                  >
                    {t.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
