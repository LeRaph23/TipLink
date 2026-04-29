import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getBaseUrl } from '@/lib/env';
import { CreateSalonForm } from './CreateSalonForm';

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
        <Link
          href="/dashboard/admin/groups"
          style={{ fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 12 }}
        >
          ← Retour aux salons
        </Link>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          Nouveau salon
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
          Crée le groupe et l&apos;établissement, puis partage le lien de rejoindre avec les coiffeurs.
        </p>
      </div>
      <CreateSalonForm baseUrl={baseUrl} />
    </div>
  );
}
