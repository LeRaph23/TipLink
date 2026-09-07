import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getBaseUrl } from '@/lib/env';
import { CreateSalonForm } from './CreateSalonForm';
import { PageHeader } from '@/components/dashboard/ui';

export default async function NewSalonPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const baseUrl = getBaseUrl();

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <PageHeader
          title="Nouvel établissement"
          subtitle="Crée le groupe et l'établissement, puis partage le lien de rejoindre avec l'équipe."
          back={
            <Link
              href="/dashboard/admin/groups"
              style={{ fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              ← Retour aux établissements
            </Link>
          }
        />
      </div>
      <CreateSalonForm baseUrl={baseUrl} />
    </div>
  );
}
