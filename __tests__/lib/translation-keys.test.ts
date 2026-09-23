import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';

/**
 * Every literal translation key used in the app must exist in BOTH catalogues.
 *
 * messages-parity.test.ts already pins the two catalogues against each other,
 * which catches a key present in one language and missing from the other. It
 * cannot catch the other direction: a key the CODE asks for that exists in
 * neither. next-intl throws on that rather than falling back, so a typo in
 * `t('btnPayy')` is a crashed page, and nothing was checking for it — the
 * checkout translation alone introduced about fifty new keys and a hundred
 * replaced call sites.
 *
 * Only single-quoted literals are checked. Keys built from a template literal
 * (`t(\`status.${x}\`)`) cannot be resolved statically and are deliberately out
 * of scope; they live in the admin and legal pages rather than the payment
 * paths.
 */

const ROOT = process.cwd();
const DIRS = ['app', 'components', 'lib'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

function resolves(catalogue: unknown, dotted: string): boolean {
  let node: unknown = catalogue;
  for (const part of dotted.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string';
}

type Usage = { file: string; line: number; key: string };

function collectUsages(): Usage[] {
  const usages: Usage[] = [];
  for (const full of DIRS.flatMap((d) => walk(join(ROOT, d)))) {
    const src = readFileSync(full, 'utf8');
    if (!src.includes('Translations')) continue;

    // Map each local variable to the namespace it was created with, covering
    // both the client hook and the two server-helper spellings.
    const namespaces = new Map<string, string>();
    for (const m of src.matchAll(
      /const\s+(\w+)\s*=\s*(?:await\s+)?(?:use|get)Translations\(\s*'([^']+)'/g,
    )) {
      namespaces.set(m[1], m[2]);
    }
    for (const m of src.matchAll(
      /const\s+(\w+)\s*=\s*(?:await\s+)?getTranslations\(\s*\{[^}]*namespace:\s*'([^']+)'/g,
    )) {
      namespaces.set(m[1], m[2]);
    }
    if (namespaces.size === 0) continue;

    for (const [variable, namespace] of namespaces) {
      const call = new RegExp(`\\b${variable}\\(\\s*'([^']+)'`, 'g');
      for (const m of src.matchAll(call)) {
        usages.push({
          file: relative(ROOT, full),
          line: src.slice(0, m.index ?? 0).split('\n').length,
          key: `${namespace}.${m[1]}`,
        });
      }
    }
  }
  return usages;
}

const usages = collectUsages();

describe('translation keys used in code', () => {
  it('finds the call sites to check', () => {
    // A refactor that breaks the extraction would otherwise make this file pass
    // by checking nothing at all.
    expect(usages.length).toBeGreaterThan(500);
  });

  it('resolves every key in the French catalogue', () => {
    const missing = usages
      .filter((u) => !resolves(fr, u.key))
      .map((u) => `${u.file}:${u.line} ${u.key}`);
    expect(missing).toEqual([]);
  });

  it('resolves every key in the English catalogue', () => {
    const missing = usages
      .filter((u) => !resolves(en, u.key))
      .map((u) => `${u.file}:${u.line} ${u.key}`);
    expect(missing).toEqual([]);
  });
});
