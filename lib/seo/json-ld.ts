import { BASE_URL } from './base';

// Pure schema.org node builders. No React, no I/O — directly unit-testable
// under the repo's `environment: 'node'` vitest config.
//
// Hard rule, enforced by __tests__/seo/json-ld.test.ts: nothing here may emit
// `aggregateRating`, `Review` or `ratingValue`. The previous sitewide graph
// advertised a fabricated 4.8/400 rating on every page, which is a Google
// structured-data manual-action risk and, in France, a pratique commerciale
// trompeuse (art. L121-2 / L121-4). Rating markup comes back only when the
// ratings are real, first-party and sourced.

export type JsonLdNode = Record<string, unknown>;

export const ORG_ID = `${BASE_URL}#organization`;
export const WEBSITE_ID = `${BASE_URL}#website`;
export const FOUNDER_ID = `${BASE_URL}#founder`;

export function organizationNode(description: string): JsonLdNode {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: 'Digitip',
    alternateName: ['DigiTip', 'digitip.app'],
    url: BASE_URL,
    logo: `${BASE_URL}/icon.jpg`,
    image: `${BASE_URL}/icon.jpg`,
    description,
    foundingDate: '2025',
    legalName: 'YUZU LABS SAS',
    vatID: 'FR13994879013',
    taxID: '994879013',
    areaServed: ['FR', 'BE', 'CH', 'LU'],
    founder: { '@id': FOUNDER_ID },
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
  };
}

export function personNode(): JsonLdNode {
  return {
    '@type': 'Person',
    '@id': FOUNDER_ID,
    name: 'Raphaël Meyer',
    url: `${BASE_URL}/fr/a-propos`,
    jobTitle: 'Fondateur',
    worksFor: { '@id': ORG_ID },
  };
}

export function websiteNode(locale: string, description: string): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: BASE_URL,
    name: 'Digitip',
    alternateName: 'digitip.app',
    description,
    inLanguage: locale === 'fr' ? 'fr-FR' : 'en-US',
    publisher: { '@id': ORG_ID },
  };
}

export type ProductInput = {
  name: string;
  description: string;
  /** Charged amount in cents, excl. VAT. */
  priceCents: number;
  currency: string;
  /** Locale-relative URL of the page that sells it. */
  url: string;
  image?: string;
  sku?: string;
};

export function productNode(p: ProductInput): JsonLdNode {
  return {
    '@type': 'Product',
    name: p.name,
    description: p.description,
    image: p.image ?? `${BASE_URL}/icon.jpg`,
    ...(p.sku ? { sku: p.sku } : {}),
    brand: { '@type': 'Brand', name: 'Digitip' },
    manufacturer: { '@id': ORG_ID },
    offers: {
      '@type': 'Offer',
      url: p.url,
      // schema.org wants a decimal string, and the catalogue stores cents.
      price: (p.priceCents / 100).toFixed(2),
      priceCurrency: p.currency.toUpperCase(),
      availability: 'https://schema.org/InStock',
      seller: { '@id': ORG_ID },
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: 'EUR' },
        shippingDestination: [
          { '@type': 'DefinedRegion', addressCountry: 'FR' },
          { '@type': 'DefinedRegion', addressCountry: 'BE' },
          { '@type': 'DefinedRegion', addressCountry: 'CH' },
          { '@type': 'DefinedRegion', addressCountry: 'LU' },
        ],
      },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'FR',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 14,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/ReturnShippingFees',
      },
    },
  };
}

export type BreadcrumbItem = { name: string; url: string };

export function breadcrumbList(items: BreadcrumbItem[]): JsonLdNode {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

export type FaqItem = { question: string; answer: string };

export function faqPage(items: FaqItem[]): JsonLdNode {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.question,
      acceptedAnswer: { '@type': 'Answer', text: it.answer },
    })),
  };
}

export type ArticleInput = {
  headline: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified: string;
  locale: string;
  image?: string;
};

export function articleNode(a: ArticleInput): JsonLdNode {
  return {
    '@type': 'Article',
    headline: a.headline,
    description: a.description,
    url: a.url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': a.url },
    datePublished: a.datePublished,
    dateModified: a.dateModified,
    inLanguage: a.locale === 'fr' ? 'fr-FR' : 'en-US',
    image: a.image ?? `${BASE_URL}/icon.jpg`,
    // A named human, not the Organization: on tax-adjacent content,
    // identifiable authorship is one of the few E-E-A-T levers available.
    author: { '@id': FOUNDER_ID },
    publisher: { '@id': ORG_ID },
  };
}

export function collectionPage(input: {
  name: string;
  description: string;
  url: string;
  locale: string;
}): JsonLdNode {
  return {
    '@type': 'CollectionPage',
    name: input.name,
    description: input.description,
    url: input.url,
    inLanguage: input.locale === 'fr' ? 'fr-FR' : 'en-US',
    isPartOf: { '@id': WEBSITE_ID },
  };
}

export function itemList(items: BreadcrumbItem[]): JsonLdNode {
  return {
    '@type': 'ItemList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      url: it.url,
    })),
  };
}

export function webPage(input: {
  name: string;
  description: string;
  url: string;
  locale: string;
}): JsonLdNode {
  return {
    '@type': 'WebPage',
    name: input.name,
    description: input.description,
    url: input.url,
    inLanguage: input.locale === 'fr' ? 'fr-FR' : 'en-US',
    isPartOf: { '@id': WEBSITE_ID },
  };
}

/**
 * Wrap nodes into a single @graph. One script per page with nodes cross-linked
 * by @id, rather than N sibling scripts — easier for validators to resolve and
 * it lets a page reference the Organization without repeating it.
 */
export function jsonLdGraph(nodes: JsonLdNode[]): JsonLdNode {
  return { '@context': 'https://schema.org', '@graph': nodes };
}
