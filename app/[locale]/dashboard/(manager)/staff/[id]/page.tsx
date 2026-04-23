import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { StaffDetailForm } from './StaffDetailForm';

export default async function StaffDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const t = await getTranslations('dashboard.staff');

  const { data: staff } = await supabase
    .from('staff_profiles')
    .select('id, full_name, avatar_url, is_active, onboarding_status, stripe_account_id, user_id, establishment_id, establishments(name)')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!staff) {
    return (
      <div style={{ maxWidth: 520 }}>
        <Link href="/dashboard/staff" style={{ fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none' }}>
          ← {t('new.back')}
        </Link>
        <p style={{ marginTop: 16, color: 'var(--text-2)' }}>{t('detail.notFound')}</p>
      </div>
    );
  }

  const { data: recentTips } = await supabase
    .from('transactions')
    .select('id, amount, currency, created_at, status')
    .eq('staff_id', id)
    .eq('status', 'succeeded')
    .order('created_at', { ascending: false })
    .limit(5);

  const est = Array.isArray(staff.establishments) ? staff.establishments[0] : staff.establishments;

  const payoutLabel =
    staff.onboarding_status === 'complete'
      ? t('detail.payoutComplete')
      : staff.onboarding_status === 'pending'
        ? t('detail.payoutPending')
        : t('detail.payoutNotStarted');
  const payoutColor =
    staff.onboarding_status === 'complete' ? 'var(--success)' :
    staff.onboarding_status === 'pending'  ? 'var(--warning)' :
    'var(--text-3)';

  return (
    <div style={{ maxWidth: 640 }}>
      <Link href="/dashboard/staff" style={{ fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none', display: 'inline-block', marginBottom: 20 }}>
        ← {t('new.back')}
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        {staff.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={staff.avatar_url}
            alt={staff.full_name}
            style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'var(--accent)', color: 'var(--accent-fg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700,
          }}>
            {staff.full_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
            {staff.full_name}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>{est?.name ?? '—'}</p>
        </div>
      </div>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', padding: 16, marginBottom: 24,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
            {t('detail.payoutStatus')}
          </div>
          <div style={{ fontSize: 13.5, color: payoutColor, fontWeight: 500 }}>
            {payoutLabel}
          </div>
        </div>
      </div>

      <StaffDetailForm
        staffId={staff.id}
        initialFullName={staff.full_name}
        initialAvatarUrl={staff.avatar_url}
        isActive={staff.is_active}
        labels={{
          fullName: t('detail.editName'),
          fullNameHint: t('detail.editNameHint'),
          avatar: t('detail.avatar'),
          save: t('detail.save'),
          saving: t('detail.saving'),
          saved: t('detail.saved'),
          deactivate: t('detail.deactivate'),
          deactivateConfirm: t('detail.deactivateConfirm'),
          inactive: t('inactive'),
        }}
      />

      {recentTips && recentTips.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>
            {t('detail.recentTips')}
          </h2>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius)', overflow: 'hidden',
          }}>
            {recentTips.map((tx, i) => (
              <div key={tx.id} style={{
                padding: '10px 16px', display: 'flex', justifyContent: 'space-between',
                fontSize: 13,
                borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
              }}>
                <span style={{ color: 'var(--text-3)' }}>
                  {new Date(tx.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                  {new Intl.NumberFormat(locale, {
                    style: 'currency',
                    currency: tx.currency || 'EUR',
                  }).format(tx.amount / 100)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
