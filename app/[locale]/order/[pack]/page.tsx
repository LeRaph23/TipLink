import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { validatePack } from '@/lib/order-validation';
import { createClient } from '@/lib/supabase/server';
import { getAllPackPricing } from '@/lib/stripe/pricing';
import { buildPageMetadata } from '@/lib/seo';
import { OrderWizard } from './OrderWizard';
import type { Metadata } from 'next';

// Transactional page — noindex, and its own canonical so it does not inherit
// the homepage's from the locale layout.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; pack: string }>;
}): Promise<Metadata> {
  const { locale, pack } = await params;
  return buildPageMetadata({
    locale,
    path: `/order/${pack}`,
    title: 'Commande',
    description: 'Finalisez votre commande de SmartTag Digitip.',
    noindex: true,
  });
}

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

  // Signed out, ordering is the quick checkout: one page, straight to Stripe,
  // with the account created from the payment (webhook pack-express). The
  // wizard used to make a visitor create and verify an account before paying.
  // It stays for signed-in customers, whose order joins their existing group.
  if (!user) {
    redirect(`/${locale}/checkout?pack=${pack}`);
  }

  // Pricing comes from Stripe (single source of truth).
  const pricing = await getAllPackPricing();

  return (
    <Suspense>
      <OrderWizard
        pack={pack}
        locale={locale}
        pricing={pricing}
        signedIn={{ email: user.email ?? '', fullName: (user.user_metadata?.full_name as string | undefined) ?? '' }}
      />
    </Suspense>
  );
}

export function generateStaticParams() {
  return [
    { pack: 'solo' },
    { pack: 'duo' },
  ];
}
