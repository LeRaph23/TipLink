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
import { GUIDES } from '@/content/guides';

export function generateStaticParams() {
  return [{ locale: 'fr' }];
}

const TITLE = 'Guides : pourboires, exonération et réglementation';
const DESCRIPTION =
  'Des guides pratiques sur le pourboire en France : exonération jusqu\'en 2028, obligations de déclaration, et solutions de pourboire par carte.';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== 'fr') return {};
  return buildPageMetadata({
    locale,
    path: '/guides',
    title: TITLE,
    description: DESCRIPTION,
    locales: ['fr'],
  });
}

export default async function GuidesHub({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'fr') notFound();
  setRequestLocale(locale);

  const url = `${BASE_URL}/fr/guides`;
  const graph = jsonLdGraph([
    collectionPage({ name: TITLE, description: DESCRIPTION, url, locale }),
    breadcrumbList([
      { name: 'Accueil', url: `${BASE_URL}/fr` },
      { name: 'Guides', url },
    ]),
    itemList(
      GUIDES.map((g) => ({ name: g.cardTitle, url: `${BASE_URL}/fr/guides/${g.slug}` }))
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
            Guides
          </h1>
          <p style={{ fontSize: 16, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 40, maxWidth: 620 }}>
            Le pourboire en France : ce que dit la loi, ce que vous devez déclarer, et
            comment l&apos;encaisser maintenant que vos clients paient par carte.
          </p>

          <div style={{ display: 'grid', gap: 16 }}>
            {GUIDES.map((g) => (
              <Link
                key={g.slug}
                href={`/guides/${g.slug}`}
                style={{
                  display: 'block', padding: 24, borderRadius: 14,
                  border: '1px solid var(--border-subtle)', background: 'var(--surface)',
                  textDecoration: 'none', color: 'inherit',
                }}
              >
                <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
                  {g.cardTitle}
                </h2>
                <p style={{ fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.7 }}>
                  {g.cardSummary}
                </p>
              </Link>
            ))}
          </div>
        </main>
      </div>
    </>
  );
}
