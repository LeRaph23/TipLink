import { setRequestLocale, getTranslations } from 'next-intl/server';
import { LegalPage } from '@/components/legal/LegalPage';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.terms' });
  return { title: `${t('title')} · TipLink` };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('legal.terms');
  const tl = await getTranslations('legal');
  const tc = await getTranslations('common');

  const sectionKeys = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11'] as const;
  const sections = sectionKeys.map((k) => ({
    title: t(`${k}Title`),
    body: t(`${k}Body`),
  }));

  return (
    <LegalPage
      title={t('title')}
      intro={t('intro')}
      sections={sections}
      lastUpdatedLabel={tl('lastUpdated')}
      lastUpdatedDate={tl('updatedDate')}
      backLabel={tl('backHome')}
      pricingLabel={tc('pricing')}
      contactLabel={tc('contact')}
      privacyLabel={tc('privacy')}
      termsLabel={tc('terms')}
      currentPath="/terms"
    />
  );
}
