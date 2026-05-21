import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createServiceClient } from '@/lib/supabase/service';
import { CommercialActions } from './CommercialActions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const LEGAL_FORM_LABELS: Record<string, string> = {
  sarl: 'SARL', sas: 'SAS', sasu: 'SASU', ei: 'Entreprise individuelle',
  auto_entrepreneur: 'Auto-entrepreneur', eurl: 'EURL', sa: 'SA', autre: 'Autre',
};
const VRP_STATUS_LABELS: Record<string, string> = {
  vrp_exclusif: 'VRP exclusif',
  vrp_multicarte: 'VRP multicarte',
  agent_commercial: 'Agent commercial',
  independant: 'Commercial indépendant',
  autre: 'Autre',
};
const ONBOARDING_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: 'Non démarré', color: 'var(--text-3)', bg: 'var(--surface-2)' },
  pending:     { label: 'En cours',    color: 'var(--warning)', bg: 'var(--warning-bg)' },
  verified:    { label: 'Vérifié',     color: 'var(--success)', bg: 'var(--success-bg)' },
  rejected:    { label: 'Rejeté',      color: 'var(--error)',   bg: 'var(--error-bg)' },
};

function fmtEUR(cents: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
}
function fmtEUR2(cents: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default async function CommercialDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin(locale);

  const service = createServiceClient();

  const { data: com } = await service
    .from('commerciaux')
    .select('id, name, company_name, legal_form, vrp_status, vat_number, sector, siret, email, phone, city, onboarding_status, is_active, payouts_frozen, pin_hash, pin_setup_token, pin_setup_expires_at, stripe_account_id, created_at, promo_codes(code)')
    .eq('id', id)
    .maybeSingle();

  if (!com) notFound();

  const [{ data: sales }, { data: payouts }] = await Promise.all([
    service
      .from('commercial_sales')
      .select('id, pack, commission_amount, salon_name_partial, created_at, voided_at, void_reason')
      .eq('commercial_id', id)
      .order('created_at', { ascending: false }),
    service
      .from('commercial_payouts')
      .select('id, amount_cents, status, stripe_transfer_id, failure_reason, requested_at, paid_at')
      .eq('commercial_id', id)
      .order('requested_at', { ascending: false }),
  ]);

  const liveSales = (sales ?? []).filter(s => !s.voided_at);
  const totalCommissions = liveSales.reduce((sum, s) => sum + s.commission_amount, 0);
  const paidOut = (payouts ?? []).filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount_cents, 0);
  const owed = Math.max(0, totalCommissions - paidOut);

  const promoCode = com.promo_codes as { code?: string } | { code?: string }[] | null;
  const code = Array.isArray(promoCode) ? promoCode[0]?.code : promoCode?.code;
  const ob = ONBOARDING_LABELS[com.onboarding_status] ?? ONBOARDING_LABELS.not_started;

  const card: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius)', padding: 16, marginBottom: 16,
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12,
  };
  const infoRow = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', padding: '8px 0', borderTop: '1px solid var(--border-subtle)', fontSize: 13, gap: 8 }}>
      <span style={{ color: 'var(--text-3)', textTransform: 'uppercase', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ color: 'var(--text)' }}>{value ?? <span style={{ color: 'var(--text-3)' }}>—</span>}</span>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link href="/dashboard/admin/commerciaux/equipe" style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none' }}>
          ← Retour à l&apos;équipe
        </Link>
      </div>

      <div style={{ ...card, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' }}>
              {com.name}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 2 }}>
              {com.company_name} · {LEGAL_FORM_LABELS[com.legal_form] ?? com.legal_form}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {com.is_active
              ? <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: 'var(--success-bg)', color: 'var(--success)' }}>● Actif</span>
              : <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: 'var(--surface-2)', color: 'var(--text-3)' }}>○ Inactif</span>}
            {com.payouts_frozen && <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: 'var(--warning-bg)', color: 'var(--warning)' }}>⏸ Virements gelés</span>}
            <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: ob.bg, color: ob.color }}>Stripe : {ob.label}</span>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Ventes', value: String(liveSales.length), sub: `${liveSales.filter(s => s.pack === 'solo').length} solo · ${liveSales.filter(s => s.pack === 'duo').length} duo` },
          { label: 'Commissions', value: fmtEUR(totalCommissions) },
          { label: 'Versé', value: fmtEUR(paidOut) },
          { label: 'À reverser', value: fmtEUR(owed), accent: true },
        ].map((k, i) => (
          <div key={i} style={{
            background: 'var(--surface)',
            border: `1px solid ${k.accent ? 'var(--accent)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--radius)', padding: 14,
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: k.accent ? 'var(--accent)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.accent ? 'var(--accent)' : 'var(--text)', letterSpacing: '-0.03em' }}>{k.value}</div>
            {k.sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Profile */}
      <div style={card}>
        <div style={sectionTitle}>Profil professionnel</div>
        {infoRow('Code promo', code ? <code style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>{code}</code> : null)}
        {infoRow('Statut commercial', VRP_STATUS_LABELS[com.vrp_status] ?? com.vrp_status)}
        {infoRow('SIRET', com.siret && <span style={{ fontFamily: 'monospace' }}>{com.siret}</span>)}
        {infoRow('N° TVA', com.vat_number ? <span style={{ fontFamily: 'monospace' }}>{com.vat_number}</span> : null)}
        {infoRow('Secteur', com.sector)}
        {infoRow('Email', <a href={`mailto:${com.email}`} style={{ color: 'var(--accent)' }}>{com.email}</a>)}
        {infoRow('Téléphone', com.phone)}
        {infoRow('Ville', com.city)}
        {infoRow('Stripe account', com.stripe_account_id ? <code style={{ fontFamily: 'monospace', fontSize: 11 }}>{com.stripe_account_id}</code> : null)}
        {infoRow('Création', fmtDateTime(com.created_at))}
        {infoRow('PIN configuré', com.pin_hash ? 'Oui' : <span style={{ color: 'var(--warning)' }}>Non — lien d&apos;activation requis</span>)}
        {code && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-3)' }}>
            Portail commercial :{' '}
            <a href={`/fr/pro/${code.toLowerCase()}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
              /fr/pro/{code.toLowerCase()}
            </a>
          </div>
        )}
      </div>

      {/* Admin actions */}
      <div style={{ marginBottom: 16 }}>
        <CommercialActions
          id={com.id}
          isActive={com.is_active}
          payoutsFrozen={com.payouts_frozen}
          hasPin={!!com.pin_hash}
        />
      </div>

      {/* Sales */}
      <div style={card}>
        <div style={sectionTitle}>Toutes les ventes ({sales?.length ?? 0})</div>
        {!sales || sales.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Aucune vente.</div>
        ) : (
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden' }}>
            {sales.map((s, i) => (
              <div key={s.id} style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto auto',
                gap: 8, padding: '10px 12px', alignItems: 'center',
                borderTop: i === 0 ? undefined : '1px solid var(--border-subtle)',
                opacity: s.voided_at ? 0.55 : 1,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtDateTime(s.created_at)}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{s.salon_name_partial ?? '***'}</div>
                </div>
                <span style={{
                  padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                  background: s.pack === 'duo' ? 'var(--accent-muted)' : 'var(--success-bg)',
                  color: s.pack === 'duo' ? 'var(--accent)' : 'var(--success)',
                }}>{s.pack}</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtEUR2(s.commission_amount)}
                </div>
                {s.voided_at
                  ? <span title={s.void_reason ?? undefined} style={{ fontSize: 10.5, color: 'var(--error)', fontWeight: 700 }}>VOIDED</span>
                  : <span style={{ width: 0 }} />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payouts */}
      <div style={card}>
        <div style={sectionTitle}>Versements ({payouts?.length ?? 0})</div>
        {!payouts || payouts.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Aucun versement.</div>
        ) : (
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden' }}>
            {payouts.map((p, i) => (
              <div key={p.id} style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto',
                gap: 8, padding: '10px 12px', alignItems: 'center',
                borderTop: i === 0 ? undefined : '1px solid var(--border-subtle)',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    Demandé {fmtDateTime(p.requested_at)}{p.paid_at ? ` · Payé ${fmtDateTime(p.paid_at)}` : ''}
                  </div>
                  {p.stripe_transfer_id && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 1 }}>
                      Transfer : {p.stripe_transfer_id}
                    </div>
                  )}
                  {p.failure_reason && (
                    <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 1 }}>{p.failure_reason}</div>
                  )}
                </div>
                <span style={{
                  padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                  background: p.status === 'paid' ? 'var(--success-bg)'
                    : p.status === 'failed' ? 'var(--error-bg)'
                    : p.status === 'canceled' ? 'var(--surface-2)'
                    : 'var(--warning-bg)',
                  color: p.status === 'paid' ? 'var(--success)'
                    : p.status === 'failed' ? 'var(--error)'
                    : p.status === 'canceled' ? 'var(--text-3)'
                    : 'var(--warning)',
                }}>{p.status}</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtEUR2(p.amount_cents)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
