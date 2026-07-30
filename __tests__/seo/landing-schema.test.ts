import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';

// The homepage FAQ is rendered by the client landing component, while the
// FAQPage schema is built in the server wrapper from the same i18n keys. Two
// places reading one list is exactly the kind of pairing that silently drifts:
// add an eighth question to the page and the schema keeps describing seven.

type Msgs = { landing: { faq: Record<string, string> } };

function faqKeyCount(m: Msgs): number {
  const keys = Object.keys(m.landing.faq);
  const qs = keys.filter((k) => /^q\d+$/.test(k));
  const as = keys.filter((k) => /^a\d+$/.test(k));
  expect(qs.length, 'each question needs an answer').toBe(as.length);
  return qs.length;
}

const pageSrc = readFileSync(
  join(process.cwd(), 'app', '[locale]', 'page.tsx'),
  'utf8'
);

describe('landing FAQ schema', () => {
  it('covers every FAQ entry defined in the catalogue', () => {
    const count = faqKeyCount(fr as unknown as Msgs);
    expect(faqKeyCount(en as unknown as Msgs)).toBe(count);

    // The wrapper enumerates the questions as a literal tuple.
    const tuple = pageSrc.match(/\(\[([\d,\s]+)\] as const\)/);
    expect(tuple, 'expected a literal FAQ index tuple in the page').toBeTruthy();
    const indices = tuple![1].split(',').map((n) => Number(n.trim())).filter(Number.isFinite);

    expect(indices.length, `catalogue has ${count} questions`).toBe(count);
    expect(indices).toEqual(Array.from({ length: count }, (_, i) => i + 1));
  });

  it('emits FAQPage and Product markup from the homepage', () => {
    expect(pageSrc).toContain('faqPage(');
    expect(pageSrc).toContain('productNode(');
  });

  it('keeps the homepage a server component so the schema is in the HTML', () => {
    expect(pageSrc.startsWith("'use client'")).toBe(false);
    expect(pageSrc).toContain('generateMetadata');
  });

  it('never guesses a price when Stripe is unavailable', () => {
    // A Product node with an invented price is worse than no Product node.
    expect(pageSrc).toContain('pricing');
    expect(pageSrc).toMatch(/pricing\s*\?/);
  });
});

describe('legal pages', () => {
  it.each(['terms', 'privacy', 'cgv', 'mentions-legales'])(
    '/%s declares a description',
    (slug) => {
      const src = readFileSync(
        join(process.cwd(), 'app', '[locale]', slug, 'page.tsx'),
        'utf8'
      );
      expect(src).toContain('buildPageMetadata(');
      expect(src).toContain('description:');
    }
  );
});
