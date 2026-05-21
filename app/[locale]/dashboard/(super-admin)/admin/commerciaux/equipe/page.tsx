import { setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createServiceClient } from '@/lib/supabase/service';
import { CommerciauxOverview, type CommercialRow } from '../CommerciauxOverview';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CommerciauxEquipePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin(locale);

  const service = createServiceClient();

  const [{ data: comRows }, { data: salesRows }] = await Promise.all([
    service
      .from('commerciaux')
      .select('id, name, company_name, legal_form, vrp_status, city, email, onboarding_status, is_active, payouts_frozen, created_at, promo_codes(code)')
      .order('created_at', { ascending: false }),
    service
      .from('commercial_sales')
      .select('commercial_id, commission_amount')
      .is('voided_at', null),
  ]);

  const statsById = new Map<string, { count: number; total: number }>();
  for (const s of salesRows ?? []) {
    const cur = statsById.get(s.commercial_id) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += s.commission_amount;
    statsById.set(s.commercial_id, cur);
  }

  const commerciaux: CommercialRow[] = (comRows ?? []).map((c) => {
    const promoCode = c.promo_codes as { code?: string } | { code?: string }[] | null;
    const code = Array.isArray(promoCode) ? promoCode[0]?.code : promoCode?.code;
    const stats = statsById.get(c.id) ?? { count: 0, total: 0 };
    return {
      id: c.id,
      name: c.name,
      company_name: c.company_name,
      legal_form: c.legal_form,
      vrp_status: c.vrp_status,
      city: c.city,
      email: c.email,
      promo_code: code ?? null,
      onboarding_status: c.onboarding_status,
      is_active: c.is_active,
      payouts_frozen: c.payouts_frozen,
      sales_count: stats.count,
      sales_commission_cents: stats.total,
      created_at: c.created_at,
    };
  });

  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
        Équipe commerciale active
      </h2>
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 16, marginTop: 0 }}>
        Liste complète des commerciaux du programme avec leur volume de ventes et commissions cumulées.
      </p>
      <CommerciauxOverview commerciaux={commerciaux} />
    </div>
  );
}
