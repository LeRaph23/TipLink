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
import { SOLUTIONS } from '@/content/solutions';

export function generateStaticParams() {
  return [{ locale: 'fr' }];
}

const TITLE = 'Le pourboire par carte, métier par métier';
const DESCRIPTION =
  'Restaurant, bar, café, salon de coiffure : ce que le pourboire dématérialisé change dans chaque métier, ce qu\'il rapporte et ce qu\'il coûte.';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== 'fr') return {};
  return buildPageMetadata({
    locale,
    path: '/solutions',
    title: TITLE,
    description: DESCRIPTION,
    locales: ['fr'],
  });
}

export default async function SolutionsHub({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'fr') notFound();
  setRequestLocale(locale);

  const url = `${BASE_URL}/fr/solutions`;
  const graph = jsonLdGraph([
    collectionPage({ name: TITLE, description: DESCRIPTION, url, locale }),
    breadcrumbList([
      { name: 'Accueil', url: `${BASE_URL}/fr` },
      { name: 'Solutions', url },
    ]),
    itemList(
      SOLUTIONS.map((s) => ({ name: s.trade, url: `${BASE_URL}/fr/solutions/${s.slug}` }))
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
            Métier par métier
          </h1>
          <p style={{ fontSize: 16, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 40, maxWidth: 620 }}>
            Le pourboire ne se comporte pas de la même façon selon le métier. Fréquence,
            montants, emplacement de la plaque, objections : voici ce qui change chez vous.
          </p>

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {SOLUTIONS.map((s) => (
              <Link
                key={s.slug}
                href={`/solutions/${s.slug}`}
                style={{
                  display: 'block', padding: 24, borderRadius: 14,
                  border: '1px solid var(--border-subtle)', background: 'var(--surface)',
                  textDecoration: 'none', color: 'inherit',
                }}
              >
                <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
                  {s.trade}
                </h2>
                <p style={{ fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.7 }}>
                  {s.cardSummary}
                </p>
              </Link>
            ))}
          </div>
        </main>
      </div>
    </>
  );
}
