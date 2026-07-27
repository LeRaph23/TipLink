import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { JsonLd } from '@/lib/seo/JsonLd';
import {
  BASE_URL,
  buildPageMetadata,
  breadcrumbList,
  personNode,
  jsonLdGraph,
} from '@/lib/seo';

// Exists to give the Article author node in lib/seo/json-ld.ts a real page to
// point at. On tax-adjacent content, identifiable authorship is one of the few
// E-E-A-T signals available to a site with no backlink profile yet.
export function generateStaticParams() {
  return [{ locale: 'fr' }];
}

const TITLE = 'À propos de Digitip';
const DESCRIPTION =
  'Digitip est édité par YUZU LABS SAS, société française immatriculée sous le SIREN 994 879 013. Qui est derrière le produit et pourquoi il existe.';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== 'fr') return {};
  return buildPageMetadata({
    locale,
    path: '/a-propos',
    title: TITLE,
    description: DESCRIPTION,
    locales: ['fr'],
  });
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'fr') notFound();
  setRequestLocale(locale);

  const url = `${BASE_URL}/fr/a-propos`;
  const graph = jsonLdGraph([
    personNode(),
    {
      '@type': 'AboutPage',
      name: TITLE,
      description: DESCRIPTION,
      url,
      inLanguage: 'fr-FR',
    },
    breadcrumbList([
      { name: 'Accueil', url: `${BASE_URL}/fr` },
      { name: 'À propos', url },
    ]),
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
            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.03em', color: '#E57A97' }}>DigiTip</span>
          </Link>
          <LanguageSwitcher />
        </header>

        <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>
          <Link href="/" style={{
            display: 'inline-block', marginBottom: 24,
            color: 'var(--text-3)', fontSize: 13, textDecoration: 'none',
          }}>← Accueil</Link>

          <h1 style={{
            fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 800,
            letterSpacing: '-0.03em', lineHeight: 1.08, marginBottom: 24,
          }}>
            À propos
          </h1>

          <div className="prose-article">
            <p>
              Digitip est une plaque NFC qui permet à un client de laisser un pourboire par
              carte en approchant son téléphone. La somme part sur le compte bancaire de la
              personne que le client a choisie.
            </p>

            <h2>Pourquoi</h2>
            <p>
              La carte a dépassé les espèces dans les paiements des Français, et la
              proportion est bien plus élevée encore en café et en restaurant. Le pourboire
              n&apos;a pas disparu parce que les clients sont devenus moins généreux, mais
              parce qu&apos;ils n&apos;ont plus de monnaie sur eux. Digitip existe pour
              rendre ce geste à nouveau possible, sans application à installer et sans
              obliger qui que ce soit.
            </p>

            <h2>Qui</h2>
            <p>
              Digitip est édité par <strong>YUZU LABS SAS</strong>, société par actions
              simplifiée immatriculée au Registre National des Entreprises sous le
              SIREN 994 879 013, dont le siège est au 11 rue de Lorraine, 68490
              Petit-Landau. Directeur de la publication : Raphaël Meyer.
            </p>
            <p>
              Le service est jeune. Nous préférons le dire plutôt que d&apos;afficher des
              chiffres de clientèle que nous n&apos;avons pas : les engagements listés sur
              la page d&apos;accueil sont tous vérifiables dans nos conditions de vente ou
              nos mentions légales.
            </p>

            <h2>Comment nous gagnons de l&apos;argent</h2>
            <p>
              La plaque est vendue une fois, sans abonnement. La plateforme prélève ensuite
              5 % sur les pourboires effectivement encaissés, plus des frais de service
              fixes par transaction. Sans pourboire, rien n&apos;est dû. Sur un pourboire
              de 10 €, le client règle 10,25 € : 9,50 € reviennent au bénéficiaire, 0,45 €
              couvrent les frais de paiement Stripe, 0,30 € reviennent à Digitip.
            </p>

            <h2>Nous écrire</h2>
            <p>
              Pour toute question sur le produit ou une commande :{' '}
              <a href="mailto:contact@digitip.app">contact@digitip.app</a>. Sur les données
              personnelles : <a href="mailto:privacy@digitip.app">privacy@digitip.app</a>.
            </p>
          </div>
        </main>
      </div>
    </>
  );
}
