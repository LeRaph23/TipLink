import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { validatePack } from '@/lib/order-validation';
import { OrderWizard } from './OrderWizard';

export default async function OrderPage({
  params,
}: {
  params: Promise<{ locale: string; pack: string }>;
}) {
  const { locale, pack } = await params;
  setRequestLocale(locale);

  if (!validatePack(pack)) {
    notFound();
  }

  return (
    <Suspense>
      <OrderWizard pack={pack} locale={locale} />
    </Suspense>
  );
}

export function generateStaticParams() {
  return [
    { pack: 'solo' },
    { pack: 'duo' },
  ];
}
