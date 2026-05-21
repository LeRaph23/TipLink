'use client';

import { Fragment, useState, useTransition } from 'react';
import { reviewCommercialRecruitmentApplication } from '@/actions/admin/commerciaux';

export interface CommercialApplicationRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  city: string;
  sector: string | null;
  company_name: string;
  legal_form: string;
  vat_number: string | null;
  siret: string;
  vrp_status: string;
  notes: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  reviewed_at: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  pending:  { label: 'En attente', bg: 'var(--warning-bg)',  color: 'var(--warning)'  },
  accepted: { label: 'Acceptée',   bg: 'var(--success-bg)', color: 'var(--success)'  },
  rejected: { label: 'Refusée',    bg: 'var(--error-bg)',   color: 'var(--error)'    },
};

const LEGAL_FORM_LABELS: Record<string, string> = {
  sarl: 'SARL', sas: 'SAS', sasu: 'SASU', ei: 'EI',
  auto_entrepreneur: 'Auto-ent.', eurl: 'EURL', sa: 'SA', autre: 'Autre',
};

const VRP_STATUS_LABELS: Record<string, string> = {
  vrp_exclusif: 'VRP exclusif',
  vrp_multicarte: 'VRP multicarte',
  agent_commercial: 'Agent commercial',
  independant: 'Indépendant',
  autre: 'Autre',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function CommercialRecruitmentApplications({
  applications: initialApps,
}: {
  applications: CommercialApplicationRow[];
}) {
  const [apps, setApps] = useState(initialApps);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [provisioned, setProvisioned] = useState<Record<string, { promoCode: string; setupUrl: string }>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleReview = (id: string, status: 'accepted' | 'rejected') => {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await reviewCommercialRecruitmentApplication(id, status);
      if (!result.ok) {
        setErrorMsg(result.error);
        return;
      }
      if (status === 'accepted' && result.provisioned) {
        setProvisioned(prev => ({ ...prev, [id]: result.provisioned! }));
      }
      setApps(prev =>
        prev.map(a => a.id === id
          ? { ...a, status, reviewed_at: new Date().toISOString() }
          : a
        )
      );
    });
  };

  const copyLink = (id: string, url: string) => {
    navigator.clipboard?.writeText(url).then(
      () => { setCopiedId(id); setTimeout(() => setCopiedId(null), 1800); },
      () => {},
    );
  };

  const pending  = apps.filter(a => a.status === 'pending');
  const reviewed = apps.filter(a => a.status !== 'pending');

  const btnBase: React.CSSProperties = {
    padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', border: 'none',
  };

  const tdStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 12.5, color: 'var(--text)', verticalAlign: 'top',
  };

  const thStyle: React.CSSProperties = {
    padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em',
    borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
    whiteSpace: 'nowrap',
  };

  const renderTable = (rows: CommercialApplicationRow[], showActions: boolean) => (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          {['Date', 'Commercial', 'Société', 'Forme', 'SIRET', 'Statut VRP', 'Ville', 'Statut',
            ...(showActions ? ['Actions'] : [])
          ].map((h, i) => (
            <th key={i} style={thStyle}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((app) => {
          const st = STATUS_LABELS[app.status];
          const isExpanded = expandedId === app.id;
          const expandable = !!(app.notes || app.vat_number || app.sector || app.email);
          const colCount = showActions ? 9 : 8;
          return (
            <Fragment key={app.id}>
              <tr
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  cursor: expandable ? 'pointer' : 'default',
                  background: isExpanded ? 'var(--surface-2)' : undefined,
                }}
                onClick={() => expandable && setExpandedId(isExpanded ? null : app.id)}
              >
                <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--text-3)' }}>
                  {fmtDate(app.created_at)}
                </td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>
                  {app.first_name} {app.last_name}
                  {expandable && (
                    <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--text-3)', fontWeight: 400 }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  )}
                </td>
                <td style={tdStyle}>{app.company_name}</td>
                <td style={tdStyle}>{LEGAL_FORM_LABELS[app.legal_form] ?? app.legal_form}</td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
                  {app.siret}
                </td>
                <td style={tdStyle}>{VRP_STATUS_LABELS[app.vrp_status] ?? app.vrp_status}</td>
                <td style={tdStyle}>{app.city}{app.sector ? ` · ${app.sector}` : ''}</td>
                <td style={tdStyle}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                    background: st.bg, color: st.color,
                  }}>
                    {st.label}
                  </span>
                </td>
                {showActions && (
                  <td style={tdStyle} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        style={{ ...btnBase, background: 'var(--success-bg)', color: 'var(--success)' }}
                        onClick={() => handleReview(app.id, 'accepted')}
                        disabled={isPending}
                      >
                        Accepter
                      </button>
                      <button
                        style={{ ...btnBase, background: 'var(--error-bg)', color: 'var(--error)' }}
                        onClick={() => handleReview(app.id, 'rejected')}
                        disabled={isPending}
                      >
                        Refuser
                      </button>
                    </div>
                  </td>
                )}
              </tr>
              {isExpanded && (
                <tr style={{ background: 'var(--surface-2)' }}>
                  <td colSpan={colCount} style={{ padding: '10px 14px 14px 28px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55 }}>
                      <div><strong style={{ color: 'var(--text-3)' }}>Email :</strong> {app.email}</div>
                      <div><strong style={{ color: 'var(--text-3)' }}>Téléphone :</strong> {app.phone}</div>
                      {app.vat_number && (
                        <div><strong style={{ color: 'var(--text-3)' }}>N° TVA :</strong> <span style={{ fontFamily: 'monospace' }}>{app.vat_number}</span></div>
                      )}
                      {app.sector && (
                        <div><strong style={{ color: 'var(--text-3)' }}>Secteur :</strong> {app.sector}</div>
                      )}
                    </div>
                    {app.notes && (
                      <p style={{ fontSize: 12.5, color: 'var(--text)', margin: '10px 0 0', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                        {app.notes}
                      </p>
                    )}
                  </td>
                </tr>
              )}
              {provisioned[app.id] && (
                <tr style={{ background: 'var(--success-bg)' }}>
                  <td colSpan={colCount} style={{ padding: '10px 14px 12px 28px' }}>
                    <div style={{ fontSize: 12.5, color: 'var(--text)' }}>
                      <strong style={{ color: 'var(--success)' }}>✓ Commercial créé.</strong>
                      {' '}Code promo : <code style={{ fontWeight: 700 }}>{provisioned[app.id].promoCode}</code>
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                        Lien d&apos;activation à transmettre :
                      </span>
                      <code style={{ fontSize: 11, wordBreak: 'break-all', color: 'var(--text-2)' }}>
                        {provisioned[app.id].setupUrl}
                      </code>
                      <button
                        type="button"
                        style={{ ...btnBase, background: 'var(--surface-2)', color: 'var(--text)' }}
                        onClick={() => copyLink(app.id, provisioned[app.id].setupUrl)}
                      >
                        {copiedId === app.id ? '✓ Copié' : 'Copier le lien'}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
        Candidatures Commerciaux Pros
      </h2>
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 16, marginTop: 0 }}>
        Formulaires soumis via la landing /devenir-commercial-pro. L&apos;acceptation provisionne
        automatiquement un code promo dédié et un lien d&apos;activation.
      </p>

      {errorMsg && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 7, background: 'var(--error-bg)', color: 'var(--error)', fontSize: 13 }}>
          {errorMsg}
        </div>
      )}

      {apps.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)', padding: '32px', textAlign: 'center',
          color: 'var(--text-3)', fontSize: 13,
        }}>
          Aucune candidature commerciale reçue pour le moment.
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 16,
            }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--warning)' }}>
                  {pending.length} en attente
                </span>
              </div>
              {renderTable(pending, true)}
            </div>
          )}

          {reviewed.length > 0 && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius)', overflow: 'hidden',
            }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>
                  Historique ({reviewed.length})
                </span>
              </div>
              {renderTable(reviewed, false)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
