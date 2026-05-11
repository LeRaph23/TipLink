import { setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createServiceClient } from '@/lib/supabase/service';
import { AmbassadeursManager } from './AmbassadeursManager';

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: 14,
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
    </div>
  );
}

export default async function AdminAmbassadeursPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin(locale);

  const service = createServiceClient();

  // Fetch ambassadors with their promo code info
  const { data: ambassadors } = await service
    .from('ambassadors')
    .select('id, name, is_active, created_at, promo_codes(id, code, percentage_off)')
    .order('created_at', { ascending: false });

  // Aggregate sales per ambassador
  const { data: salesRows } = await service
    .from('ambassador_sales')
    .select('ambassador_id, commission_amount');

  const salesByAmbassador: Record<string, { count: number; totalCommission: number }> = {};
  for (const s of salesRows ?? []) {
    if (!salesByAmbassador[s.ambassador_id]) {
      salesByAmbassador[s.ambassador_id] = { count: 0, totalCommission: 0 };
    }
    salesByAmbassador[s.ambassador_id].count += 1;
    salesByAmbassador[s.ambassador_id].totalCommission += s.commission_amount;
  }

  // Fetch active promo codes not yet linked to an ambassador (for the create form)
  const linkedPromoCodeIds = (ambassadors ?? [])
    .map((a) => {
      const pc = a.promo_codes as { id: string } | null;
      return pc?.id;
    })
    .filter(Boolean) as string[];

  const promoQuery = service
    .from('promo_codes')
    .select('id, code, percentage_off')
    .eq('is_active', true)
    .order('code');

  const { data: allPromoCodes } = linkedPromoCodeIds.length > 0
    ? await promoQuery.not('id', 'in', `(${linkedPromoCodeIds.join(',')})`)
    : await promoQuery;

  const totalSales = (salesRows ?? []).length;
  const totalCommission = (salesRows ?? []).reduce((s, r) => s + r.commission_amount, 0);
  const activeCount = (ambassadors ?? []).filter(a => a.is_active).length;

  const ambassadorsWithStats = (ambassadors ?? []).map((a) => {
    const pc = a.promo_codes as { id: string; code: string; percentage_off: number } | null;
    const stats = salesByAmbassador[a.id] ?? { count: 0, totalCommission: 0 };
    return {
      id: a.id,
      name: a.name,
      is_active: a.is_active,
      created_at: a.created_at,
      promoCodeId: pc?.id ?? '',
      promoCode: pc?.code ?? '',
      percentageOff: pc?.percentage_off ?? 0,
      salesCount: stats.count,
      totalCommission: stats.totalCommission,
    };
  });

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          Ambassadeurs
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
          Gérez les étudiants apporteurs d&apos;affaires et leurs commissions.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
        <StatCard label="Ambassadeurs actifs" value={String(activeCount)} />
        <StatCard label="Ventes totales" value={String(totalSales)} />
        <StatCard label="Commissions dues" value={`${(totalCommission / 100).toFixed(0)} €`} />
      </div>

      <AmbassadeursManager
        ambassadors={ambassadorsWithStats}
        availablePromoCodes={allPromoCodes ?? []}
      />
    </div>
  );
}
