import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// user_roles is unique on COALESCE(group_id, …) / COALESCE(establishment_id, …)
// expressions (migration 00001). PostgREST's upsert(onConflict) can only name
// plain columns, so any upsert on this table fails with 42P10 — and because
// role writes are easy to leave unchecked, it fails silently. The express
// onboarding did exactly that and left a paying customer with an account
// attached to no salon. Writes must be inserts that treat 23505 as success.

const ROOTS = ['actions', 'app', 'lib'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('user_roles writes', () => {
  it('never upsert into user_roles', () => {
    const offenders = ROOTS.flatMap(sourceFiles).filter((file) =>
      /from\(\s*['"]user_roles['"]\s*\)\s*\.upsert\(/.test(readFileSync(file, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });
});
