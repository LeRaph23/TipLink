import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Vercel enforces the 1 MB Edge Function limit at DEPLOY time, not at build
// time, so `next build` passes and the failure only appears as an ERROR
// deployment. That cost three failed deployments before it was spotted.
//
// The cause was an opengraph-image route: next/og pulls in ~400 KB of
// @vercel/og, and from inside app/[locale] it was bundled into the shared
// chunk graph of the three `runtime = 'edge'` tip pages, taking
// [locale]/pay/group/[establishmentId]/team to 1.32 MB.
//
// These are cheap static guards. They cannot measure the bundle, but they do
// fail the moment someone reintroduces the shape that caused the problem.
// See lib/seo/README-og.md.

const APP = join(process.cwd(), 'app');

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const appFiles = walk(APP);

describe('edge function bundle guards', () => {
  it('has no dynamic OG image route inside the [locale] segment', () => {
    const offenders = appFiles.filter(
      (f) =>
        f.includes(`${'app'}/[locale]`) &&
        /(opengraph|twitter)-image\.(tsx|ts|jsx|js)$/.test(f)
    );
    expect(offenders).toEqual([]);
  });

  it('ships the OG image as a committed static file', () => {
    expect(existsSync(join(APP, 'opengraph-image.png'))).toBe(true);
  });

  it('does not import next/og anywhere', () => {
    // If this ever needs to come back, read lib/seo/README-og.md first and
    // verify with a real deployment, not a local build.
    const offenders = appFiles.filter((f) => {
      if (!/\.(tsx|ts)$/.test(f)) return false;
      const src = readFileSync(f, 'utf8');
      return src.includes("from 'next/og'") || src.includes('from "next/og"');
    });
    expect(offenders).toEqual([]);
  });

  it('references the OG image with its .png extension', () => {
    // The extensionless path 307-redirects into the locale prefix and social
    // crawlers commonly refuse to follow redirects for images.
    const metadataSrc = readFileSync(
      join(process.cwd(), 'lib', 'seo', 'metadata.ts'),
      'utf8'
    );
    expect(metadataSrc).toContain('/opengraph-image.png');
  });
});
