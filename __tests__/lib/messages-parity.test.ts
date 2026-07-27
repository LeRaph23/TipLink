import { describe, it, expect } from 'vitest';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';

// next-intl throws at render time on a missing key, so a namespace that exists
// in one locale but not the other is a runtime crash on that locale's page —
// not a silent fallback. Both files are hand-maintained, so this pins them
// together before the content surface grows.

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : flatten(v, `${prefix}${k}.`)
  );
}

const frKeys = flatten(fr as unknown as Tree);
const enKeys = flatten(en as unknown as Tree);

describe('message catalogue parity', () => {
  it('has no key present in fr but missing from en', () => {
    const missing = frKeys.filter((k) => !enKeys.includes(k));
    expect(missing).toEqual([]);
  });

  it('has no key present in en but missing from fr', () => {
    const missing = enKeys.filter((k) => !frKeys.includes(k));
    expect(missing).toEqual([]);
  });

  it('has no duplicate keys within a locale', () => {
    expect(new Set(frKeys).size).toBe(frKeys.length);
    expect(new Set(enKeys).size).toBe(enKeys.length);
  });

  it('has no accidentally empty string values', () => {
    // Deliberately blank: the header cell above a table's actions column, which
    // is visually empty by design.
    const intentionallyBlank = new Set(['dashboard.admin.smarttags.colActions']);
    const empties = (tree: Tree, prefix = ''): string[] =>
      Object.entries(tree).flatMap(([k, v]) =>
        typeof v === 'string'
          ? v.trim() === '' && !intentionallyBlank.has(`${prefix}${k}`)
            ? [`${prefix}${k}`]
            : []
          : empties(v, `${prefix}${k}.`)
      );
    expect(empties(fr as unknown as Tree)).toEqual([]);
    expect(empties(en as unknown as Tree)).toEqual([]);
  });

  it('no longer ships fabricated social-proof keys', () => {
    // Guards the fix that removed the invented 4.8/400 rating, the "+150 avis
    // vérifiés" counter and the three fictional testimonials. Re-adding any of
    // these without real, sourced data is an L121-2/L121-4 exposure.
    const banned = [
      'landing.testimonials',
      'landing.product.rating',
      'landing.product.reviewCount',
    ];
    for (const prefix of banned) {
      expect(frKeys.filter((k) => k === prefix || k.startsWith(`${prefix}.`))).toEqual([]);
      expect(enKeys.filter((k) => k === prefix || k.startsWith(`${prefix}.`))).toEqual([]);
    }
  });
});
