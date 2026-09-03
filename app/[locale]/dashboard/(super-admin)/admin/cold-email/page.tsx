import { setRequestLocale } from 'next-intl/server';
import { SireneScraperForm } from './SireneScraperForm';
import { ProspectsTable } from './ProspectsTable';
import { ColdBatchPanel } from './ColdBatchPanel';
import { listProspects, getColdEmailStats } from '@/actions/admin/cold-email';

export const dynamic = 'force-dynamic';

export default async function ProspectsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [listRes, ambStats, comStats] = await Promise.all([
    listProspects(),
    getColdEmailStats('ambassador'),
    getColdEmailStats('commercial'),
  ]);

  const prospects = listRes.ok ? listRes.prospects : [];
  const error = listRes.ok ? null : listRes.error;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px', fontFamily: 'var(--font)' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', margin: '0 0 8px' }}>
        Prospection
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 24px', lineHeight: 1.5 }}>
        Scrape SIRENE pour alimenter le tableau, enrichis manuellement chaque prospect, puis lance
        une vague d&apos;envoi par programme. Les Ambassadeurs partent via Resend (digitip.app),
        les Commerciaux Pros via Brevo (partenaires.digitip.app), réputations isolées.
      </p>

      <ColdBatchPanel
        ambassadorStats={ambStats.ok ? ambStats.stats : null}
        commercialStats={comStats.ok ? comStats.stats : null}
      />

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
