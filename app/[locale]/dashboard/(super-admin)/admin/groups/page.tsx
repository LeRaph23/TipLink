import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { GroupFeeEditor } from './GroupFeeEditor';
import { GroupActions } from './GroupActions';

export default async function GroupsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.admin');

  const supabase = await createClient();

  const { data: allGroups } = await supabase
    .from('groups')
    .select('id, name, logo_url, settings, created_at, platform_fee_bps')
    .is('deleted_at', null)
    .order('name');

  const { data: estabCounts } = await supabase
    .from('establishments')
    .select('group_id')
    .is('deleted_at', null);

  const { data: staffCounts } = await supabase
    .from('staff_profiles')
    .select('establishment_id, establishments(group_id)')
    .is('deleted_at', null)
    .eq('is_active', true);

  const countByGroup = new Map<string, number>();
  for (const e of estabCounts ?? []) {
    if (e.group_id) countByGroup.set(e.group_id, (countByGroup.get(e.group_id) ?? 0) + 1);
  }

  const staffByGroup = new Map<string, number>();
  for (const s of staffCounts ?? []) {
    const gid = (s.establishments as { group_id: string } | null)?.group_id;
    if (gid) staffByGroup.set(gid, (staffByGroup.get(gid) ?? 0) + 1);
  }

  const displayGroups = allGroups ?? [];

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
            {t('groups.title')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>{t('groups.subtitle')}</p>
        </div>
        <Link
          href="/dashboard/admin/groups/new"
          style={{
            display: 'inline-block', padding: '9px 18px', borderRadius: 'var(--radius-sm)',
            background: 'var(--accent)', border: '1px solid var(--accent)',
            color: 'var(--accent-contrast, #fff)', fontSize: 13, fontWeight: 600,
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}
        >
          + Nouveau groupe
        </Link>
      </div>

      {displayGroups.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)', padding: 40, textAlign: 'center',
          color: 'var(--text-3)', fontSize: 13,
        }}>
          {t('groups.empty')}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {displayGroups.map((g) => {
            const estCount = countByGroup.get(g.id) ?? 0;
            const staffCount = staffByGroup.get(g.id) ?? 0;
            return (
              <div key={g.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius)', padding: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link
                      href={`/dashboard/admin/groups/${g.id}`}
                      style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}
                    >
                      {g.name}
                    </Link>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                      Créé le {new Date(g.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 10, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{estCount}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Établ.</div>
                  </div>
                  <div style={{ width: 1, background: 'var(--border)' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{staffCount}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Staff actif</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <Link
                    href={`/dashboard/admin/groups/${g.id}`}
                    style={{
                      fontSize: 11.5, color: 'var(--accent)', fontWeight: 500, textDecoration: 'none',
                      alignSelf: 'center',
                    }}
                  >
                    Voir détail →
                  </Link>
                </div>

                <GroupFeeEditor groupId={g.id} initialBps={g.platform_fee_bps} />
                <GroupActions groupId={g.id} groupName={g.name} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
