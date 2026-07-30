import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { PUBLIC_PATHS, NOINDEX_PREFIXES } from '@/lib/seo/routes';

// The important test in this suite.
//
// Only ten pages used to call pageAlternates, so every other page silently
// inherited the homepage canonical from the locale layout and declared itself a
// duplicate of "/". /devenir-commercial-pro was also missing from the sitemap
// despite being a real 200 page. Both are the kind of omission nobody notices
// until Search Console reports it months later.
//
// This walks the route tree on disk and forces every page to be a deliberate
// choice: indexable and registered in PUBLIC_PATHS with its own metadata, or
// explicitly under a noindex prefix.

const APP_DIR = join(process.cwd(), 'app', '[locale]');

function findPageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findPageFiles(full));
    else if (entry === 'page.tsx') out.push(full);
  }
  return out;
}

/** app/[locale]/guides/[slug]/page.tsx → '/guides/[slug]' ; homepage → ''. */
function routeOf(file: string): string {
  const rel = relative(APP_DIR, file).split(sep).slice(0, -1);
  // Route groups like (auth) are organisational only and not part of the URL.
  const segments = rel.filter((s) => !(s.startsWith('(') && s.endsWith(')')));
  return segments.length ? `/${segments.join('/')}` : '';
}

const pageFiles = findPageFiles(APP_DIR);
const publicPaths = new Set(PUBLIC_PATHS.map((p) => p.path));

function isNoindex(route: string): boolean {
  return NOINDEX_PREFIXES.some((p) => route === p || route.startsWith(`${p}/`));
}

describe('route registry', () => {
  it('finds the route tree', () => {
    expect(pageFiles.length).toBeGreaterThan(10);
  });

  it('classifies every page as either public or noindex', () => {
    const unclassified = pageFiles
      .map(routeOf)
      // Dynamic content routes are registered by their static parent path.
      .filter((r) => !r.includes('['))
      .filter((r) => !publicPaths.has(r) && !isNoindex(r));

    expect(unclassified).toEqual([]);
  });

  it('has a real file behind every PUBLIC_PATHS entry', () => {
    const routes = new Set(pageFiles.map(routeOf));
    const orphans = [...publicPaths].filter((p) => !routes.has(p));
    expect(orphans).toEqual([]);
  });

  it('gives every public page its own metadata', () => {
    // Without this, the page inherits the homepage canonical from the layout.
    // The homepage itself is the one legitimate exception: the layout's
    // generateMetadata sets `alternates: pageAlternates(locale, '')`, which is
    // correct precisely for "/".
    const missing: string[] = [];
    for (const file of pageFiles) {
      const route = routeOf(file);
      if (route === '' || !publicPaths.has(route)) continue;
      const src = readFileSync(file, 'utf8');
      if (!src.includes('buildPageMetadata(') && !src.includes('pageAlternates(')) {
        missing.push(route);
      }
    }
    expect(missing).toEqual([]);
  });

  it('has the locale layout own the homepage canonical', () => {
    const layout = readFileSync(join(APP_DIR, 'layout.tsx'), 'utf8');
    expect(layout).toContain("pageAlternates(locale, '')");
  });

  it('gives dynamic content routes their own metadata too', () => {
    const dynamicContentRoutes = ['/guides/[slug]', '/solutions/[slug]'];
    for (const route of dynamicContentRoutes) {
      const file = pageFiles.find((f) => routeOf(f) === route);
      expect(file, `${route} should exist`).toBeTruthy();
      expect(readFileSync(file!, 'utf8')).toContain('buildPageMetadata(');
    }
  });

  it('marks transactional pages noindex in their metadata', () => {
    // robots.txt alone is not enough: a disallowed URL can still be indexed
    // from an inbound link, and Google cannot read a noindex it may not crawl.
    for (const route of ['/checkout', '/order/[pack]']) {
      const file = pageFiles.find((f) => routeOf(f) === route);
      expect(file, `${route} should exist`).toBeTruthy();
      expect(readFileSync(file!, 'utf8')).toContain('noindex: true');
    }
  });

  it('keeps PUBLIC_PATHS and NOINDEX_PREFIXES disjoint', () => {
    const overlap = [...publicPaths].filter((p) => p !== '' && isNoindex(p));
    expect(overlap).toEqual([]);
  });
});
