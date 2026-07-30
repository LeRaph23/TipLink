import { setRequestLocale, getTranslations } from 'next-intl/server';
import { LegalPage } from '@/components/legal/LegalPage';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'cgv' });
  // Legal pages previously set only a title + canonical. A missing
  // description leaves Google to invent the snippet from the page body,
  // which on a terms page is a wall of clauses.
  return buildPageMetadata({
    locale,
    path: '/cgv',
    title: `${t('title')} · Digitip`,
    description: t('intro').slice(0, 155),
  });
}

export default async function CGVPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('cgv');
  const tl = await getTranslations('legal');
  const tc = await getTranslations('common');

  const sections = (['s1','s2','s3','s4','s5','s6','s7','s8','s9','s10','s11'] as const).map((k) => ({
    title: t(`${k}Title`), body: t(`${k}Body`),
  }));

  const navLinks = [
    { label: tc('mentionsLegales'), href: '/mentions-legales' as const },
    { label: tc('cgv'),             href: '/cgv'              as const },
    { label: tc('terms'),           href: '/terms'            as const },
    { label: tc('privacy'),         href: '/privacy'          as const },
  ];

  return (
    <LegalPage
      title={t('title')}
      intro={t('intro')}
      sections={sections}
      lastUpdatedLabel={tl('lastUpdated')}
      lastUpdatedDate={tl('updatedDate')}
      backLabel={tl('backHome')}
      navLinks={navLinks}
      currentPath="/cgv"
    />
  );
}
