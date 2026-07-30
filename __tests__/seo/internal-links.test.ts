import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Content shipped without a single inbound link from the homepage: the guides,
// trade pages and comparisons were reachable only through the sitemap. Orphan
// pages receive no internal link equity and get crawled far less often, so the
// content ranks well below what it should — and nothing about the site looks
// broken, which is why it went unnoticed.
//
// Internal links are the cheapest ranking factor available and the easiest to
// forget when adding a section, so they are pinned here.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');

const HUBS = ['/guides', '/solutions', '/comparatif'] as const;

describe('internal linking', () => {
  it('links every content hub from the site footer', () => {
    const footer = read('components', 'landing', 'LandingPage.tsx');
    for (const hub of HUBS) {
      expect(footer, `footer must link ${hub}`).toContain(`'${hub}'`);
    }
  });

  it('cross-links the three content types instead of leaving three islands', () => {
    const pairs: [string[], string[]][] = [
      [['app', '[locale]', 'guides', '[slug]', 'page.tsx'], ['/solutions', '/comparatif']],
      [['app', '[locale]', 'solutions', '[slug]', 'page.tsx'], ['/guides/', '/comparatif']],
      [['app', '[locale]', 'comparatif', '[slug]', 'page.tsx'], ['/guides/', '/solutions']],
    ];
    for (const [path, expected] of pairs) {
      const src = read(...path);
      for (const target of expected) {
        expect(src, `${path.join('/')} must link ${target}`).toContain(target);
      }
    }
  });

  it('gives every article a link back to its hub', () => {
    for (const [dir, hub] of [
      ['guides', '/guides'],
      ['solutions', '/solutions'],
      ['comparatif', '/comparatif'],
    ] as const) {
      const src = read('app', '[locale]', dir, '[slug]', 'page.tsx');
      expect(src).toContain(`hubHref="${hub}"`);
    }
  });

  it('routes every article CTA to a page that exists', () => {
    // ArticleLayout carries the single conversion CTA for all content pages.
    const layout = read('components', 'content', 'ArticleLayout.tsx');
    expect(layout).toContain('/pricing');
  });
});
