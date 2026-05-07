import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createClient } from '@/lib/supabase/server';
import { listAuthUsersForAdmin } from '@/actions/admin/users';
import { UserRoleAddForm } from '@/components/dashboard/admin/UserRoleAddForm';
import { RemoveRoleButton } from '@/components/dashboard/admin/RemoveRoleButton';
import { DeleteUserButton } from '@/components/dashboard/admin/DeleteUserButton';

export default async function AdminUsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin(locale);
  const t = await getTranslations('dashboard.admin.users');
  const supabase = await createClient();

  const usersRes = await listAuthUsersForAdmin();
  if (!usersRes.ok) {
    return <div style={{ padding: 24, color: 'var(--error)' }}>{usersRes.error}</div>;
  }

  const { data: roles } = await supabase
    .from('user_roles')
    .select('id, user_id, role, group_id, establishment_id, created_at')
    .order('created_at', { ascending: false })
    .limit(1000);

  const emailById = new Map(usersRes.data.map((u) => [u.id, u.email ?? u.id]));
  for (const r of roles ?? []) {
    if (!emailById.has(r.user_id)) emailById.set(r.user_id, r.user_id);
  }

  const usersForForm = usersRes.data
    .filter((u) => u.email)
    .map((u) => ({ id: u.id, email: u.email! }));

  const [{ data: groups }, { data: establishments }] = await Promise.all([
    supabase.from('groups').select('id, name').is('deleted_at', null).order('name'),
    supabase.from('establishments').select('id, name').is('deleted_at', null).order('name'),
  ]);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>{t('title')}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>{t('subtitle')}</p>
      </div>

      <section style={{ marginBottom: 32, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700 }}>Comptes ({usersRes.data.length})</h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Email', 'Créé le', 'Dernière connexion', 'Actions'].map((h) => (
                <th key={h} style={{
                  padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                  color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em',
                  borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usersRes.data.map((u) => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '9px 14px', fontWeight: 500 }}>{u.email ?? u.id}</td>
                <td style={{ padding: '9px 14px', color: 'var(--text-3)' }}>
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td style={{ padding: '9px 14px', color: 'var(--text-3)' }}>
                  {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : '—'}
                </td>
                <td style={{ padding: '9px 14px' }}>
                  <DeleteUserButton userId={u.id} email={u.email ?? u.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginBottom: 32, padding: 20, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{t('addTitle')}</h2>
        <UserRoleAddForm
          users={usersForForm}
          groups={(groups ?? []).map((g) => ({ id: g.id, name: g.name }))}
          establishments={(establishments ?? []).map((e) => ({ id: e.id, name: e.name }))}
          labels={{
            user: t('fieldUser'),
            role: t('fieldRole'),
            group: t('fieldGroup'),
            establishment: t('fieldEstablishment'),
            submit: t('submitAdd'),
            super: t('kindSuper'),
            groupAdmin: t('kindGroupAdmin'),
            staffScoped: t('kindScoped'),
          }}
        />
      </section>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {[t('colEmail'), t('colRole'), t('colScope'), t('colActions')].map((h) => (
                <th key={h} style={{
                  padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
                  textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(roles ?? []).length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>{t('empty')}</td>
              </tr>
            )}
            {(roles ?? []).map((r) => {
              const scope =
                r.role === 'super_admin'
                  ? '—'
                  : r.role === 'group_admin'
                    ? (groups ?? []).find((g) => g.id === r.group_id)?.name ?? r.group_id ?? '—'
                    : (establishments ?? []).find((e) => e.id === r.establishment_id)?.name ?? r.establishment_id ?? '—';
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{emailById.get(r.user_id) ?? r.user_id}</td>
                  <td style={{ padding: '10px 14px' }}>{r.role}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-2)' }}>{scope}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <RemoveRoleButton roleRowId={r.id} label={t('remove')} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
