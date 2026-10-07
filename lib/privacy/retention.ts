/**
 * Retention periods applied by the daily data-retention cron. Each one is the
 * period the Politique de confidentialité (messages/*.json, legal.privacy.s5)
 * announces, or a shorter one where nothing needs the data longer. Change the
 * policy text and this table together.
 */
const DAY = 24 * 60 * 60 * 1000;

export const RETENTION = {
  /** PIN guesses only feed the rate limiter (largest window: 24 h). */
  pinAttemptsMs: 7 * DAY,
  /**
   * Stripe event payloads carry customer e-mails and addresses. Ninety days
   * covers replays and disputes; Stripe keeps its own copy. The row itself
   * (id, type, processed_at) stays for idempotency.
   */
  webhookPayloadMs: 90 * DAY,
  /** Contact-form leads: 3 years after the request (prospect, CNIL). */
  contactRequestsMs: 3 * 365 * DAY,
  /** Cold-email prospects: 3 years after the last contact (or import). */
  prospectsMs: 3 * 365 * DAY,
  /** Partner applications not followed by a contract: 2 years. */
  rejectedApplicationsMs: 2 * 365 * DAY,
  /** GPS fixes of partner visits: needed only to verify the visit. */
  visitGpsMs: 30 * DAY,
} as const;

export function cutoff(ms: number, now: number = Date.now()): string {
  return new Date(now - ms).toISOString();
}
