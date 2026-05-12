import crypto from 'node:crypto';

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Renders a template string by substituting `{{key}}` placeholders. Values are
 * HTML-escaped to prevent injection. Missing keys are replaced with an empty
 * string to avoid leaking unsubstituted tokens to recipients.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(PLACEHOLDER_RE, (_, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null || v === '') return '';
    return escapeHtml(String(v));
  });
}

/** Extracts the placeholder keys present in a template, for UI hints/preview. */
export function extractPlaceholders(template: string): string[] {
  const out = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    out.add(match[1]);
  }
  return Array.from(out);
}

/** SHA-256 of a UTF-8 string, hex-encoded. */
export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Hashes an IP address with a server-side pepper so the same IP yields the
 * same hash but cannot be reversed without the secret. Falls back to a plain
 * SHA-256 if the pepper isn't set (still useful for evidence).
 */
export function hashIp(ip: string): string {
  const pepper = process.env.AMBASSADOR_SESSION_SECRET ?? '';
  return crypto.createHash('sha256').update(`${pepper}:${ip}`, 'utf8').digest('hex');
}

export function getRequestIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-real-ip') ??
    'unknown'
  );
}
