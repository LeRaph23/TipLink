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
// reading them assumed otherwise. The payout_safety half now lives at the end
// of 00042_group_tip_transfers.sql, the migration it actually shipped with.
//
// It was merged rather than renumbered upwards, and the attempt to renumber it
// is what produced the second test below.

const DIR = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const versionOf = (f: string) => f.slice(0, f.indexOf('_'));

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
      byVersion.set(versionOf(f), [...(byVersion.get(versionOf(f)) ?? []), f]);
    }
    const duplicates = [...byVersion.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([version, names]) => `${version}: ${names.join(', ')}`);
    expect(duplicates).toEqual([]);
  });

  it('never uses a table before the migration that creates it', () => {
    // Unique prefixes are not enough: the files also have to be in dependency
    // order, because a fresh database replays them in filename order and there
    // is no second pass.
    //
    // This test exists because renumbering payout_safety from 00043 to 00078 to
    // fix the duplicate above moved it *after* 00075_tip_allocations.sql, which
    // renames `staff_payouts` and reshapes `negative_balance_events`. Only
    // payout_safety creates `staff_payouts`, so a fresh replay died on 00075 —
    // and the `supabase start` job in CI, the one thing that would have caught
    // it, could never go green to report it.
    const sql = new Map(files.map((f) => [f, readFileSync(join(DIR, f), 'utf8')]));

    // Where each table is first created. A table that appears through a RENAME
    // rather than a CREATE is absent here, so it is simply not checked.
    const createdIn = new Map<string, number>();
    files.forEach((f, i) => {
      for (const [, table] of sql
        .get(f)!
        .matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-z0-9_]+)/gi)) {
        if (!createdIn.has(table.toLowerCase())) createdIn.set(table.toLowerCase(), i);
      }
    });

    const offenders: string[] = [];
    files.forEach((f, i) => {
      const body = sql.get(f)!;
      const used = new Set<string>();
      for (const pattern of [
        /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?public\.([a-z0-9_]+)/gi,
        /\bON\s+public\.([a-z0-9_]+)/gi,
        /REFERENCES\s+public\.([a-z0-9_]+)/gi,
      ]) {
        for (const [, table] of body.matchAll(pattern)) used.add(table.toLowerCase());
      }
      for (const table of used) {
        const created = createdIn.get(table);
        if (created !== undefined && created > i) {
          offenders.push(`${f} uses public.${table}, created later in ${files[created]}`);
        }
      }
    });
    expect(offenders).toEqual([]);
  });

  it('guards CREATE POLICY in new migrations', () => {
    // CREATE POLICY has no IF NOT EXISTS in Postgres, so an unguarded one makes
    // its migration fail on any re-apply.
    //
    // Migrations up to GRANDFATHERED_THROUGH predate this rule. They are left
    // alone deliberately: they have already been applied everywhere, editing
    // applied migrations carries more risk than it removes, and the failure
    // mode only bites on a re-apply they will never get. New migrations do not
    // get that excuse.
    const GRANDFATHERED_THROUGH = 77;
    const offenders: string[] = [];
    for (const f of files) {
      if (Number(versionOf(f)) <= GRANDFATHERED_THROUGH) continue;
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
