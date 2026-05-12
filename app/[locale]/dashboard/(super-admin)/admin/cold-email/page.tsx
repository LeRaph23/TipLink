import { setRequestLocale } from 'next-intl/server';
import { ColdEmailImporter } from './ColdEmailImporter';
import { getColdEmailStats } from '@/actions/admin/cold-email';

export const dynamic = 'force-dynamic';

export default async function ColdEmailPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const statsResult = await getColdEmailStats();
  const stats = statsResult.ok ? statsResult.stats : null;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px', fontFamily: 'var(--font)' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', margin: '0 0 8px' }}>
        Cold email B2B
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 24px', lineHeight: 1.5 }}>
        Importe une liste de prospects SIRENE (auto-entrepreneurs commerciaux récents). Le cron envoie automatiquement
        la séquence à 3 mails (J / J+3 / J+8) avec footer RGPD + désinscription. Max 50 mails/h pour préserver la deliverability.
      </p>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 24 }}>
          <Stat label="Total" value={stats.total} />
          <Stat label="Nouveaux" value={stats.step0} />
          <Stat label="Mail 1 envoyé" value={stats.step1} />
          <Stat label="Mail 2 envoyé" value={stats.step2} />
          <Stat label="Séquence finie" value={stats.step3} />
          <Stat label="Réponses" value={stats.replied} accent />
          <Stat label="Désinscrits" value={stats.unsubscribed} />
        </div>
      )}

      <ColdEmailImporter />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 14 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ? 'var(--success, #22c55e)' : 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}
