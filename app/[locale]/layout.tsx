import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Space_Grotesk, Poppins } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { Analytics } from '@vercel/analytics/next';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { BASE_URL, pageAlternates } from '@/lib/seo';
import '../globals.css';

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
});

const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#E57A97',
  width: 'device-width',
  initialScale: 1,
  // Required for env(safe-area-inset-*) to resolve to non-zero on iOS, so the
  // dashboard sidebar footer clears the Safari toolbar / home indicator.
  viewportFit: 'cover',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return { title: 'Digitip' };
  }
  const t = await getTranslations({ locale, namespace: 'metadata' });
  const title = t('title');
  const description = t('description');
  const keywords =
    locale === 'fr'
      ? [
          'Digitip',
          'digitip',
          'digitip app',
          'digitip.app',
          'pourboire NFC',
          'pourboire cashless',
          'pourboire sans contact',
          'SmartTag NFC',
          'plaque NFC pourboire',
          'pourboire QR code',
          'tip jar digital',
          'pourboires restaurant',
          'pourboires bar',
          'pourboires café',
          'pourboires serveur',
          'pourboires coiffeur',
          'pourboires hôtel',
          'pourboires établissement',
          'Stripe pourboire',
          'tipping cashless France',
        ]
      : [
          'Digitip',
          'digitip',
          'digitip app',
          'digitip.app',
          'NFC tipping',
          'cashless tip',
          'contactless tip',
          'NFC SmartTag',
          'digital tip jar',
          'QR code tipping',
          'tip via phone',
          'restaurant tips',
          'bar tips',
          'café tips',
          'waiter tips',
          'hairdresser tips',
          'hotel tipping',
          'Stripe tipping',
        ];

  return {
    metadataBase: new URL(BASE_URL),
    title: {
      default: title,
      template: '%s | Digitip',
    },
    description,
    keywords,
    applicationName: 'Digitip',
    authors: [{ name: 'Digitip', url: BASE_URL }],
    creator: 'Digitip',
    publisher: 'Digitip',
    referrer: 'origin-when-cross-origin',
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    category: 'business',
    // Homepage-only canonical. Each sub-page MUST override `alternates` in its
    // own generateMetadata (via pageAlternates) — otherwise it inherits this
    // value and wrongly declares the homepage as its canonical URL.
    alternates: pageAlternates(locale, ''),
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/${locale}`,
      siteName: 'Digitip',
      locale: locale === 'fr' ? 'fr_FR' : 'en_US',
      alternateLocale: routing.locales.filter((l) => l !== locale).map((l) => (l === 'fr' ? 'fr_FR' : 'en_US')),
      type: 'website',
      images: [
        {
          url: '/icon.jpg',
          width: 1200,
          height: 630,
          alt: 'Digitip, pourboires par CB via NFC',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/icon.jpg'],
      creator: '@digitip',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-snippet': -1,
        'max-image-preview': 'large',
        'max-video-preview': -1,
      },
    },
    icons: {
      icon: '/icon.jpg',
      apple: '/icon.jpg',
      shortcut: '/icon.jpg',
    },
    manifest: '/manifest.webmanifest',
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

function buildJsonLd(locale: string) {
  const description =
    locale === 'fr'
      ? "Digitip propose des SmartTags NFC pré-configurés pour collecter des pourboires sans contact en un tap. Plateforme française disponible sur digitip.app."
      : 'Digitip offers pre-configured NFC SmartTags to collect cashless tips with a single tap. French platform available at digitip.app.';

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${BASE_URL}#organization`,
    name: 'Digitip',
    alternateName: ['DigiTip', 'digitip.app', 'Digitip App'],
    url: BASE_URL,
    logo: `${BASE_URL}/icon.jpg`,
    image: `${BASE_URL}/icon.jpg`,
    description,
    foundingDate: '2025',
    legalName: 'YUZU LABS SAS',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '11 rue de Lorraine',
      postalCode: '68490',
      addressLocality: 'Petit-Landau',
      addressCountry: 'FR',
    },
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'support@digitip.app',
        availableLanguage: ['French', 'English'],
      },
    ],
    vatID: 'FR13994879013',
    taxID: '994879013',
    areaServed: ['FR', 'BE', 'CH', 'LU'],
  };

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${BASE_URL}#website`,
    url: BASE_URL,
    name: 'Digitip',
    alternateName: 'digitip.app',
    description,
    inLanguage: locale === 'fr' ? 'fr-FR' : 'en-US',
    publisher: { '@id': `${BASE_URL}#organization` },
  };

  // NOTE: there is deliberately no `aggregateRating` node here, and no
  // `SoftwareApplication` node either.
  //
  // The previous version advertised a 4.8/400 AggregateRating while the
  // product had zero customers. Fabricated review markup is a Google
  // structured-data manual-action risk and, in France, a `pratique
  // commerciale trompeuse` (art. L121-2 / L121-4 code de la consommation).
  // Never re-add rating markup until the ratings are real and sourced.
  //
  // `SoftwareApplication` was also dropped: Digitip sells hardware plus a
  // service, not a downloadable app, and its `offers.price: '0'` misdescribed
  // a paid product. Real prices are emitted as `Product`/`Offer` nodes on the
  // routes that actually know them (`/` and `/pricing`).
  return [organization, website];
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();
  const jsonLd = buildJsonLd(locale);

  return (
    <html
      lang={locale}
      data-theme="light"
      className={`${jakarta.variable} ${spaceGrotesk.variable} ${poppins.variable} h-full`}
    >
      <head>
        {/* Prevent theme flash by applying stored preference before paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;})()`,
          }}
        />
        {jsonLd.map((entry, idx) => (
          <script
            key={idx}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }}
          />
        ))}
      </head>
      <body className="min-h-full flex flex-col antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
