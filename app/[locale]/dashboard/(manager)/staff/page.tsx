import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { Link } from '@/i18n/navigation';
import { getBaseUrl } from '@/lib/env';
import { StaffInviteCopy } from './StaffInviteCopy';
import { MissingEmailRepair } from './MissingEmailRepair';
import { joinAsStaffMember } from '@/actions/staff';
import { Icon } from '@/components/ambassadeur/icons';

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
      deleted_at,
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

  // Check if the current group admin already has a staff profile
  const isGroupAdmin = !!(roleRow?.group_id);
  const { data: adminStaffProfile } = user && isGroupAdmin
    ? await service
        .from('staff_profiles')
        .select('id')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .maybeSingle()
    : { data: null };
  const adminHasStaffProfile = !!adminStaffProfile;

  // Fetch emails for staff who have joined (have a user_id).
  // Supabase auth.admin.listUsers paginates by 50 — batch the lookups so that
  // a tenant with hundreds of staff doesn't trigger O(N) sequential calls.
  const userIds = (staffMembers ?? []).filter((s) => s.user_id).map((s) => s.user_id!);
  const emailMap = new Map<string, string>();
  if (userIds.length > 0) {
    const wanted = new Set(userIds);
    const PAGE_SIZE = 200;
    let page = 1;
    while (wanted.size > 0 && page <= 50) {
      const { data: list } = await service.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
      const users = list?.users ?? [];
      if (users.length === 0) break;
      for (const u of users) {
        if (u.email && wanted.has(u.id)) {
          emailMap.set(u.id, u.email);
          wanted.delete(u.id);
        }
      }
      if (users.length < PAGE_SIZE) break;
      page++;
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

      {/* Profiles created without an email: no account, no invite, and no way
          to ever be paid. Surfaced first because it is the only blocker here
          that silently caps revenue. */}
      <MissingEmailRepair
        staff={(staffMembers ?? [])
          .filter((s) => !s.user_id)
          .map((s) => ({ id: s.id, fullName: s.full_name }))}
      />

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

      {/* CTA for group admin to join as staff member */}
      {isGroupAdmin && !adminHasStaffProfile && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(229,122,151,0.12), rgba(236,151,176,0.07))',
          border: '1.5px solid rgba(229,122,151,0.35)',
          borderRadius: 'var(--radius)', padding: '18px 20px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ flexShrink: 0, marginTop: 2, color: '#E57A97' }}><Icon name="bank" size={26} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                Vous aussi, recevez des pourboires directement
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 14 }}>
                En tant qu&apos;administrateur, vous pouvez apparaître dans la liste de l&apos;équipe et recevoir des pourboires. Ils arrivent sur le compte de l&apos;établissement, comme pour le reste de l&apos;équipe.
              </div>
              <form action={async () => {
                'use server';
                const result = await joinAsStaffMember();
                if ('ok' in result) redirect('/dashboard/staff');
              }}>
                <button type="submit" style={{
                  padding: '10px 18px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #E57A97, #EC97B0)',
                  color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'var(--font)', boxShadow: '0 4px 14px rgba(229,122,151,0.3)',
                }}>
                  M&apos;ajouter à l&apos;équipe →
                </button>
              </form>
            </div>
          </div>
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
                      {(() => {
                        const isPending = !s.is_active && !s.deleted_at && s.user_id;
                        const isActive = s.is_active;
                        return (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 600,
                            background: isActive ? 'var(--success-bg)' : isPending ? 'var(--warning-bg, #fff8e6)' : 'var(--neutral-bg)',
                            color: isActive ? 'var(--success)' : isPending ? 'var(--warning, #b98900)' : 'var(--text-3)',
                            whiteSpace: 'nowrap',
                          }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                            {isActive ? t('active') : isPending ? 'En attente' : t('inactive')}
                          </span>
                        );
                      })()}
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
