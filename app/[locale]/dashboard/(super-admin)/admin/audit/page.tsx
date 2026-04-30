import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createClient } from '@/lib/supabase/server';

export default async function AdminAuditPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin(locale);
  const t = await getTranslations('dashboard.admin.audit');
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from('admin_audit_log')
    .select('id, actor_user_id, action, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(400);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>{t('title')}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>{t('subtitle')}</p>
      </div>
      {error && (
        <div style={{ padding: 16, marginBottom: 16, borderRadius: 'var(--radius)', background: 'var(--warning-bg)', color: 'var(--warning)', fontSize: 13 }}>
          {t('migrationHint')}
        </div>
      )}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {[t('colWhen'), t('colActor'), t('colAction'), t('colMeta')].map((h) => (
                <th key={h} style={{
                  padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-3)',
                  textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(!rows || rows.length === 0) && !error && (
              <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>{t('empty')}</td></tr>
            )}
            {(rows ?? []).map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>
                  {new Date(r.created_at).toLocaleString(locale)}
                </td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }}>{r.actor_user_id}</td>
                <td style={{ padding: '8px 12px' }}>{r.action}</td>
                <td style={{ padding: '8px 12px', color: 'var(--text-2)', maxWidth: 360, wordBreak: 'break-all' }}>
                  {JSON.stringify(r.metadata)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
