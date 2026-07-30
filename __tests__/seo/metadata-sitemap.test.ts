import { describe, it, expect } from 'vitest';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { BASE_URL } from '@/lib/seo/base';
import { robotsDisallow, NOINDEX_PREFIXES } from '@/lib/seo/routes';
import sitemap from '@/app/sitemap';
import robots from '@/app/robots';

describe('buildPageMetadata', () => {
  const base = { locale: 'fr', title: 'T', description: 'D' };

  it('builds an absolute canonical with no trailing slash', () => {
    const m = buildPageMetadata({ ...base, path: '/pricing' });
    expect(m.alternates?.canonical).toBe(`${BASE_URL}/fr/pricing`);
    expect(String(m.alternates?.canonical)).not.toMatch(/\/$/);
  });

  it('handles the homepage empty path', () => {
    const m = buildPageMetadata({ ...base, path: '' });
    expect(m.alternates?.canonical).toBe(`${BASE_URL}/fr`);
  });

  it('points x-default at the default locale', () => {
    const langs = buildPageMetadata({ ...base, path: '/contact' }).alternates?.languages;
    expect(langs?.['x-default']).toBe(`${BASE_URL}/fr/contact`);
  });

  it('omits en from FR-only pages', () => {
    const langs = buildPageMetadata({
      ...base, path: '/guides', locales: ['fr'],
    }).alternates?.languages;
    expect(langs).not.toHaveProperty('en');
    expect(langs).toHaveProperty('fr');
  });

  it('lists both locales on bilingual pages', () => {
    const langs = buildPageMetadata({ ...base, path: '/pricing' }).alternates?.languages;
    expect(langs).toHaveProperty('fr');
    expect(langs).toHaveProperty('en');
  });

  it('is indexable by default', () => {
    expect(buildPageMetadata({ ...base, path: '/pricing' }).robots).toBeUndefined();
  });

  it('sets both robots and googleBot when noindex is requested', () => {
    const r = buildPageMetadata({ ...base, path: '/checkout', noindex: true }).robots;
    expect(r).toMatchObject({ index: false, googleBot: { index: false } });
  });

  it('always provides a 1200x630 OG image', () => {
    const img = buildPageMetadata({ ...base, path: '/pricing' }).openGraph?.images;
    expect(img).toEqual([
      expect.objectContaining({ width: 1200, height: 630 }),
    ]);
  });

  it('carries article timestamps only for article pages', () => {
    const article = buildPageMetadata({
      ...base, path: '/guides/x', type: 'article',
      publishedTime: '2026-01-01', modifiedTime: '2026-02-01',
    });
    expect(article.openGraph).toMatchObject({ publishedTime: '2026-01-01' });

    const page = buildPageMetadata({ ...base, path: '/pricing', publishedTime: '2026-01-01' });
    expect(page.openGraph).not.toHaveProperty('publishedTime');
  });
});

describe('sitemap', () => {
  const entries = sitemap();

  it('is not empty', () => {
    expect(entries.length).toBeGreaterThan(10);
  });

  it('has no duplicate URLs', () => {
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('emits only absolute URLs on the canonical origin', () => {
    for (const e of entries) expect(e.url.startsWith(`${BASE_URL}/`)).toBe(true);
  });

  it('never lists a URL that robots.txt disallows', () => {
    // Listing a blocked URL in the sitemap is a direct contradiction and shows
    // up in Search Console as "Indexed, though blocked by robots.txt".
    const blocked = entries.filter((e) => {
      const path = e.url.slice(BASE_URL.length);
      const afterLocale = path.replace(/^\/[a-z]{2}/, '');
      return NOINDEX_PREFIXES.some(
        (p) => afterLocale === p || afterLocale.startsWith(`${p}/`)
      );
    });
    expect(blocked.map((e) => e.url)).toEqual([]);
  });

  it('includes every guide and solution exactly once', () => {
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${BASE_URL}/fr/guides/exoneration-pourboires-2026`);
    expect(urls).toContain(`${BASE_URL}/fr/solutions/restaurant`);
    expect(urls.filter((u) => u.includes('/guides/')).length).toBeGreaterThan(0);
  });

  it('does not list /en for FR-only content', () => {
    const en = entries.filter((e) => e.url.includes('/en/guides') || e.url.includes('/en/solutions'));
    expect(en).toEqual([]);
  });
});

describe('robots', () => {
  const r = robots();
  const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules;
  const disallow = (rules?.disallow ?? []) as string[];

  it('advertises the sitemap and host', () => {
    expect(r.sitemap).toBe(`${BASE_URL}/sitemap.xml`);
    expect(r.host).toBe(BASE_URL);
  });

  it('blocks the routes that were previously exposed', () => {
    // /pro/, /receipt/, /signup and the locale-prefixed /auth/ were all
    // crawlable before; only the bare /auth/ callback was covered.
    for (const p of ['/*/pro', '/*/receipt', '/*/signup', '/*/auth', '/*/checkout', '/*/dashboard']) {
      expect(disallow).toContain(p);
    }
  });

  it('derives its disallow list from the shared registry', () => {
    expect(disallow).toEqual(robotsDisallow());
  });
});
