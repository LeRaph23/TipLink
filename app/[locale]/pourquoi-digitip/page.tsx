import { permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { JsonLd } from '@/lib/seo/JsonLd';
import { BASE_URL, buildPageMetadata, breadcrumbList, faqPage, jsonLdGraph, webPage } from '@/lib/seo';
import {
  COMPETITORS,
  EXAMPLE,
  FAQ,
  ROWS,
  SOURCES,
  TIP_CENTS,
  TPE_ROWS,
  VERIFIED,
  type Cell,
} from '@/content/comparatif';

// The comparison page: Digitip against the terminal and the tipping apps,
// every competitor figure sourced and dated (see content/comparatif.ts for the
// rules that keep this on the right side of art. L122-1 code de la
// consommation). French only, like the rest of the content: the competitors
// and the tax context are French.

export function generateStaticParams() {
  return [{ locale: 'fr' }];
}

const PATH = '/pourquoi-digitip';
const TITLE = 'Digitip ou les autres : comparatif du pourboire par carte';
const DESCRIPTION =
  "Digitip face à Onetip, Tipsi, Tap Tiiip et au pourboire sur TPE : ce qui est pris sur le pourboire, qui paie les frais, l'abonnement, l'avis Google.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== 'fr') return {};
  return buildPageMetadata({ locale, path: PATH, title: TITLE, description: DESCRIPTION, locales: ['fr'] });
}

const ACCENT = '#E57A97';

const euros = (cents: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

const frDate = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T00:00:00Z`));

const TONE: Record<Cell['tone'], { color: string; background: string; mark: string }> = {
  good: { color: '#166534', background: '#f0fdf4', mark: '✓' },
  neutral: { color: 'var(--text-2)', background: 'transparent', mark: '' },
  bad: { color: 'var(--text-2)', background: 'transparent', mark: '' },
  unknown: { color: 'var(--text-3)', background: 'transparent', mark: '' },
};

function SectionTitle({ kicker, children, sub }: { kicker: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28, maxWidth: 680 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: ACCENT, marginBottom: 8 }}>{kicker}</div>
      <h2 style={{ fontSize: 'clamp(22px, 3.4vw, 32px)', fontWeight: 850, letterSpacing: '-0.03em', lineHeight: 1.15, color: 'var(--text)' }}>
        {children}
      </h2>
      {sub && <p style={{ fontSize: 15.5, color: 'var(--text-2)', lineHeight: 1.7, marginTop: 12 }}>{sub}</p>}
    </div>
  );
}

/** One 10 € tip, drawn to scale: what reaches the team, what goes to fees, who pays them. */
function TipBars() {
  const scale = Math.max(...EXAMPLE.map((e) => e.customerPays));
  const pct = (cents: number) => `${(cents / scale) * 100}%`;
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {EXAMPLE.map((e) => {
        const isUs = e.key === 'digitip';
        const fees = e.customerPays - (e.teamMax ?? e.team);
        const range = e.teamMax ? e.teamMax - e.team : 0;
        // Digitip's fees sit on top of the tip; everyone else's come out of it.
        const feesOnTop = e.customerPays > TIP_CENTS;
        return (
          <div key={e.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{e.name}</span>
              <span style={{ fontSize: 13.5, color: 'var(--text-2)' }}>
                Le client paie <strong style={{ color: 'var(--text)' }}>{euros(e.customerPays)}</strong>
                {' · '}l’équipe reçoit{' '}
                <strong style={{ color: isUs ? '#166534' : 'var(--text)' }}>
                  {e.teamMax ? `${euros(e.team)} à ${euros(e.teamMax)}` : euros(e.team)}
                </strong>
              </span>
            </div>
            <div
              role="img"
              aria-label={`${e.name} : le client paie ${euros(e.customerPays)}, l'équipe reçoit ${e.teamMax ? `entre ${euros(e.team)} et ${euros(e.teamMax)}` : euros(e.team)}`}
              style={{ display: 'flex', height: 30, borderRadius: 8, overflow: 'hidden', background: 'var(--surface-2, #f1f1f4)' }}
            >
              <div style={{ width: pct(e.team), background: isUs ? ACCENT : '#9a9aae' }} />
              {range > 0 && (
                <div
                  title="Selon les frais bancaires"
                  style={{ width: pct(range), background: 'repeating-linear-gradient(45deg,#c9c9d6 0 6px,#e4e4ec 6px 12px)' }}
                />
              )}
              {fees > 0 && (
                <div style={{ width: pct(fees), background: feesOnTop ? '#F8C9D6' : '#e4e4ec', borderLeft: '2px solid var(--bg)' }} />
              )}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
              {feesOnTop
                ? `${euros(fees)} de frais payés en plus par le client, affichés avant qu’il paie · ${e.recurring}`
                : fees + range > 0
                  ? `${euros(fees + range)} ${range ? 'au plus ' : ''}retirés du pourboire · ${e.recurring}`
                  : e.recurring}
              {e.note && <> · {e.note}</>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CellView({ cell, highlight = false }: { cell: Cell; highlight?: boolean }) {
  const t = TONE[cell.tone];
  return (
    <td style={{
      padding: '14px 14px', verticalAlign: 'top', fontSize: 13.5, lineHeight: 1.5,
      color: t.color, background: highlight ? '#FEF6F8' : t.background,
      fontStyle: cell.tone === 'unknown' ? 'italic' : 'normal',
      fontWeight: highlight ? 650 : 400,
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      {t.mark && <span aria-hidden="true" style={{ marginRight: 6 }}>{t.mark}</span>}
      {cell.text}
    </td>
  );
}

function ComparisonGrid() {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 16, background: 'var(--surface)' }}>
      <table style={{ width: '100%', minWidth: 940, borderCollapse: 'separate', borderSpacing: 0 }}>
        <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Comparatif Digitip et applications de pourboire
        </caption>
        <thead>
          <tr>
            <th scope="col" style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface)', textAlign: 'left', padding: '16px 14px', fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600, borderBottom: '1.5px solid var(--border-subtle)', minWidth: 160 }}>
              Relevé le {frDate(VERIFIED)}
            </th>
            <th scope="col" style={{ textAlign: 'left', padding: '16px 14px', background: '#FEF6F8', borderBottom: `2px solid ${ACCENT}`, minWidth: 190 }}>
              <div style={{ fontSize: 15.5, fontWeight: 850, color: ACCENT }}>Digitip</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>Plaque NFC de pourboire</div>
            </th>
            {COMPETITORS.map((c) => (
              <th key={c.key} scope="col" style={{ textAlign: 'left', padding: '16px 14px', borderBottom: '1.5px solid var(--border-subtle)', minWidth: 128 }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text)' }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>{c.kind}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.criterion}>
              <th scope="row" style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface)', textAlign: 'left', padding: '14px', verticalAlign: 'top', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 14, fontWeight: 750, color: 'var(--text)' }}>{r.criterion}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 400, lineHeight: 1.45, marginTop: 3 }}>{r.why}</div>
              </th>
              <CellView cell={r.digitip} highlight />
              {COMPETITORS.map((c) => <CellView key={c.key} cell={r.others[c.key]} />)}
            </tr>
          ))}
          <tr>
            <th scope="row" style={{ position: 'sticky', left: 0, background: 'var(--surface)', textAlign: 'left', padding: '12px 14px', fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>
              Source
            </th>
            <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-3)', background: '#FEF6F8' }}>
              <Link href="/cgv" style={{ color: 'var(--text-2)' }}>Nos CGV</Link>
            </td>
            {COMPETITORS.map((c) => (
              <td key={c.key} style={{ padding: '12px 14px', fontSize: 12 }}>
                {c.sources.map((k, i) => (
                  <span key={k}>
                    {i > 0 && ', '}
                    <a href={SOURCES[k].url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'var(--text-2)' }}>
                      {i === 0 ? 'Leur site' : 'FAQ'}
                    </a>
                  </span>
                ))}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const card = {
  background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 22,
} as const;

export default async function WhyDigitipPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== 'fr') permanentRedirect(`/fr${PATH}`);
  setRequestLocale(locale);

  const url = `${BASE_URL}/fr${PATH}`;
  const graph = jsonLdGraph([
    webPage({ name: TITLE, description: DESCRIPTION, url, locale }),
    breadcrumbList([
      { name: 'Accueil', url: `${BASE_URL}/fr` },
      { name: 'Pourquoi Digitip', url },
    ]),
    faqPage(FAQ),
  ]);

  return (
    <>
      <JsonLd data={graph} />
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px clamp(16px,4vw,48px)',
          borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface)',
        }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.03em', color: ACCENT }}>DigiTip</span>
          </Link>
          <LanguageSwitcher />
        </header>

        <main style={{ maxWidth: 1100, margin: '0 auto', padding: '40px clamp(16px,4vw,32px) 90px' }}>
          <Link href="/" style={{ display: 'inline-block', marginBottom: 24, color: 'var(--text-3)', fontSize: 13, textDecoration: 'none' }}>
            ← Accueil
          </Link>

          {/* Hero */}
          <section style={{ marginBottom: 56 }}>
            <h1 style={{ fontSize: 'clamp(30px, 5.5vw, 52px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.04, maxWidth: 820, marginBottom: 18 }}>
              Pourquoi Digitip plutôt qu’une autre solution de pourboire ?
            </h1>
            <p style={{ fontSize: 17, color: 'var(--text-2)', lineHeight: 1.7, maxWidth: 720 }}>
              Le terminal de paiement, les applications de pourboire et Digitip font la même chose en
              apparence. La différence est dans les détails : ce qui est pris sur le pourboire, qui
              paie les frais, ce que vous payez chaque mois, et ce que ça vous rapporte en plus. Voici
              les chiffres, avec leurs sources.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 32 }}>
              {[
                { big: '100 %', label: 'du pourboire pour l’équipe', sub: 'Rien n’est retiré du montant choisi par le client.' },
                { big: '0 €', label: 'd’abonnement', sub: 'La plaque est payée une fois. Un mois sans pourboire ne coûte rien.' },
                { big: 'Inclus', label: 'l’avis Google après le pourboire', sub: 'Sans option payante.' },
              ].map((s) => (
                <div key={s.label} style={{ ...card, borderColor: '#FBDAE3', background: '#FEF6F8' }}>
                  <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.04em', color: ACCENT, lineHeight: 1 }}>{s.big}</div>
                  <div style={{ fontSize: 15, fontWeight: 750, marginTop: 8 }}>{s.label}</div>
                  <div style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.55 }}>{s.sub}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Worked example */}
          <section style={{ marginBottom: 64 }}>
            <SectionTitle
              kicker="Sur un pourboire de 10 €"
              sub={<>Le même pourboire de 10 €, d’une application à l’autre. Ailleurs, les frais sont retirés du pourboire, sans que le client le voie. Chez Digitip, ils sont ajoutés et affichés au client : votre équipe reçoit exactement ce qu’il a voulu donner.</>}
            >
              Ce qui arrive vraiment à votre équipe
            </SectionTitle>
            <div style={{ ...card, padding: 'clamp(18px,3vw,28px)' }}>
              <TipBars />
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 22, fontSize: 12.5, color: 'var(--text-3)' }}>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: ACCENT, marginRight: 6 }} />Reçu par l’équipe (Digitip)</span>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#F8C9D6', marginRight: 6 }} />Frais payés en plus par le client</span>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#e4e4ec', marginRight: 6 }} />Frais retirés du pourboire</span>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 12, lineHeight: 1.6 }}>
              Calculs à partir des tarifs publiés par chaque éditeur, relevés le {frDate(VERIFIED)}. Onetip :
              4 % plus des frais bancaires « d’au maximum 5 % », d’où la fourchette. Tipsi : 8 % TTC, taux
              qui peut varier selon le contrat de l’établissement. Tap Tiiip : exemple publié sur leur site.
            </p>
          </section>

          {/* Big table */}
          <section style={{ marginBottom: 64 }}>
            <SectionTitle
              kicker="Le comparatif complet"
              sub="Faites défiler le tableau horizontalement sur mobile. Chaque colonne renvoie à la page de l’éditeur d’où viennent les chiffres."
            >
              Digitip et les applications de pourboire
            </SectionTitle>
            <ComparisonGrid />
          </section>

          {/* Digitip vs TPE */}
          <section style={{ marginBottom: 64 }}>
            <SectionTitle
              kicker="Face au terminal de paiement"
              sub={<>Votre TPE sait sans doute déjà proposer un pourboire. L’activer ne coûte en général rien, mais l’argent arrive sur votre compte, mélangé à la recette, et la loi vous oblige à tout reverser (article L3244-1 du Code du travail). <Link href="/guides/pourboire-tpe" style={{ color: ACCENT }}>Notre guide du pourboire sur TPE</Link> détaille ce que ça implique.</>}
            >
              Pourquoi pas simplement l’option pourboire du TPE ?
            </SectionTitle>
            <div style={{ display: 'grid', gap: 12 }}>
              {TPE_ROWS.map((r) => (
                <div key={r.criterion} style={{ ...card, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', overflow: 'hidden' }}>
                  <div style={{ padding: '16px 18px', fontWeight: 750, fontSize: 14.5 }}>{r.criterion}</div>
                  <div style={{ padding: '16px 18px', background: '#FEF6F8', fontSize: 14, lineHeight: 1.55 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 750, color: ACCENT, marginBottom: 4 }}>Digitip</div>
                    {r.digitip}
                  </div>
                  <div style={{ padding: '16px 18px', fontSize: 14, lineHeight: 1.55, color: 'var(--text-2)' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 750, color: 'var(--text-3)', marginBottom: 4 }}>Pourboire sur TPE</div>
                    {r.tpe}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Google reviews */}
          <section style={{ marginBottom: 64 }}>
            <div style={{ ...card, padding: 'clamp(22px,4vw,36px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: ACCENT, marginBottom: 8 }}>Ce que le TPE ne fait pas</div>
                <h2 style={{ fontSize: 'clamp(22px,3.2vw,30px)', fontWeight: 850, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 12 }}>
                  Un client qui vient de laisser un pourboire est content. C’est le moment de lui demander un avis.
                </h2>
                <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.7 }}>
                  Juste après le pourboire, Digitip propose au client de laisser un avis Google sur votre
                  établissement, en un bouton. Des avis récents et réguliers font remonter votre fiche dans
                  Google Maps. Chez Digitip, c’est inclus. Ailleurs, c’est une option payante, réservée à un
                  abonnement, ou absent.
                </p>
              </div>
              <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
                {['Le client approche son téléphone de la plaque', 'Il choisit la personne et le montant, paie avec Apple Pay, Google Pay ou sa carte', 'L’écran de remerciement lui propose de laisser un avis Google', 'Il met sa note : votre fiche gagne un avis récent'].map((s, i) => (
                  <li key={s} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 14.5, lineHeight: 1.5 }}>
                    <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 13, background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* Honest section */}
          <section style={{ marginBottom: 64 }}>
            <SectionTitle
              kicker="En toute honnêteté"
              sub="Digitip ne convient pas à tout le monde. Voici les cas où une autre solution sera plus adaptée."
            >
              Quand choisir autre chose
            </SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
              {[
                { title: 'Vous voulez que l’argent aille directement aux salariés', body: 'Avec Digitip, les pourboires arrivent sur le compte de l’établissement et vous les reversez avec la paie, relevé par salarié à l’appui. Onetip ou Tipsi versent directement à chaque salarié : plus de démarches pour eux, moins pour vous.' },
                { title: 'Vous voulez refondre tout le paiement à table', body: 'Sunday fait payer l’addition par QR code à table, intégré à votre caisse, pourboire compris. C’est un autre produit, plus large, avec sa propre commission.' },
                { title: 'Votre TPE propose déjà le pourboire et vous partagez tout en pot commun', body: 'L’activer ne coûte que la commission bancaire. Si le moment du choix au terminal ne vous gêne pas et que le suivi par personne ne vous sert à rien, commencez par là.' },
              ].map((c) => (
                <div key={c.title} style={card}>
                  <h3 style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 8, lineHeight: 1.35 }}>{c.title}</h3>
                  <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.65 }}>{c.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* FAQ */}
          <section style={{ marginBottom: 56, maxWidth: 780 }}>
            <h2 style={{ fontSize: 24, fontWeight: 850, letterSpacing: '-0.03em', marginBottom: 14 }}>Questions fréquentes</h2>
            {FAQ.map((f) => (
              <details key={f.question} style={{ borderTop: '1px solid var(--border-subtle)', padding: '15px 0' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 15.5, color: 'var(--text)', listStyle: 'revert' }}>{f.question}</summary>
                <p style={{ fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.8, marginTop: 10 }}>{f.answer}</p>
              </details>
            ))}
          </section>

          {/* CTA */}
          <section style={{ borderRadius: 20, padding: 'clamp(28px,5vw,48px)', background: 'linear-gradient(135deg,#B03860,#E57A97)', color: '#fff', textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontSize: 'clamp(24px,4vw,36px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 12 }}>
              Votre équipe reçoit tout. Vous ne payez rien chaque mois.
            </h2>
            <p style={{ fontSize: 16, opacity: 0.92, marginBottom: 24 }}>Une plaque, payée une fois, garantie à vie. Livraison offerte.</p>
            <Link href="/pricing" style={{ display: 'inline-block', padding: '14px 30px', borderRadius: 12, background: '#fff', color: ACCENT, fontWeight: 850, fontSize: 16, textDecoration: 'none' }}>
              Voir les packs →
            </Link>
          </section>

          {/* Sources */}
          <section style={{ maxWidth: 780 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Sources</h2>
            <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 12 }}>
              Les informations sur les autres solutions proviennent de leurs pages publiques, consultées le{' '}
              {frDate(VERIFIED)}. Elles peuvent avoir changé depuis : vérifiez-les avant de décider. Une
              erreur ? <Link href="/contact" style={{ color: 'var(--text-2)' }}>Écrivez-nous</Link>, nous la corrigerons.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              {Object.values(SOURCES).map((s) => (
                <li key={s.url} style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'var(--text-2)' }}>{s.label}</a>
                  {', consulté le '}{frDate(s.verifiedOn)}
                </li>
              ))}
            </ul>
          </section>
        </main>
      </div>
    </>
  );
}
