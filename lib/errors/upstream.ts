// Detects transient outbound connectivity failures — an external dependency
// (Stripe, Upstash, Resend, …) being unreachable — as opposed to a logic or
// validation error. Lets API routes answer 503 + a "service temporarily
// unavailable" code the UI can turn into a clear, retryable message instead of
// a generic failure.
//
// The shapes covered:
//  - Node/undici `fetch()` rejection → `TypeError: fetch failed` (the cause we
//    actually saw in production logs);
//  - Stripe SDK connectivity errors, which carry a `type` discriminator;
//  - raw socket error codes, sometimes on `err.code`, sometimes nested on
//    `err.cause.code` (undici wraps them).
export function isUpstreamUnavailable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  if (err.message.includes('fetch failed')) return true;

  const type = (err as { type?: string }).type;
  if (type === 'StripeConnectionError' || type === 'StripeAPIError') return true;

  const code =
    (err as { code?: string }).code ??
    (err as { cause?: { code?: string } }).cause?.code;
  if (!code) return false;

  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_SOCKET' ||
    code === 'UND_ERR_HEADERS_TIMEOUT'
  );
}
