import { setRequestLocale, getTranslations } from 'next-intl/server';
import { LegalPage } from '@/components/legal/LegalPage';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'mentions' });
  return { title: `${t('title')} · Digitip` };
}

export default async function MentionsLegalesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('mentions');
  const tl = await getTranslations('legal');
  const tc = await getTranslations('common');

  const sections = (['s1','s2','s3','s4','s5','s6','s7'] as const).map((k) => ({
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
      currentPath="/mentions-legales"
    />
  );
}
