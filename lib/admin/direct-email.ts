// Shared checks for a free-text email the team sends to an arbitrary address,
// from the super-admin dashboard or the authenticated API route.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type DirectEmailInput = { to: string; subject: string; body: string };

export function validateDirectEmail(
  input: { to?: unknown; subject?: unknown; body?: unknown },
): { ok: true; value: DirectEmailInput } | { ok: false; error: string } {
  const to = typeof input.to === 'string' ? input.to.trim().toLowerCase() : '';
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!EMAIL_RE.test(to) || to.length > 254) return { ok: false, error: 'Adresse e-mail invalide' };
  if (subject.length < 3 || subject.length > 200) return { ok: false, error: "L'objet doit faire 3 à 200 caractères" };
  if (body.length < 5 || body.length > 10000) return { ok: false, error: 'Le message doit faire 5 à 10 000 caractères' };
  return { ok: true, value: { to, subject, body } };
}
