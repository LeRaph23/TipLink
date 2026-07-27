import { describe, it, expect } from 'vitest';
import {
  organizationNode,
  personNode,
  websiteNode,
  productNode,
  breadcrumbList,
  faqPage,
  articleNode,
  collectionPage,
  itemList,
  webPage,
  jsonLdGraph,
  ORG_ID,
  FOUNDER_ID,
  WEBSITE_ID,
} from '@/lib/seo/json-ld';
import { BASE_URL } from '@/lib/seo/base';

const ALL_NODES = [
  organizationNode('desc'),
  personNode(),
  websiteNode('fr', 'desc'),
  productNode({
    name: 'SmartTag',
    description: 'desc',
    priceCents: 6900,
    currency: 'eur',
    url: 'https://digitip.app/fr/pricing',
  }),
  breadcrumbList([{ name: 'A', url: 'https://digitip.app/fr' }]),
  faqPage([{ question: 'Q', answer: 'A' }]),
  articleNode({
    headline: 'H',
    description: 'D',
    url: 'https://digitip.app/fr/guides/x',
    datePublished: '2026-01-01',
    dateModified: '2026-02-01',
    locale: 'fr',
  }),
  collectionPage({ name: 'N', description: 'D', url: 'https://digitip.app/fr/guides', locale: 'fr' }),
  itemList([{ name: 'A', url: 'https://digitip.app/fr/guides/x' }]),
  webPage({ name: 'N', description: 'D', url: 'https://digitip.app/fr/solutions/bar', locale: 'fr' }),
];

describe('JSON-LD builders', () => {
  it('never emits rating or review markup', () => {
    // The sitewide graph used to advertise a fabricated 4.8/400 AggregateRating
    // on every page, with zero customers. That is a Google manual-action risk
    // and an art. L121-2/L121-4 exposure. Rating markup only comes back when
    // the ratings are real, first-party and sourced.
    const serialized = JSON.stringify(ALL_NODES);
    for (const banned of ['aggregateRating', 'AggregateRating', 'ratingValue', 'reviewCount', '"Review"']) {
      expect(serialized).not.toContain(banned);
    }
  });

  it('does not emit a SoftwareApplication node', () => {
    // Digitip sells hardware plus a service, and the old node priced it at 0.
    expect(JSON.stringify(ALL_NODES)).not.toContain('SoftwareApplication');
  });

  it('gives every node an @type', () => {
    for (const node of ALL_NODES) expect(node['@type']).toBeTruthy();
  });

  it('resolves every @id reference within a full graph', () => {
    const graph = jsonLdGraph(ALL_NODES);
    const nodes = graph['@graph'] as Record<string, unknown>[];
    const defined = new Set(nodes.map((n) => n['@id']).filter(Boolean));

    const refs: string[] = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        const keys = Object.keys(o);
        // A bare { '@id': ... } object is a reference, not a definition.
        if (keys.length === 1 && keys[0] === '@id') refs.push(o['@id'] as string);
        else Object.values(o).forEach(walk);
      }
    };
    nodes.forEach(walk);

    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(defined).toContain(ref);
  });

  it('wraps nodes in a single @context graph', () => {
    const graph = jsonLdGraph([websiteNode('fr', 'd')]);
    expect(graph['@context']).toBe('https://schema.org');
    expect(Array.isArray(graph['@graph'])).toBe(true);
  });

  it('uses stable @ids anchored on the base URL', () => {
    for (const id of [ORG_ID, FOUNDER_ID, WEBSITE_ID]) {
      expect(id.startsWith(`${BASE_URL}#`)).toBe(true);
    }
    // Distinct fragments, or nodes would collapse into each other in the graph.
    expect(new Set([ORG_ID, FOUNDER_ID, WEBSITE_ID]).size).toBe(3);
  });

  describe('breadcrumbList', () => {
    it('numbers positions from 1, contiguously', () => {
      const bc = breadcrumbList([
        { name: 'A', url: 'https://digitip.app/fr' },
        { name: 'B', url: 'https://digitip.app/fr/guides' },
        { name: 'C', url: 'https://digitip.app/fr/guides/x' },
      ]);
      const items = bc.itemListElement as { position: number }[];
      expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    });
  });

  describe('productNode', () => {
    it('converts cents to a decimal price string', () => {
      const p = productNode({
        name: 'n', description: 'd', priceCents: 6900, currency: 'eur',
        url: 'https://digitip.app/fr/pricing',
      });
      const offers = p.offers as Record<string, unknown>;
      expect(offers.price).toBe('69.00');
      expect(offers.priceCurrency).toBe('EUR');
    });

    it('handles a non-round amount without floating point drift', () => {
      const p = productNode({
        name: 'n', description: 'd', priceCents: 9999, currency: 'eur',
        url: 'https://digitip.app/fr/pricing',
      });
      expect((p.offers as Record<string, unknown>).price).toBe('99.99');
    });
  });

  describe('faqPage', () => {
    it('never emits an empty answer', () => {
      const f = faqPage([{ question: 'Q', answer: 'A' }]);
      const entities = f.mainEntity as { acceptedAnswer: { text: string } }[];
      for (const e of entities) expect(e.acceptedAnswer.text.length).toBeGreaterThan(0);
    });
  });

  describe('articleNode', () => {
    it('attributes authorship to the Person, not the Organization', () => {
      const a = articleNode({
        headline: 'H', description: 'D', url: 'https://digitip.app/fr/guides/x',
        datePublished: '2026-01-01', dateModified: '2026-02-01', locale: 'fr',
      });
      expect(a.author).toEqual({ '@id': FOUNDER_ID });
      expect(a.publisher).toEqual({ '@id': ORG_ID });
    });

    it('maps the locale to a BCP-47 language tag', () => {
      const fr = articleNode({
        headline: 'H', description: 'D', url: 'u',
        datePublished: '2026-01-01', dateModified: '2026-01-01', locale: 'fr',
      });
      const en = articleNode({
        headline: 'H', description: 'D', url: 'u',
        datePublished: '2026-01-01', dateModified: '2026-01-01', locale: 'en',
      });
      expect(fr.inLanguage).toBe('fr-FR');
      expect(en.inLanguage).toBe('en-US');
    });
  });
});
