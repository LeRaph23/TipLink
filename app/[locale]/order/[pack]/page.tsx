import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { validatePack } from '@/lib/order-validation';
import { createClient } from '@/lib/supabase/server';
import { getAllPackPricing } from '@/lib/mangopay/pricing';
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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Pricing comes from Stripe (single source of truth).
  const pricing = await getAllPackPricing();

  return (
    <Suspense>
      <OrderWizard pack={pack} locale={locale} isAuthenticated={!!user} pricing={pricing} />
    </Suspense>
  );
}

export function generateStaticParams() {
  return [
    { pack: 'solo' },
    { pack: 'duo' },
  ];
}
