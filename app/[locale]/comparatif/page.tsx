import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { JsonLd } from '@/lib/seo/JsonLd';
import {
  BASE_URL,
  buildPageMetadata,
  collectionPage,
  breadcrumbList,
  itemList,
  jsonLdGraph,
} from '@/lib/seo';
import { COMPARISONS } from '@/content/comparatifs';

export function generateStaticParams() {
  return [{ locale: 'fr' }];
}

const TITLE = 'Comparatif des solutions de pourboire (2026)';
const DESCRIPTION =
  'Digitip face aux autres solutions de pourboire dématérialisé : périmètre, matériel, modèle de prix et destinataire des fonds, sources à l\'appui.';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== 'fr') return {};
  return buildPageMetadata({
    locale,
    path: '/comparatif',
    title: TITLE,
    description: DESCRIPTION,
    locales: ['fr'],
  });
}

export default async function ComparisonHub({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'fr') notFound();
  setRequestLocale(locale);

  const url = `${BASE_URL}/fr/comparatif`;
  const graph = jsonLdGraph([
    collectionPage({ name: TITLE, description: DESCRIPTION, url, locale }),
    breadcrumbList([
      { name: 'Accueil', url: `${BASE_URL}/fr` },
      { name: 'Comparatifs', url },
    ]),
    itemList(
      COMPARISONS.map((c) => ({
        name: `Digitip ou ${c.competitor}`,
        url: `${BASE_URL}/fr/comparatif/${c.slug}`,
      }))
    ),
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

        <main style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 80px' }}>
          <Link href="/" style={{
            display: 'inline-block', marginBottom: 24,
            color: 'var(--text-3)', fontSize: 13, textDecoration: 'none',
          }}>← Accueil</Link>

          <h1 style={{
            fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 800,
            letterSpacing: '-0.03em', lineHeight: 1.08, marginBottom: 14,
          }}>
            Comparatifs
          </h1>
          <p style={{ fontSize: 16, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 16, maxWidth: 620 }}>
            Nous ne sommes pas neutres, et vous n&apos;avez aucune raison de nous croire
            sur parole. Ces pages ne comparent donc que des faits publiés, avec la source
            et la date de vérification de chaque ligne, et disent dans quel cas le
            concurrent est le meilleur choix.
          </p>

          <div style={{ display: 'grid', gap: 16 }}>
            {COMPARISONS.map((c) => (
              <Link
                key={c.slug}
                href={`/comparatif/${c.slug}`}
                style={{
                  display: 'block', padding: 24, borderRadius: 14,
                  border: '1px solid var(--border-subtle)', background: 'var(--surface)',
                  textDecoration: 'none', color: 'inherit',
                }}
              >
                <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
                  Digitip ou {c.competitor} ?
                </h2>
                <p style={{ fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.7 }}>
                  {c.cardSummary}
                </p>
              </Link>
            ))}
          </div>
        </main>
      </div>
    </>
  );
}
