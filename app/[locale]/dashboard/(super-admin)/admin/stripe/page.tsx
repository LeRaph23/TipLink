import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createClient } from '@/lib/supabase/server';

function dashBase(): string {
  const sk = process.env.STRIPE_SECRET_KEY ?? '';
  return sk.startsWith('sk_test') ? 'https://dashboard.stripe.com/test' : 'https://dashboard.stripe.com';
}

export default async function AdminStripePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin(locale);
  const t = await getTranslations('dashboard.admin.stripe');
  const supabase = await createClient();
  const base = dashBase();

  const [{ data: groups }, { data: establishments }, { data: staff }] = await Promise.all([
    supabase
      .from('groups')
      .select('id, name, stripe_customer_id')
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('establishments')
      .select('id, name, stripe_account_id, onboarding_status, groups(name)')
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('staff_profiles')
      .select('id, full_name, stripe_account_id, onboarding_status, establishment_id, establishments(name)')
      .is('deleted_at', null)
      .not('stripe_account_id', 'is', null)
      .order('full_name')
      .limit(200),
  ]);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>{t('title')}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>{t('subtitle')}</p>
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{t('groupsTitle')}</h2>
      <div style={{ marginBottom: 28, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {[t('colName'), t('colCustomer')].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(groups ?? []).map((g) => (
              <tr key={g.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={td}>{g.name}</td>
                <td style={td}>
                  {g.stripe_customer_id ? (
                    <a href={`${base}/customers/${g.stripe_customer_id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                      {g.stripe_customer_id}
                    </a>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{t('establishmentsTitle')}</h2>
      <div style={{ marginBottom: 28, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {[t('colName'), t('colGroup'), t('colAccount'), t('colOnboarding')].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(establishments ?? []).map((e) => {
              const grp = Array.isArray(e.groups) ? e.groups[0] : e.groups;
              return (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={td}>{e.name}</td>
                  <td style={td}>{grp?.name ?? '—'}</td>
                  <td style={td}>
                    {e.stripe_account_id ? (
                      <a href={`${base}/connect/accounts/${e.stripe_account_id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                        {e.stripe_account_id}
                      </a>
                    ) : '—'}
                  </td>
                  <td style={td}>{e.onboarding_status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{t('staffTitle')}</h2>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {[t('colName'), t('colEstablishment'), t('colAccount'), t('colOnboarding')].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(staff ?? []).length === 0 && (
              <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>{t('staffEmpty')}</td></tr>
            )}
            {(staff ?? []).map((s) => {
              const est = s.establishments as { name: string } | { name: string }[] | null;
              const estName = Array.isArray(est) ? est[0]?.name : est?.name;
              return (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={td}>{s.full_name}</td>
                <td style={td}>{estName ?? s.establishment_id}</td>
                <td style={td}>
                  {s.stripe_account_id ? (
                    <a href={`${base}/connect/accounts/${s.stripe_account_id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                      {s.stripe_account_id}
                    </a>
                  ) : '—'}
                </td>
                <td style={td}>{s.onboarding_status}</td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
};
const td: React.CSSProperties = { padding: '10px 12px', color: 'var(--text-2)' };
