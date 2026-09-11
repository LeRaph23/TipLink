import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The Supabase CLI keys `supabase_migrations.schema_migrations` on the numeric
// prefix of each filename, and that column is the primary key. Two files
// sharing a prefix therefore cannot both be recorded: on a fresh environment
// one of them may silently never run, and nothing reports it.
//
// That is not hypothetical — 00043_audit_fixes.sql and 00043_payout_safety.sql
// both shipped, so `staff_profiles.payouts_frozen`, the advisory-lock payout
// helpers and two audit tables were all at risk of being absent while the code
// reading them assumed otherwise. The second file is now 00078.

const DIR = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

describe('supabase migrations', () => {
  it('has migrations to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('names every file <digits>_<slug>.sql', () => {
    const bad = files.filter((f) => !/^\d+_[a-z0-9_]+\.sql$/.test(f));
    expect(bad).toEqual([]);
  });

  it('gives every migration a unique version prefix', () => {
    const byVersion = new Map<string, string[]>();
    for (const f of files) {
      const version = f.slice(0, f.indexOf('_'));
      byVersion.set(version, [...(byVersion.get(version) ?? []), f]);
    }
    const duplicates = [...byVersion.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([version, names]) => `${version}: ${names.join(', ')}`);
    expect(duplicates).toEqual([]);
  });

  it('guards CREATE POLICY in new migrations', () => {
    // CREATE POLICY has no IF NOT EXISTS in Postgres, so an unguarded one makes
    // its migration fail on any re-apply — which is exactly what a renumbered
    // migration triggers, and why 00078 had to be made idempotent before it
    // could be moved off the duplicated 00043 prefix.
    //
    // Migrations up to GRANDFATHERED_THROUGH predate this rule. They are left
    // alone deliberately: they have already been applied everywhere, editing
    // applied migrations carries more risk than it removes, and the failure
    // mode only bites on a re-apply they will never get. New migrations do not
    // get that excuse.
    const GRANDFATHERED_THROUGH = 77;
    const offenders: string[] = [];
    for (const f of files) {
      if (Number(f.slice(0, f.indexOf('_'))) <= GRANDFATHERED_THROUGH) continue;
      const sql = readFileSync(join(DIR, f), 'utf8');
      for (const [, name, table] of sql.matchAll(/CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+(\S+)/gi)) {
        const dropped = new RegExp(
          `DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+"${name}"\\s+ON\\s+${table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
          'i',
        ).test(sql);
        if (!dropped) offenders.push(`${f}: "${name}" on ${table}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
