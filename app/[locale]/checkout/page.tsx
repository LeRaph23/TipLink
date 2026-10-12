import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PackCheckout, type CheckoutAccount } from '@/components/checkout/PackCheckout';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { findBuyerGroup } from '@/lib/billing/buyer-group';
import { getPackPricing } from '@/lib/stripe/pricing';
import { buildPageMetadata } from '@/lib/seo';
import type { PackId } from '@/lib/env';
import type { Metadata } from 'next';

// Transactional page: never index it. Without its own `alternates` it would
// also inherit the homepage canonical from the locale layout and tell Google
// it is a duplicate of "/".
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'checkout' });
  return buildPageMetadata({
    locale,
    path: '/checkout',
    title: t('metaTitle'),
    description: t('metaDescription'),
    noindex: true,
  });
}

const PACK_VISUAL = {
  solo: { img: '/products/solo-3d.jpg', altKey: 'altSolo' },
  duo:  { img: '/products/duo-double.jpg', altKey: 'altDuo' },
} as const;

function isValidPack(s: string | undefined): s is PackId {
  return s === 'solo' || s === 'duo';
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ pack?: string }>;
}) {
  const { locale } = await params;
  const { pack } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('checkout');

  if (!isValidPack(pack)) {
    notFound();
  }

  // Pricing comes from Stripe (single source of truth). Visual assets stay local.
  const pricing = await getPackPricing(pack);

  // Signed in, the same page, already filled in: the account's email and,
  // for a business owner, the last delivery address. The order then joins
  // their business (see create-pack-intent).
  const { data: { user } } = await (await createClient()).auth.getUser();
  let account: CheckoutAccount | null = null;
  if (user?.email) {
    const buyer = await findBuyerGroup(createServiceClient(), user.id);
    account = { email: user.email, name: buyer?.legalName ?? null, shipping: buyer?.shipping ?? null };
  }
  const visual = PACK_VISUAL[pack];

  return (
    <PackCheckout
      pack={pack}
      locale={locale}
      account={account}
      product={{
        pack,
        name: pack === 'solo' ? 'Digitip Solo' : 'Digitip Duo',
        description: t('plates', { count: pricing.quantity }),
        image: visual.img,
        alt: t(visual.altKey),
        unitAmount: pricing.unitAmount,
        currency: pricing.currency,
      }}
    />
  );
}
