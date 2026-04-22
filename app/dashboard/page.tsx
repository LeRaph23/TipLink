import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user!.id);

  const { data: staffProfile } = await supabase
    .from('staff_profiles')
    .select('id, full_name, onboarding_status, stripe_account_id')
    .eq('user_id', user!.id)
    .is('deleted_at', null)
    .single();

  const { data: recentTransactions } = await supabase
    .from('transactions')
    .select('id, amount, currency, created_at, status')
    .eq('staff_id', staffProfile?.id ?? '')
    .order('created_at', { ascending: false })
    .limit(5);

  const totalEarnings =
    recentTransactions
      ?.filter((t) => t.status === 'succeeded')
      .reduce((sum, t) => sum + t.amount, 0) ?? 0;

  const currency = recentTransactions?.[0]?.currency ?? 'EUR';

  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">
          Welcome, {staffProfile?.full_name ?? user!.email}
        </h1>
        <p className="text-muted-foreground mt-1">
          {roles?.map((r) => r.role).join(', ')}
        </p>
      </div>

      {/* Payout setup banner */}
      {staffProfile && staffProfile.onboarding_status !== 'complete' && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-amber-800 text-sm font-medium">
            Set up your payout account to start receiving tips.
          </p>
          <Link
            href="/dashboard/onboarding"
            className="mt-2 inline-block text-sm underline text-amber-900"
          >
            Complete setup →
          </Link>
        </div>
      )}

      {/* Earnings summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border p-6">
          <p className="text-sm text-muted-foreground">Recent tips (last 5)</p>
          <p className="text-3xl font-bold mt-2">{formatter.format(totalEarnings / 100)}</p>
        </div>
        <div className="rounded-xl border p-6">
          <p className="text-sm text-muted-foreground">Transactions</p>
          <p className="text-3xl font-bold mt-2">{recentTransactions?.length ?? 0}</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Link
          href="/dashboard/transactions"
          className="p-4 rounded-xl border hover:border-foreground/50 transition-colors text-sm font-medium"
        >
          View all transactions →
        </Link>
        <Link
          href="/dashboard/onboarding"
          className="p-4 rounded-xl border hover:border-foreground/50 transition-colors text-sm font-medium"
        >
          Payout settings →
        </Link>
      </div>
    </div>
  );
}
