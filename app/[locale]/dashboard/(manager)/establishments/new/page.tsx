import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CreateEstablishmentForm } from './CreateEstablishmentForm';

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
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          {t('create')}
        </h1>
      </div>
      <CreateEstablishmentForm />
    </div>
  );
}
