import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { Link } from '@/i18n/navigation';
import { getBaseUrl } from '@/lib/env';
import { StaffInviteCopy } from './StaffInviteCopy';

export default async function StaffListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const t = await getTranslations('dashboard.staff');
  const tc = await getTranslations('common');

  const { data: staffMembers } = await supabase
    .from('staff_profiles')
    .select(`
      id,
      full_name,
      avatar_url,
      is_active,
      onboarding_status,
      stripe_account_id,
      user_id,
      establishments (id, name)
    `)
    .is('deleted_at', null)
    .order('full_name');

  const service = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: roleRow } = user
    ? await supabase
        .from('user_roles')
        .select('group_id')
        .in('role', ['group_admin', 'super_admin'])
        .eq('user_id', user.id)
        .not('group_id', 'is', null)
        .limit(1)
        .maybeSingle()
    : { data: null };

  const { data: est } = roleRow?.group_id
    ? await service
        .from('establishments')
        .select('id, name')
        .eq('group_id', roleRow.group_id)
        .is('deleted_at', null)
        .limit(1)
        .single()
    : { data: null };

  const joinUrl = est ? `${getBaseUrl()}/join/${est.id}` : null;

  // Fetch emails for staff who have joined (have a user_id)
  const userIds = (staffMembers ?? []).filter((s) => s.user_id).map((s) => s.user_id!);
  const emailMap = new Map<string, string>();
  if (userIds.length > 0) {
    const results = await Promise.all(userIds.map((id) => service.auth.admin.getUserById(id)));
    for (const r of results) {
      if (r.data?.user?.email) emailMap.set(r.data.user.id, r.data.user.email);
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        gap: 16, marginBottom: 16,
      }}>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
            {t('title')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>{t('subtitle')}</p>
        </div>
        <Link href="/dashboard/staff/new" style={{
          padding: '9px 16px', borderRadius: 'var(--radius)',
          background: 'var(--accent)', color: 'var(--accent-fg)',
          fontSize: 13, fontWeight: 600, textDecoration: 'none',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {t('addButton')} {tc('arrowRight')}
        </Link>
      </div>

      {/* Invitation link card */}
      {joinUrl && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Lien d&apos;invitation équipe
          </div>
          <StaffInviteCopy url={joinUrl} establishmentName={est?.name ?? ''} />
        </div>
      )}

      {/* Staff table */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {[t('colName'), 'Email', t('colEstablishment'), t('colPayout'), t('colStatus'), ''].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: '10px 16px', textAlign: i === 5 ? 'right' : 'left',
                      fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
                      textTransform: 'uppercase', letterSpacing: '0.07em',
                      borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                      background: 'var(--surface-2)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(!staffMembers || staffMembers.length === 0) && (
                <tr>
                  <td colSpan={6} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-3)' }}>
                    {t('empty')}
                  </td>
                </tr>
              )}
              {staffMembers?.map((s) => {
                const estRow = Array.isArray(s.establishments) ? s.establishments[0] : s.establishments;
                const email = s.user_id ? emailMap.get(s.user_id) : undefined;
                const payoutLabel =
                  s.onboarding_status === 'complete'
                    ? t('detail.payoutComplete')
                    : s.onboarding_status === 'pending'
                      ? t('detail.payoutPending')
                      : s.user_id
                        ? t('detail.payoutNotStarted')
                        : t('invited');
                const payoutColor =
                  s.onboarding_status === 'complete' ? 'var(--success)' :
                  s.onboarding_status === 'pending'  ? 'var(--warning)' :
                  'var(--text-3)';
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text)' }}>
                      {s.full_name}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {email ? (
                        <a href={`mailto:${email}`} style={{ color: 'var(--text-2)', fontSize: 12.5, textDecoration: 'none' }}>
                          {email}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-3)', fontSize: 12.5 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-2)' }}>
                      {estRow?.name ?? '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12.5, color: payoutColor }}>
                      {payoutLabel}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 600,
                        background: s.is_active ? 'var(--success-bg)' : 'var(--neutral-bg)',
                        color: s.is_active ? 'var(--success)' : 'var(--text-3)',
                        whiteSpace: 'nowrap',
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                        {s.is_active ? t('active') : t('inactive')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <Link href={`/dashboard/staff/${s.id}`} style={{
                        fontSize: 12.5, fontWeight: 500,
                        color: 'var(--text-2)', textDecoration: 'none',
                        padding: '4px 10px', borderRadius: 6,
                        border: '1px solid var(--border)',
                      }}>
                        {t('view')}
                      </Link>
                    </td>
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
