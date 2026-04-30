import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createClient } from '@/lib/supabase/server';

export default async function AdminWebhooksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin(locale);
  const t = await getTranslations('dashboard.admin.webhooks');
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from('webhook_events')
    .select('id, stripe_event_id, event_type, processed_at, error, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>{t('title')}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>{t('subtitle')}</p>
      </div>
      {error && (
        <div style={{ padding: 16, marginBottom: 16, borderRadius: 'var(--radius)', background: 'var(--error-bg)', color: 'var(--error)', fontSize: 13 }}>
          {t('rlsHint')}
        </div>
      )}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {[t('colCreated'), t('colType'), t('colEventId'), t('colProcessed'), t('colError')].map((h) => (
                <th key={h} style={{
                  padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-3)',
                  textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(!rows || rows.length === 0) && !error && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>{t('empty')}</td></tr>
            )}
            {(rows ?? []).map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '8px 12px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                  {new Date(r.created_at).toLocaleString(locale)}
                </td>
                <td style={{ padding: '8px 12px' }}>{r.event_type}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{r.stripe_event_id}</td>
                <td style={{ padding: '8px 12px', color: 'var(--text-2)' }}>
                  {r.processed_at ? new Date(r.processed_at).toLocaleString(locale) : '—'}
                </td>
                <td style={{ padding: '8px 12px', color: r.error ? 'var(--error)' : 'var(--text-3)', maxWidth: 280, wordBreak: 'break-word' }}>
                  {r.error ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
