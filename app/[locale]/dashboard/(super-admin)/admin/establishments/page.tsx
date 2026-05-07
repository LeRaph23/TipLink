import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { EstablishmentActions } from './EstablishmentActions';

export default async function EstablishmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.admin');

  const supabase = await createClient();

  const { data: establishments } = await supabase
    .from('establishments')
    .select(`
      id, name, business_type, slug, country, currency, address,
      onboarding_status, deleted_at,
      groups (name)
    `)
    .is('deleted_at', null)
    .order('name');

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          {t('establishments.title')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
          {t('establishments.subtitle')}
        </p>
      </div>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {[
                  t('establishments.colName'),
                  t('establishments.colGroup'),
                  t('establishments.colType'),
                  t('establishments.colCurrency'),
                  t('establishments.colStripe'),
                  'Actions',
                ].map((h) => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left',
                    fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                    background: 'var(--surface-2)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(!establishments || establishments.length === 0) && (
                <tr>
                  <td colSpan={6} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-3)' }}>
                    {t('establishments.empty')}
                  </td>
                </tr>
              )}
              {establishments?.map((e) => {
                const group = Array.isArray(e.groups) ? e.groups[0] : e.groups;
                const isComplete = e.onboarding_status === 'complete';
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text)' }}>{e.name}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-2)' }}>{group?.name ?? '—'}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-2)', textTransform: 'capitalize' }}>{e.business_type}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-2)', fontFamily: 'ui-monospace, monospace', textTransform: 'uppercase' }}>{e.currency}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 600,
                        background: isComplete ? 'var(--success-bg)' : 'var(--neutral-bg)',
                        color: isComplete ? 'var(--success)' : 'var(--text-3)',
                        whiteSpace: 'nowrap',
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                        {e.onboarding_status ?? '—'}
                      </span>
                    </td>
                    <EstablishmentActions
                      id={e.id}
                      name={e.name ?? ''}
                      address={e.address ?? null}
                      businessType={e.business_type ?? null}
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
