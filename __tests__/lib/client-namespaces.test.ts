import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import frMessages from '@/messages/fr.json';
import {
  BASE_CLIENT_NAMESPACES,
  DASHBOARD_NAMESPACES,
  LANDING_NAMESPACES,
  pickNamespaces,
} from '@/lib/i18n/client-namespaces';

/**
 * The root layout no longer ships the whole message catalogue to the browser.
 * It sends the base namespaces; `dashboard` and `landing` are provided by their
 * own subtrees. Together those two are half the catalogue and neither is needed
 * on the tipping page, which is opened on a phone straight after a scan.
 *
 * next-intl throws on a missing key rather than falling back, so getting this
 * wrong takes a page down. This test re-derives the answer from the source
 * instead of trusting the lists: it finds every client component, reads the
 * namespace each one asks for, and checks it is provided where that component
 * can render.
 */

const ROOT = process.cwd();
const SCANNED = ['app', 'components'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

type ClientFile = { path: string; namespaces: string[] };

const clientFiles: ClientFile[] = SCANNED.flatMap((d) => walk(join(ROOT, d)))
  .map((full) => ({ full, src: readFileSync(full, 'utf8') }))
  .filter(({ src }) => /^['"]use client['"]/m.test(src))
  .map(({ full, src }) => ({
    path: relative(ROOT, full),
    namespaces: [...src.matchAll(/useTranslations\(\s*['"]([^'"]+)['"]/g)]
      .map((m) => m[1].split('.')[0]),
  }))
  .filter((f) => f.namespaces.length > 0);

const base = new Set<string>(BASE_CLIENT_NAMESPACES);
const dashboardOnly = new Set<string>(DASHBOARD_NAMESPACES);
const landingOnly = new Set<string>(LANDING_NAMESPACES);

describe('client message namespaces', () => {
  it('finds the client components to check', () => {
    expect(clientFiles.length).toBeGreaterThan(10);
  });

  it('provides every namespace a client component asks for', () => {
    const known = new Set([...base, ...dashboardOnly, ...landingOnly]);
    const unknown = clientFiles.flatMap((f) =>
      f.namespaces.filter((ns) => !known.has(ns)).map((ns) => `${f.path}: ${ns}`),
    );
    expect(unknown).toEqual([]);
  });

  // The load-bearing assertion. A subtree-scoped namespace used from outside
  // that subtree renders with no provider for it, and next-intl throws.
  it('keeps subtree-scoped namespaces inside their subtree', () => {
    const escapes: string[] = [];
    for (const f of clientFiles) {
      for (const ns of f.namespaces) {
        if (dashboardOnly.has(ns) && !/^(app\/\[locale\]\/dashboard|components\/dashboard)\//.test(f.path)) {
          escapes.push(`${f.path} uses '${ns}' outside the dashboard subtree`);
        }
        if (landingOnly.has(ns) && !/^components\/landing\//.test(f.path)) {
          escapes.push(`${f.path} uses '${ns}' outside the landing subtree`);
        }
      }
    }
    expect(escapes).toEqual([]);
  });

  it('lists no namespace that does not exist in the catalogue', () => {
    const all = Object.keys(frMessages as Record<string, unknown>);
    for (const ns of [...base, ...dashboardOnly, ...landingOnly]) {
      expect(all, `'${ns}' is declared but absent from messages/fr.json`).toContain(ns);
    }
  });

  it('actually narrows the payload', () => {
    const full = JSON.stringify(frMessages).length;
    const shipped = JSON.stringify(
      pickNamespaces(frMessages as never, BASE_CLIENT_NAMESPACES),
    ).length;
    // Guards the point of the exercise: if this ever approaches the full
    // catalogue again, the narrowing has quietly stopped working.
    expect(shipped).toBeLessThan(full * 0.55);
  });

  it('pickNamespaces returns only what was asked for', () => {
    const picked = pickNamespaces(frMessages as never, ['pay', 'common']);
    expect(Object.keys(picked).sort()).toEqual(['common', 'pay']);
    expect(pickNamespaces(frMessages as never, ['nope'])).toEqual({});
  });
});
