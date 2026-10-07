import { setRequestLocale, getTranslations } from 'next-intl/server';
import { LegalPage } from '@/components/legal/LegalPage';
import { legalNavLinks } from '@/lib/legal/nav';
import { buildPageMetadata } from '@/lib/seo';

// Article 28 GDPR agreement between each establishment (controller of its
// staff's data) and Digitip (processor). Accepted with the CGU in the wizard.

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.dpa' });
  return buildPageMetadata({
    locale,
    path: '/dpa',
    title: `${t('title')} · Digitip`,
    description: t('intro').slice(0, 155),
  });
}

export default async function DpaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('legal.dpa');
  const tl = await getTranslations('legal');
  const tc = await getTranslations('common');

  const sections = (['s1','s2','s3','s4','s5','s6','s7'] as const).map((k) => ({
    title: t(`${k}Title`), body: t(`${k}Body`),
  }));

  return (
    <LegalPage
      title={t('title')}
      intro={t('intro')}
      sections={sections}
      lastUpdatedLabel={tl('lastUpdated')}
      lastUpdatedDate={tl('updatedDate')}
      backLabel={tl('backHome')}
      navLinks={legalNavLinks(tc)}
      currentPath="/dpa"
    />
  );
}
