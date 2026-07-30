import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { ArticleLayout } from '@/components/content/ArticleLayout';
import { ComparisonTable } from '@/components/content/ComparisonTable';
import { JsonLd } from '@/lib/seo/JsonLd';
import {
  BASE_URL,
  buildPageMetadata,
  articleNode,
  breadcrumbList,
  faqPage,
  personNode,
  jsonLdGraph,
} from '@/lib/seo';
import { COMPARISONS, getComparison } from '@/content/comparatifs';

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ locale: 'fr', slug: c.slug }));
}

export const dynamicParams = false;

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const cmp = getComparison(slug);
  if (!cmp || locale !== 'fr') return {};
  return buildPageMetadata({
    locale,
    path: `/comparatif/${cmp.slug}`,
    title: cmp.title,
    description: cmp.description,
    locales: ['fr'],
    type: 'article',
    publishedTime: cmp.datePublished,
    modifiedTime: cmp.dateModified,
  });
}

export default async function ComparisonPage({ params }: Props) {
  const { locale, slug } = await params;
  if (locale !== 'fr') notFound();

  const cmp = getComparison(slug);
  if (!cmp) notFound();

  setRequestLocale(locale);

  const url = `${BASE_URL}/fr/comparatif/${cmp.slug}`;
  // No Review or AggregateRating node here, on purpose: self-assigned review
  // markup about a competitor is against Google's guidelines, and under
  // art. L122-1 s. a comparison must stay objective and verifiable rather than
  // evaluative.
  const graph = jsonLdGraph([
    personNode(),
    articleNode({
      headline: cmp.title,
      description: cmp.description,
      url,
      datePublished: cmp.datePublished,
      dateModified: cmp.dateModified,
      locale,
    }),
    breadcrumbList([
      { name: 'Accueil', url: `${BASE_URL}/fr` },
      { name: 'Comparatifs', url: `${BASE_URL}/fr/comparatif` },
      { name: cmp.competitor, url },
    ]),
    faqPage(cmp.faq),
  ]);

  const relatedLinks = cmp.related
    .map((s) => getComparison(s))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({ label: `Digitip ou ${c.competitor}`, href: `/comparatif/${c.slug}` }));

  return (
    <>
      <JsonLd data={graph} />
      <ArticleLayout
        meta={cmp}
        hubHref="/comparatif"
        hubLabel="Tous les comparatifs"
        relatedLinks={relatedLinks}
      >
        <p>
          Digitip et {cmp.competitor} répondent tous les deux au même problème de départ :
          vos clients paient par carte et ne laissent plus de pourboire. Les deux produits
          ne résolvent pas ce problème de la même manière, et l&apos;un des deux vous
          conviendra mieux selon votre situation.
        </p>
        <p>
          Cette page compare des faits publiés, avec la source et la date de vérification
          de chaque ligne. Elle ne porte pas de jugement sur la qualité de{' '}
          {cmp.competitor} — nous ne sommes pas neutres, et vous n&apos;auriez aucune
          raison de nous croire sur ce terrain.
        </p>

        <h2>Le tableau</h2>
        <ComparisonTable rows={cmp.rows} competitor={cmp.competitor} />

        <h2>Quand {cmp.competitor} est le meilleur choix</h2>
        <p>{cmp.bestFor}</p>

        <h2>Quand Digitip est le meilleur choix</h2>
        <p>
          Si vous voulez uniquement rendre le pourboire possible, sans toucher à votre
          caisse ni à votre parcours de paiement, et sans engagement mensuel. La plaque
          s&apos;achète une fois, s&apos;installe en deux minutes, et la commission de 5 %
          ne s&apos;applique qu&apos;aux pourboires réellement encaissés — sans pourboire,
          vous ne payez rien.
        </p>
        <p>
          C&apos;est aussi le bon choix si vous tenez à ce que la somme aille directement
          sur le compte bancaire de la personne que le client a choisie, sans transiter
          par l&apos;établissement : c&apos;est ce qui vous évite d&apos;avoir à encaisser,
          tracer et reverser des sommes qui ne vous reviennent pas.
        </p>

        <h2>Comment vérifier par vous-même</h2>
        <p>
          Trois questions à poser à n&apos;importe quel fournisseur, y compris nous : qui
          reçoit l&apos;argent et sur quel compte, que se passe-t-il les mois sans
          pourboire, et que devient le matériel si vous arrêtez. Les réponses à ces trois
          questions différencient les offres bien plus que les fonctionnalités affichées.
        </p>
      </ArticleLayout>
    </>
  );
}
