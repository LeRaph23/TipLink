// Rate limiting with Upstash Redis when configured (prod-safe across instances),
// falling back to an in-memory token bucket for local dev / preview.
//
// To enable the Redis backend, set:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//
// The in-memory backend is per-instance only — on Vercel serverless each cold
// start gets a fresh Map. It bounds burst abuse from a single warm lambda but
// does not hold across instances.

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

interface Entry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Entry>();

function inMemoryRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }

  if (entry.count >= limit) {
    return { ok: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { ok: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

async function upstashRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return inMemoryRateLimit(key, { limit, windowMs });
  }

  const windowSec = Math.ceil(windowMs / 1000);
  const redisKey = `rl:${key}:${Math.floor(Date.now() / windowMs)}`;

  // Pipeline: INCR + EXPIRE (NX).
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', redisKey],
      ['EXPIRE', redisKey, String(windowSec), 'NX'],
    ]),
    cache: 'no-store',
  });

  if (!res.ok) {
    // Fail open on Redis outage rather than lock out legitimate users.
    return inMemoryRateLimit(key, { limit, windowMs });
  }

  const out = (await res.json()) as Array<{ result: number }>;
  const count = out[0]?.result ?? 1;
  const resetAt = (Math.floor(Date.now() / windowMs) + 1) * windowMs;

  if (count > limit) {
    return { ok: false, remaining: 0, resetAt };
  }
  return { ok: true, remaining: Math.max(0, limit - count), resetAt };
}

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): RateLimitResult | Promise<RateLimitResult> {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return upstashRateLimit(key, opts);
  }
  return inMemoryRateLimit(key, opts);
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
