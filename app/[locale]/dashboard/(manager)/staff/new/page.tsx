import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { InviteStaffForm } from './InviteStaffForm';

export default async function NewStaffPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const t = await getTranslations('dashboard.staff');

  const { data: establishments } = await supabase
    .from('establishments')
    .select('id, name')
    .is('deleted_at', null)
    .order('name');

  return (
    <div style={{ maxWidth: 520 }}>
      <Link href="/dashboard/staff" style={{
        fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none',
        display: 'inline-block', marginBottom: 20,
      }}>
        ← {t('new.back')}
      </Link>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          {t('new.title')}
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.6 }}>
          {t('new.subtitle')}
        </p>
      </div>
      <InviteStaffForm
        establishments={establishments ?? []}
        labels={{
          fullName: t('new.fullName'),
          fullNameHint: t('new.fullNameHint'),
          fullNamePlaceholder: t('new.fullNamePlaceholder'),
          email: t('new.email'),
          establishment: t('new.establishment'),
          role: t('new.role'),
          roleStaff: t('new.roleStaff'),
          roleManager: t('new.roleManager'),
          send: t('new.send'),
          sending: t('new.sending'),
          sentTemplate: t.raw('new.sent') as string,
          errorGeneric: t('new.errorGeneric'),
        }}
      />
    </div>
  );
}
