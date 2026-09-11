import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { serverSchema } from '@/lib/env';
import { REQUIRED_SERVER_VARS } from '@/lib/env-requirements';

// `scripts/check-env.ts` is the last thing that runs before a deploy, and it
// used to keep its own hand-written copy of the required-variable list. That
// copy had drifted three variables behind serverSchema — CRON_SECRET,
// COLD_EMAIL_UNSUB_SECRET and ONBOARDING_TOKEN_SECRET — so the script printed
// "Ready to deploy" for a configuration where the first server action to call
// serverEnv() throws `Invalid server environment variables` in production.
//
// The script now reads lib/env-requirements.ts. This test is what keeps that
// file honest: add a required variable to serverSchema and forget the list,
// and this fails rather than a deploy.

/** Required = present in the schema and not `.optional()`. */
function requiredKeysOf(schema: z.ZodObject<z.ZodRawShape>): string[] {
  return Object.entries(schema.shape)
    .filter(([, field]) => !(field as z.ZodTypeAny).isOptional())
    .map(([key]) => key)
    .sort();
}

/** The `min(n)` floor a string field enforces, if any. */
function minLengthOf(field: z.ZodTypeAny): number | null {
  const checks = (field as unknown as { _def?: { checks?: unknown[] } })._def?.checks;
  if (!Array.isArray(checks)) return null;
  for (const check of checks) {
    const def = (check as { _zod?: { def?: { check?: string; minimum?: number } } })._zod?.def;
    if (def?.check === 'min_length' && typeof def.minimum === 'number') return def.minimum;
    const legacy = check as { kind?: string; value?: number };
    if (legacy.kind === 'min' && typeof legacy.value === 'number') return legacy.value;
  }
  return null;
}

describe('required server env parity', () => {
  const listed = REQUIRED_SERVER_VARS.map((v) => v.key).sort();

  it('lists every variable serverSchema requires', () => {
    expect(listed).toEqual(requiredKeysOf(serverSchema));
  });

  it('lists no variable serverSchema does not require', () => {
    const schemaKeys = Object.keys(serverSchema.shape);
    for (const key of listed) expect(schemaKeys).toContain(key);
  });

  it('mirrors each variable minimum length', () => {
    for (const { key, minLength } of REQUIRED_SERVER_VARS) {
      const field = serverSchema.shape[key as keyof typeof serverSchema.shape] as z.ZodTypeAny;
      const schemaMin = minLengthOf(field);
      // A required field with no explicit floor is fine; a mismatched one is
      // not, because check-env.ts would then pass a value serverEnv() rejects.
      if (schemaMin !== null) {
        expect(`${key}:${minLength}`).toBe(`${key}:${schemaMin}`);
      }
    }
  });

  it('gives every entry a usable hint', () => {
    for (const { key, hint } of REQUIRED_SERVER_VARS) {
      expect(hint.trim().length, `${key} needs a hint`).toBeGreaterThan(0);
    }
  });
});
