'use client';

import { useState, useTransition } from 'react';
import { reviewRecruitmentApplication } from '@/actions/admin/ambassadors';

export interface RecruitmentApplicationRow {
  id: string;
  first_name: string;
  last_name: string;
  city: string;
  phone: string;
  email: string;
  siret: string | null;
  no_fraud_pledge: boolean;
  notes: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  reviewed_at: string | null;
  created_at: string;
  referrerName: string | null;
}

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  pending:  { label: 'En attente', bg: 'var(--warning-bg)',  color: 'var(--warning)'  },
  accepted: { label: 'Acceptée',   bg: 'var(--success-bg)', color: 'var(--success)'  },
  rejected: { label: 'Refusée',    bg: 'var(--error-bg)',   color: 'var(--error)'    },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function RecruitmentApplications({
  applications: initialApps,
}: {
  applications: RecruitmentApplicationRow[];
}) {
  const [apps, setApps] = useState(initialApps);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleReview = (id: string, status: 'accepted' | 'rejected') => {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await reviewRecruitmentApplication(id, status);
      if (!result.ok) {
        setErrorMsg(result.error);
        return;
      }
      setApps(prev =>
        prev.map(a => a.id === id
          ? { ...a, status, reviewed_at: new Date().toISOString() }
          : a
        )
      );
    });
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

  const renderTable = (rows: RecruitmentApplicationRow[], showActions: boolean) => (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          {['Date', 'Nom', 'Ville', 'Email', 'Téléphone', 'SIRET', 'Parrain', 'Statut',
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
          return (
            <>
              <tr
                key={app.id}
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  cursor: app.notes ? 'pointer' : 'default',
                  background: isExpanded ? 'var(--surface-2)' : undefined,
                }}
                onClick={() => app.notes && setExpandedId(isExpanded ? null : app.id)}
              >
                <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--text-3)' }}>
                  {fmtDate(app.created_at)}
                </td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>
                  {app.first_name} {app.last_name}
                  {app.notes && (
                    <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--text-3)', fontWeight: 400 }}>
                      {isExpanded ? '▲' : '▼'} note
                    </span>
                  )}
                </td>
                <td style={tdStyle}>{app.city}</td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
                  {app.email}
                </td>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{app.phone}</td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono, monospace)', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {app.siret ?? <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>non renseigné</span>}
                </td>
                <td style={tdStyle}>
                  {app.referrerName
                    ? <span style={{ fontWeight: 600 }}>{app.referrerName}</span>
                    : <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>—</span>}
                </td>
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
              {isExpanded && app.notes && (
                <tr key={`${app.id}-notes`} style={{ background: 'var(--surface-2)' }}>
                  <td colSpan={showActions ? 9 : 8} style={{ padding: '8px 14px 12px 28px' }}>
                    <p style={{ fontSize: 12.5, color: 'var(--text)', margin: 0, fontStyle: 'italic' }}>
                      {app.notes}
                    </p>
                  </td>
                </tr>
              )}
            </>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
        Candidatures de recrutement
      </h2>
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 16, marginTop: 0 }}>
        Formulaires soumis via la page de recrutement ambassadeur.
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
          Aucune candidature reçue pour le moment.
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
