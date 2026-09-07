import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CreateEstablishmentForm } from './CreateEstablishmentForm';
import { PageHeader } from '@/components/dashboard/ui';

export default async function NewEstablishmentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.establishments');

  return (
    <div style={{ maxWidth: 480 }}>
      <PageHeader title={t('create')} />
      <CreateEstablishmentForm />
    </div>
  );
}
