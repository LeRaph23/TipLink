import { Link } from '@/i18n/navigation';
import { Icon } from '@/components/ambassadeur/icons';

export interface CommercialRow {
  id: string;
  name: string;
  company_name: string;
  legal_form: string;
  vrp_status: string;
  city: string;
  email: string;
  promo_code: string | null;
  onboarding_status: string;
  is_active: boolean;
  payouts_frozen: boolean;
  sales_count: number;
  sales_commission_cents: number;
  created_at: string;
}

const LEGAL_FORM_LABELS: Record<string, string> = {
  sarl: 'SARL', sas: 'SAS', sasu: 'SASU', ei: 'EI',
  auto_entrepreneur: 'Auto-ent.', eurl: 'EURL', sa: 'SA', autre: 'Autre',
};

const ONBOARDING_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: 'Non démarré', color: 'var(--text-3)',  bg: 'var(--surface-2)' },
  pending:     { label: 'En cours',    color: 'var(--warning)', bg: 'var(--warning-bg)' },
  verified:    { label: 'Vérifié',     color: 'var(--success)', bg: 'var(--success-bg)' },
  rejected:    { label: 'Rejeté',      color: 'var(--error)',   bg: 'var(--error-bg)' },
};

function fmtEUR(cents: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
}

export function CommerciauxOverview({ commerciaux }: { commerciaux: CommercialRow[] }) {
  if (commerciaux.length === 0) {
    return (
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', padding: '32px', textAlign: 'center',
        color: 'var(--text-3)', fontSize: 13,
      }}>
        Aucun commercial actif pour le moment. Acceptez une candidature dans l&apos;onglet Recrutement pour démarrer.
      </div>
    );
  }

  const tdStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 12.5, color: 'var(--text)', verticalAlign: 'middle',
  };
  const thStyle: React.CSSProperties = {
    padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em',
    borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
  };

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', overflow: 'hidden',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {['Commercial', 'Société', 'Forme', 'Ville', 'Code promo', 'Ventes', 'Commissions', 'Onboarding', 'Statut'].map((h, i) => (
              <th key={i} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {commerciaux.map((c) => {
            const ob = ONBOARDING_LABELS[c.onboarding_status] ?? ONBOARDING_LABELS.not_started;
            return (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>
                  <Link href={`/dashboard/admin/commerciaux/${c.id}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                    {c.name}
                  </Link>
                  {c.payouts_frozen && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 6, fontSize: 10, color: 'var(--warning)', fontWeight: 700 }}>
                      <Icon name="pause" size={11} /> GELÉ
                    </span>
                  )}
                </td>
                <td style={tdStyle}>{c.company_name}</td>
                <td style={tdStyle}>{LEGAL_FORM_LABELS[c.legal_form] ?? c.legal_form}</td>
                <td style={tdStyle}>{c.city}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>
                  {c.promo_code ?? '—'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {c.sales_count}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {fmtEUR(c.sales_commission_cents)}
                </td>
                <td style={tdStyle}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 99,
                    fontSize: 11, fontWeight: 600, background: ob.bg, color: ob.color,
                  }}>
                    {ob.label}
                  </span>
                </td>
                <td style={tdStyle}>
                  {c.is_active ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)' }}>● Actif</span>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>○ Inactif</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
