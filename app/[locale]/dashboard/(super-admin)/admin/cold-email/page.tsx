import { setRequestLocale } from 'next-intl/server';
import { SireneScraperForm } from './SireneScraperForm';
import { ProspectsTable } from './ProspectsTable';
import { listProspects } from '@/actions/admin/cold-email';

export const dynamic = 'force-dynamic';

export default async function ProspectsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const res = await listProspects();
  const prospects = res.ok ? res.prospects : [];
  const error = res.ok ? null : res.error;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px', fontFamily: 'var(--font)' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', margin: '0 0 8px' }}>
        Prospection
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 24px', lineHeight: 1.5 }}>
        Scrape SIRENE pour alimenter le tableau, puis enrichis manuellement chaque prospect
        (email, LinkedIn, notes) et fais évoluer son statut au fil des contacts.
      </p>

      <SireneScraperForm />

      {error && (
        <div style={{ padding: 12, marginTop: 16, background: '#fee2e2', color: '#b91c1c', borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      <ProspectsTable initial={prospects} />
    </div>
  );
}
