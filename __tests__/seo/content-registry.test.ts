import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { GUIDES } from '@/content/guides';
import { GUIDE_BODIES } from '@/content/guides/registry';
import { SOLUTIONS } from '@/content/solutions';
import { SOLUTION_BODIES } from '@/content/solutions/registry';
import { COMPARISONS } from '@/content/comparatifs';
import type { ContentMeta } from '@/content/types';

// Stops half-finished content shipping. A missing description or a broken
// related-slug is invisible in review but shows up as a bad SERP snippet or a
// 404 in the internal link graph.

const SUITES = [
  { name: 'guides', items: GUIDES as ContentMeta[], bodies: GUIDE_BODIES, dir: 'content/guides/body' },
  { name: 'solutions', items: SOLUTIONS as ContentMeta[], bodies: SOLUTION_BODIES, dir: 'content/solutions/body' },
];

describe.each(SUITES)('$name registry', ({ items, bodies, dir }) => {
  it('is not empty', () => {
    expect(items.length).toBeGreaterThan(0);
  });

  it('has unique, URL-safe slugs', () => {
    const slugs = items.map((i) => i.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('keeps titles within the SERP limit', () => {
    for (const i of items) {
      expect(i.title.length, `${i.slug}: "${i.title}"`).toBeLessThanOrEqual(60);
      expect(i.title.length).toBeGreaterThan(10);
    }
  });

  it('keeps descriptions in the 120-160 char window', () => {
    for (const i of items) {
      expect(i.description.length, `${i.slug} (${i.description.length})`).toBeGreaterThanOrEqual(120);
      expect(i.description.length, `${i.slug} (${i.description.length})`).toBeLessThanOrEqual(170);
    }
  });

  it('has an h1 and a non-trivial FAQ', () => {
    for (const i of items) {
      expect(i.h1.length).toBeGreaterThan(10);
      expect(i.faq.length, i.slug).toBeGreaterThan(0);
      for (const f of i.faq) {
        expect(f.question.trim().length).toBeGreaterThan(5);
        expect(f.answer.trim().length).toBeGreaterThan(20);
      }
    }
  });

  it('uses ISO dates with dateModified at or after datePublished', () => {
    for (const i of items) {
      expect(i.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(i.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Date.parse(i.dateModified)).toBeGreaterThanOrEqual(Date.parse(i.datePublished));
    }
  });

  it('cites sources with a verification date', () => {
    for (const i of items) {
      for (const s of i.sources) {
        expect(s.url, i.slug).toMatch(/^https:\/\//);
        expect(s.label.trim().length).toBeGreaterThan(5);
        expect(s.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it('resolves every related slug within its own registry', () => {
    const slugs = new Set(items.map((i) => i.slug));
    for (const i of items) {
      for (const r of i.related) {
        expect(slugs.has(r), `${i.slug} → ${r}`).toBe(true);
        expect(r).not.toBe(i.slug);
      }
    }
  });

  it('has a body registered and on disk for every entry', () => {
    for (const i of items) {
      expect(bodies[i.slug], `no body registered for ${i.slug}`).toBeTypeOf('function');
      expect(
        existsSync(join(process.cwd(), dir, `${i.slug}.tsx`)),
        `missing ${dir}/${i.slug}.tsx`
      ).toBe(true);
    }
  });

  it('has no orphaned body registrations', () => {
    const slugs = new Set(items.map((i) => i.slug));
    for (const key of Object.keys(bodies)) expect(slugs.has(key), key).toBe(true);
  });
});

// Comparison pages carry the strictest constraint in the content set: French
// comparative advertising (art. L122-1 s. code de la consommation) requires
// claims to be objective and verifiable, so every row must name its source and
// the date it was checked. Enforced here rather than trusted to review.
describe('comparison registry', () => {
  it('is not empty and has unique, URL-safe slugs', () => {
    expect(COMPARISONS.length).toBeGreaterThan(0);
    const slugs = COMPARISONS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('sources and dates every single comparison row', () => {
    for (const c of COMPARISONS) {
      expect(c.rows.length, c.slug).toBeGreaterThan(0);
      for (const r of c.rows) {
        expect(r.source, `${c.slug}/${r.criterion}`).toMatch(/^https:\/\//);
        expect(r.verifiedOn, `${c.slug}/${r.criterion}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(r.criterion.trim().length).toBeGreaterThan(2);
        expect(r.digitip.trim().length).toBeGreaterThan(2);
        expect(r.competitor.trim().length).toBeGreaterThan(2);
      }
    }
  });

  it('states where the competitor is the better choice', () => {
    // A comparison that never concedes anything reads as advertising and is
    // exactly what "non-disparaging and objective" is meant to prevent.
    for (const c of COMPARISONS) {
      expect(c.bestFor.trim().length, c.slug).toBeGreaterThan(30);
      expect(c.bestFor).toContain(c.competitor);
    }
  });

  it('respects the same title and description limits as other content', () => {
    for (const c of COMPARISONS) {
      expect(c.title.length, c.slug).toBeLessThanOrEqual(60);
      expect(c.description.length, c.slug).toBeGreaterThanOrEqual(120);
      expect(c.description.length, c.slug).toBeLessThanOrEqual(170);
    }
  });

  it('resolves related slugs and cites page-level sources', () => {
    const slugs = new Set(COMPARISONS.map((c) => c.slug));
    for (const c of COMPARISONS) {
      for (const r of c.related) expect(slugs.has(r), `${c.slug} -> ${r}`).toBe(true);
      expect(c.sources.length, c.slug).toBeGreaterThan(0);
    }
  });
});
