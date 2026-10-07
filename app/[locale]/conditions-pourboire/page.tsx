import { setRequestLocale, getTranslations } from 'next-intl/server';
import { LegalPage } from '@/components/legal/LegalPage';
import { legalNavLinks } from '@/lib/legal/nav';
import { buildPageMetadata } from '@/lib/seo';

// Conditions for the consumer who leaves a tip and pays the service fee.
// Linked from every tip page (footer and the notice under the pay button).

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.tipTerms' });
  return buildPageMetadata({
    locale,
    path: '/conditions-pourboire',
    title: `${t('title')} · Digitip`,
    description: t('intro').slice(0, 155),
  });
}

export default async function TipTermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('legal.tipTerms');
  const tl = await getTranslations('legal');
  const tc = await getTranslations('common');

  const sections = (['s1','s2','s3','s4','s5','s6','s7','s8'] as const).map((k) => ({
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
      currentPath="/conditions-pourboire"
    />
  );
}
