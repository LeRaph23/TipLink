import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { createServiceClient } from '@/lib/supabase/service';
import { GroupFeeForm } from './GroupFeeForm';
import { PageHeader } from '@/components/dashboard/ui';

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.admin');

  const service = createServiceClient();
  const { data: group } = await service
    .from('groups')
    .select('id, name, legal_name, platform_fee_bps')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (!group) notFound();

  return (
    <div style={{ maxWidth: 440 }}>
      <PageHeader
        title={group.legal_name ?? group.name}
        subtitle={group.name}
        back={
          <Link
            href="/dashboard/admin/groups"
            style={{ fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none' }}
          >
            ← {t('groups.title')}
          </Link>
        }
      />

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', padding: 24,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
          {t('groups.feeLabel')}
        </div>
        <GroupFeeForm groupId={group.id} currentBps={group.platform_fee_bps ?? 200} />
      </div>
    </div>
  );
}
