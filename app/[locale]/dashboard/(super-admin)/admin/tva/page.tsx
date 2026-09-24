import { setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { buildVatReport, type VatSummary } from '@/lib/billing/vat-report';

export const dynamic = 'force-dynamic';

function eur(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export default async function AdminVatPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin(locale);

  const currentYear = new Date().getUTCFullYear();
  const asked = Number((await searchParams).year);
  const year = Number.isInteger(asked) && asked >= 2025 && asked <= currentYear ? asked : currentYear;

  let summary: VatSummary | null = null;
  let error: string | null = null;
  try {
    summary = (await buildVatReport(year)).summary;
  } catch (err) {
    error = err instanceof Error ? err.message : 'Erreur inconnue';
  }

  const years = Array.from({ length: currentYear - 2025 + 1 }, (_, i) => currentYear - i);

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>TVA à déclarer</h1>
      <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.6 }}>
        TVA collectée par SAS YUZU LABS sur l’année civile, pour la déclaration annuelle CA12 (formulaire 3517-S,
        régime réel simplifié) à déposer sur impots.gouv.fr → Espace professionnel → Déclarer → TVA.
      </p>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0 20px', flexWrap: 'wrap' }}>
        {years.map((y) => (
          <a
            key={y}
            href={`?year=${y}`}
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: '1px solid var(--border)', textDecoration: 'none',
              background: y === year ? 'var(--accent)' : 'var(--surface)',
              color: y === year ? '#fff' : 'var(--text)',
            }}
          >
            {y}
          </a>
        ))}
        <a
          href={`/api/admin/vat-report?year=${year}`}
          style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', color: 'var(--text)', textDecoration: 'none' }}
        >
          Télécharger le détail {year} (CSV)
        </a>
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: 'var(--danger-bg, #fef2f2)', color: 'var(--danger, #b91c1c)', fontSize: 13 }}>
          Impossible de calculer le rapport : {error}
        </div>
      )}

      {summary && summary.frenchInvoicesWithoutVat.length > 0 && (
        <div style={{ padding: 12, borderRadius: 8, marginBottom: 20, background: 'var(--warning-bg, #fffbeb)', border: '1px solid #f59e0b', color: 'var(--text)', fontSize: 13, lineHeight: 1.6 }}>
          ⚠️ {summary.frenchInvoicesWithoutVat.length} facture{summary.frenchInvoicesWithoutVat.length > 1 ? 's' : ''} à un client français
          sans TVA : {summary.frenchInvoicesWithoutVat.join(', ')}. Une vente en France porte toujours 20 % de TVA :
          vérifie qu’elle a été annulée par un avoir et refaite avec TVA, et que Stripe Tax a bien l’immatriculation France.
        </div>
      )}

      {summary && (
        <>
          <Section title={`TVA collectée ${year}`}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Taux</th>
                  <th style={thNum}>Base HT</th>
                  <th style={thNum}>TVA collectée</th>
                  <th style={thNum}>Opérations</th>
                </tr>
              </thead>
              <tbody>
                {summary.buckets.length === 0 && (
                  <tr><td style={td} colSpan={4}>Aucune opération sur {year}.</td></tr>
                )}
                {summary.buckets.map((b) => (
                  <tr key={b.ratePercent}>
                    <td style={td}>
                      {b.ratePercent === 0 ? 'Sans TVA (autoliquidation, export, ou facture émise sans TVA)' : `${String(b.ratePercent).replace('.', ',')} %`}
                    </td>
                    <td style={tdNum}>{eur(b.htCents)}</td>
                    <td style={tdNum}>{eur(b.vatCents)}</td>
                    <td style={tdNum}>{b.lines}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700 }}>
                  <td style={td}>Total</td>
                  <td style={tdNum}>{eur(summary.totalHtCents)}</td>
                  <td style={tdNum}>{eur(summary.totalVatCents)}</td>
                  <td style={tdNum} />
                </tr>
              </tbody>
            </table>
          </Section>

          <Section title="D’où ça vient">
            <table style={table}>
              <tbody>
                <tr><td style={td}>Factures Stripe (packs, abonnements Pro)</td><td style={tdNum}>{eur(summary.bySource.invoice.htCents)} HT</td><td style={tdNum}>{eur(summary.bySource.invoice.vatCents)} TVA</td></tr>
                <tr><td style={td}>Avoirs Stripe (en déduction)</td><td style={tdNum}>{eur(summary.bySource.credit_note.htCents)} HT</td><td style={tdNum}>{eur(summary.bySource.credit_note.vatCents)} TVA</td></tr>
                <tr><td style={td}>Frais de service sur pourboires (TVA incluse dans les frais affichés)</td><td style={tdNum}>{eur(summary.bySource.tip_fee.htCents)} HT</td><td style={tdNum}>{eur(summary.bySource.tip_fee.vatCents)} TVA</td></tr>
              </tbody>
            </table>
            <p style={note}>Les pourboires eux-mêmes ne sont pas soumis à la TVA et n’apparaissent pas ici.</p>
          </Section>

          <Section title="Pour remplir la CA12">
            <ol style={{ fontSize: 13, lineHeight: 1.8, paddingLeft: 18, margin: 0, color: 'var(--text-2, var(--text))' }}>
              <li>Opérations imposables au taux normal de 20 % : reporte la <strong>base HT</strong> et la <strong>TVA</strong> de la ligne « 20 % » ci-dessus.</li>
              <li>Opérations sans TVA : reporte leur base HT dans la partie « opérations non imposables » (ventes intracommunautaires autoliquidées, exportations).</li>
              <li><strong>TVA déductible</strong> : additionne la TVA de tes factures d’achat de l’année (tags, matériel, services avec TVA française). Elle n’est pas connue de l’app.</li>
              <li>Pour les achats de services à l’étranger (Vercel, Supabase, publicité…), déclare l’<strong>autoliquidation</strong> : même montant en TVA due et en TVA déductible.</li>
              <li>TVA nette due = TVA collectée − TVA déductible, moins les acomptes déjà versés en juillet et décembre.</li>
            </ol>
            <p style={note}>
              Échéance : 2ᵉ jour ouvré après le 1ᵉʳ mai de l’année suivante pour un exercice calé sur l’année civile.
              Garde le CSV avec tes factures : c’est le justificatif ligne à ligne en cas de contrôle.
            </p>
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: 'var(--text)' }}>{title}</h2>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 12, overflowX: 'auto' }}>
        {children}
      </div>
    </section>
  );
}

const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-subtle)' };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text)' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const note: React.CSSProperties = { fontSize: 12, color: 'var(--text-3)', marginTop: 10, lineHeight: 1.6 };
