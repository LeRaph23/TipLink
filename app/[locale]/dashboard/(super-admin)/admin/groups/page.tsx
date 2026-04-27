import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function GroupsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.admin');

  const supabase = await createClient();

  const { data: groups } = await supabase
    .from('groups')
    .select('id, name, logo_url, settings, created_at, platform_fee_bps')
    .is('deleted_at', null)
    .order('name');

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          {t('groups.title')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>{t('groups.subtitle')}</p>
      </div>

      {(!groups || groups.length === 0) ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)', padding: 40, textAlign: 'center',
          color: 'var(--text-3)', fontSize: 13,
        }}>
          {t('groups.empty')}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {groups.map((g) => (
            <div key={g.id} style={{
              background: 'var(--surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius)', padding: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                {g.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={g.logo_url}
                    alt={g.name}
                    style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{
                    width: 40, height: 40, borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-2)', color: 'var(--text-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700,
                  }}>
                    {g.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <h2 style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)' }}>{g.name}</h2>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 6 }}>
                {t('groups.createdOn')} {new Date(g.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, color: 'var(--text-2)', fontWeight: 500 }}>
                  {t('groups.feeLabel')}: {((g.platform_fee_bps ?? 200) / 100).toFixed(2)}%
                </span>
                <Link
                  href={`/dashboard/admin/groups/${g.id}`}
                  style={{
                    fontSize: 11.5, fontWeight: 600, color: 'var(--accent)',
                    textDecoration: 'none', padding: '3px 8px',
                    border: '1px solid var(--accent-muted)', borderRadius: 5,
                  }}
                >
                  {t('groups.edit')}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
