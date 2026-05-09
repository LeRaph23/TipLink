import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { PromoCodesManager } from './PromoCodesManager';

export default async function AdminPromoCodesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();

  const { data: promoCodes } = await supabase
    .from('promo_codes')
    .select('id, code, percentage_off, max_redemptions, times_redeemed, expires_at, is_active, created_at')
    .order('created_at', { ascending: false });

  // Fetch recent orders that used a promo code to show stats
  const { data: promoOrders } = await supabase
    .from('smarttag_orders')
    .select('id, promo_code, discount_amount, created_at, groups(name)')
    .not('promo_code', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  const totalSaved = (promoOrders ?? []).reduce((sum, o) => sum + (o.discount_amount ?? 0), 0);

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          Codes promo
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
          Créez et gérez les codes promotionnels appliqués lors du paiement.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
        <StatCard label="Codes créés" value={String(promoCodes?.length ?? 0)} />
        <StatCard label="Codes actifs" value={String((promoCodes ?? []).filter(p => p.is_active).length)} />
        <StatCard label="Commandes avec promo" value={String(promoOrders?.length ?? 0)} />
        <StatCard label="Total remises accordées" value={`${(totalSaved / 100).toFixed(2)} €`} />
      </div>

      <PromoCodesManager initialCodes={promoCodes ?? []} />

      {/* Recent promo usage */}
      {promoOrders && promoOrders.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
            Dernières commandes avec code promo
          </h2>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Groupe', 'Code utilisé', 'Remise', 'Date'].map((h, i) => (
                    <th key={i} style={{
                      padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
                      textTransform: 'uppercase', letterSpacing: '0.07em',
                      borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {promoOrders.map((o) => {
                  const group = o.groups as { name: string } | null;
                  return (
                    <tr key={o.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '10px 14px', color: 'var(--text)', fontWeight: 500 }}>{group?.name ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono, monospace)', color: 'var(--accent)' }}>{o.promo_code}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--success)', fontWeight: 600 }}>
                        {o.discount_amount > 0 ? `-${(o.discount_amount / 100).toFixed(2)} €` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-3)' }}>
                        {new Date(o.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

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
