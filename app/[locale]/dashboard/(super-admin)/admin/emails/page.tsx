import { setRequestLocale } from 'next-intl/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// Read-only super-admin view of the automated (lifecycle) email system.
// The lifecycle_email_log table is not in the generated DB types — use a
// loosely-typed client. RLS already restricts reads to super-admins.

const LIST_LIMIT = 500;
const RECENT_SHOWN = 120;

type LogRow = {
  id: string;
  email_key: string;
  audience: string;
  transactional: boolean;
  to_email: string;
  status: 'pending' | 'sent' | 'skipped' | 'failed';
  resend_id: string | null;
  error: string | null;
  created_at: string;
  sent_at: string | null;
};

const STATUS_COLOR: Record<string, [string, string]> = {
  sent: ['var(--success-bg)', 'var(--success)'],
  pending: ['var(--warning-bg)', 'var(--warning)'],
  failed: ['var(--error-bg)', 'var(--error)'],
  skipped: ['var(--neutral-bg)', 'var(--neutral)'],
};

function Badge({ status }: { status: string }) {
  const [bg, color] = STATUS_COLOR[status] ?? ['var(--neutral-bg)', 'var(--neutral)'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px',
      borderRadius: 100, fontSize: 11, fontWeight: 600, background: bg, color, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
      {status}
    </span>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default async function AdminEmailsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sb = (await createClient()) as unknown as SupabaseClient;

  const { data: rowsRaw } = await sb
    .from('lifecycle_email_log')
    .select('id, email_key, audience, transactional, to_email, status, resend_id, error, created_at, sent_at')
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);
  const rows = (rowsRaw ?? []) as LogRow[];

  const [{ count: groupsOptOut }, { count: staffOptOut }] = await Promise.all([
    sb.from('groups').select('id', { count: 'exact', head: true }).not('lifecycle_emails_opt_out_at', 'is', null),
    sb.from('staff_profiles').select('id', { count: 'exact', head: true }).not('lifecycle_emails_opt_out_at', 'is', null),
  ]);

  const totalSent = rows.filter((r) => r.status === 'sent').length;
  const totalFailed = rows.filter((r) => r.status === 'failed').length;

  // Per-email-key tally (over the loaded window).
  const byKey = new Map<string, { sent: number; failed: number; pending: number }>();
  for (const r of rows) {
    const cur = byKey.get(r.email_key) ?? { sent: 0, failed: 0, pending: 0 };
    if (r.status === 'sent') cur.sent++;
    else if (r.status === 'failed') cur.failed++;
    else if (r.status === 'pending') cur.pending++;
    byKey.set(r.email_key, cur);
  }
  const keyRows = [...byKey.entries()].sort((a, b) => b[1].sent - a[1].sent);

  const th: React.CSSProperties = {
    padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em',
    borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
  };
  const td: React.CSSProperties = { padding: '9px 14px', color: 'var(--text-2)' };

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          Emails automatiques
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
          Suivi des relances d&apos;onboarding, d&apos;activation et de rétention — {rows.length} derniers envois.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 20 }}>
        <Kpi label="Envoyés (récents)" value={String(totalSent)} sub={`sur ${rows.length} entrées`} />
        <Kpi label="Échecs" value={String(totalFailed)} />
        <Kpi label="Désinscriptions" value={String((groupsOptOut ?? 0) + (staffOptOut ?? 0))} sub={`${groupsOptOut ?? 0} établissements · ${staffOptOut ?? 0} staff`} />
        <Kpi label="Types d'emails actifs" value={String(byKey.size)} />
      </div>

      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 10px' }}>Par type d&apos;email</h2>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 26 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>Email</th>
              <th style={{ ...th, textAlign: 'right' }}>Envoyés</th>
              <th style={{ ...th, textAlign: 'right' }}>Échecs</th>
              <th style={{ ...th, textAlign: 'right' }}>En cours</th>
            </tr>
          </thead>
          <tbody>
            {keyRows.length === 0 ? (
              <tr><td style={{ ...td, padding: 24, textAlign: 'center', color: 'var(--text-3)' }} colSpan={4}>Aucun email envoyé pour l&apos;instant.</td></tr>
            ) : keyRows.map(([key, c]) => (
              <tr key={key} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ ...td, color: 'var(--text)', fontWeight: 500 }}>{key}</td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.sent}</td>
                <td style={{ ...td, textAlign: 'right', color: c.failed ? 'var(--error)' : 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{c.failed}</td>
                <td style={{ ...td, textAlign: 'right', color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{c.pending}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 10px' }}>Envois récents</h2>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>Date</th>
              <th style={th}>Email</th>
              <th style={th}>Cible</th>
              <th style={th}>Destinataire</th>
              <th style={th}>Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, RECENT_SHOWN).map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ ...td, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                  {new Date(r.created_at).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td style={{ ...td, color: 'var(--text)' }}>
                  {r.email_key}
                  {r.transactional && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-3)' }}>(transac.)</span>}
                </td>
                <td style={td}>{r.audience}</td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{r.to_email}</td>
                <td style={td}>
                  <Badge status={r.status} />
                  {r.error && <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 2 }}>{r.error}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
