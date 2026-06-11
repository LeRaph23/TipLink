import { setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createServiceClient } from '@/lib/supabase/service';
import { Link } from '@/i18n/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmtEUR(cents: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${accent ? 'var(--accent)' : 'var(--border-subtle)'}`,
      borderRadius: 'var(--radius)', padding: 20,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600,
        color: accent ? 'var(--accent)' : 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10,
      }}>{label}</div>
      <div style={{
        fontSize: 28, fontWeight: 800,
        color: accent ? 'var(--accent)' : 'var(--text)',
        letterSpacing: '-0.04em', lineHeight: 1,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>{sub}</div>}
    </div>
  );
}

export default async function CommerciauxPilotagePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { supabase: userClient } = await requireSuperAdmin(locale);

  const service = createServiceClient();

  type CommercialSummaryRow = {
    sales_count: number; solo_count: number; duo_count: number;
    total_commissions: number; commissions_30d: number;
    sales_30d_count: number; paid_total: number;
  };
  // Server-side aggregation (migration 00069) — replaces two full-table scans.
  // Called on the user-scoped client so the SECURITY DEFINER is_super_admin()
  // guard sees the authenticated caller. Cast because the RPC isn't in the
  // generated DB types yet (same pattern as the webhook's promo RPC).
  const callSummary = userClient.rpc as unknown as (
    fn: 'commercial_pilotage_summary',
  ) => Promise<{ data: CommercialSummaryRow[] | null }>;

  const [
    { count: activeCount },
    { count: pendingApps },
    { count: payoutPaidCount },
    { data: summaryRows },
  ] = await Promise.all([
    service.from('commerciaux').select('id', { count: 'exact', head: true }).eq('is_active', true),
    service.from('commercial_recruitment_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    service.from('commercial_payouts').select('id', { count: 'exact', head: true }).eq('status', 'paid'),
    // PostgREST resolves (not rejects) with data:null when the function is
    // missing, so the fallback below triggers without a try/catch here.
    callSummary('commercial_pilotage_summary'),
  ]);

  // Prefer the server-side aggregate; fall back to a client-side sum if the RPC
  // is unavailable (e.g. a deploy landing before db:migrate) so the page never
  // breaks — only its query cost regresses to the old full-table read.
  const summary = summaryRows?.[0];

  let salesCount: number, soloCount: number, duoCount: number;
  let totalCommissions: number, commissions30: number, sales30Count: number, paidTotal: number;

  if (summary) {
    salesCount = Number(summary.sales_count);
    soloCount = Number(summary.solo_count);
    duoCount = Number(summary.duo_count);
    totalCommissions = Number(summary.total_commissions);
    commissions30 = Number(summary.commissions_30d);
    sales30Count = Number(summary.sales_30d_count);
    paidTotal = Number(summary.paid_total);
  } else {
    const [{ data: salesRows }, { data: payoutSums }] = await Promise.all([
      service.from('commercial_sales').select('commission_amount, created_at, pack').is('voided_at', null),
      service.from('commercial_payouts').select('amount_cents, status'),
    ]);
    const sales = salesRows ?? [];
    salesCount = sales.length;
    soloCount = sales.filter(s => s.pack === 'solo').length;
    duoCount = sales.filter(s => s.pack === 'duo').length;
    totalCommissions = sales.reduce((sum, s) => sum + s.commission_amount, 0);
    const thirtyDaysAgo = new Date().getTime() - 30 * 86400000;
    const last30 = sales.filter(s => new Date(s.created_at).getTime() > thirtyDaysAgo);
    sales30Count = last30.length;
    commissions30 = last30.reduce((sum, s) => sum + s.commission_amount, 0);
    paidTotal = (payoutSums ?? []).filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount_cents, 0);
  }

  const owed = totalCommissions - paidTotal; // approx — paid vs commissions cumulées

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
          Indicateurs clés
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
        }}>
          <Kpi
            label="Candidatures en attente"
            value={String(pendingApps ?? 0)}
            accent={(pendingApps ?? 0) > 0}
            sub={(pendingApps ?? 0) > 0 ? 'À traiter sous 48 h' : undefined}
          />
          <Kpi label="Commerciaux actifs" value={String(activeCount ?? 0)} />
          <Kpi label="Ventes cumulées" value={String(salesCount)} sub={`${soloCount} solo · ${duoCount} duo`} />
          <Kpi label="Commissions 30 j" value={fmtEUR(commissions30)} sub={`${sales30Count} ventes`} />
          <Kpi label="Commissions totales" value={fmtEUR(totalCommissions)} />
          <Kpi label="Versements payés" value={String(payoutPaidCount ?? 0)} sub={`${fmtEUR(paidTotal)} versés`} />
          <Kpi label="Solde à reverser" value={fmtEUR(Math.max(0, owed))} sub="Commissions − versements payés" />
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
          Raccourcis
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          <Link href="/dashboard/admin/commerciaux/recrutement" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius)', padding: '14px 16px',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Recrutement →</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {(pendingApps ?? 0) > 0 ? `${pendingApps} candidature(s) en attente` : 'Aucune candidature en attente'}
              </div>
            </div>
          </Link>
          <Link href="/dashboard/admin/commerciaux/equipe" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius)', padding: '14px 16px',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Équipe →</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Liste des {activeCount ?? 0} commerciaux actifs
              </div>
            </div>
          </Link>
          <Link href="/devenir-commercial-pro" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius)', padding: '14px 16px',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Landing publique →</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Voir la page /devenir-commercial-pro
              </div>
            </div>
          </Link>
        </div>
      </section>

      <section style={{
        background: 'var(--accent-muted)', border: '1px solid var(--accent-border)',
        borderRadius: 'var(--radius)', padding: '16px 18px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
          Barème commerciaux pros
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
          50 € par pack Solo · 65 € par pack Duo · Minimum de versement : 30 € · Codes promo dédiés tagués
          <code style={{ background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4, margin: '0 4px' }}>seller_type=&apos;commercial&apos;</code>
          (le webhook Stripe route automatiquement les ventes vers <code>commercial_sales</code>).
        </div>
      </section>
    </div>
  );
}
