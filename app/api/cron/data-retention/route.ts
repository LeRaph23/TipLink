import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isAuthorizedCronRequest } from '@/lib/auth/require-cron';
import { RETENTION, cutoff } from '@/lib/privacy/retention';

export const runtime = 'nodejs';

/**
 * Applies the retention periods the privacy policy promises (RGPD art. 5.1.e).
 * Before this ran, nothing was ever deleted: Stripe payloads, contact leads,
 * prospects and PIN attempts accumulated indefinitely.
 *
 * Accounting records (transactions, orders, invoices: 10 years), signed
 * partner contracts (5 years after they end) and the append-only lifecycle
 * e-mail log (its dedup keys stop one-off e-mails being sent twice) are
 * deliberately not touched here.
 * Each step is independent; one failing does not stop the others.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const results: Record<string, number | string> = {};

  async function step(name: string, run: () => PromiseLike<{ error: unknown; count?: number | null }>) {
    try {
      const { error, count } = await run();
      if (error) throw error;
      results[name] = count ?? 0;
    } catch (err) {
      console.error(`[data-retention] ${name} failed`, err);
      results[name] = 'error';
    }
  }

  await step('ambassador_pin_attempts', () =>
    service.from('ambassador_pin_attempts').delete({ count: 'exact' })
      .lt('attempted_at', cutoff(RETENTION.pinAttemptsMs)));

  await step('commercial_pin_attempts', () =>
    service.from('commercial_pin_attempts').delete({ count: 'exact' })
      .lt('attempted_at', cutoff(RETENTION.pinAttemptsMs)));

  // Processed events only: a failed one may still be replayed by hand.
  await step('webhook_payloads_scrubbed', () =>
    service.from('webhook_events').update({ payload: {} }, { count: 'exact' })
      .not('processed_at', 'is', null)
      .lt('created_at', cutoff(RETENTION.webhookPayloadMs))
      .neq('payload', '{}'));

  await step('contact_requests', () =>
    service.from('contact_requests').delete({ count: 'exact' })
      .lt('created_at', cutoff(RETENTION.contactRequestsMs)));

  // Prospects never contacted since import, or last contacted, 3+ years ago.
  // An unsubscribed prospect keeps only its SIRET and the opt-out date (the
  // suppression list that stops a re-import from writing to them again).
  const prospectCutoff = cutoff(RETENTION.prospectsMs);
  await step('prospects_expired', () =>
    service.from('cold_email_prospects').delete({ count: 'exact' })
      .is('unsubscribed_at', null)
      .or(`and(last_sent_at.is.null,imported_at.lt.${prospectCutoff}),last_sent_at.lt.${prospectCutoff}`));

  await step('prospects_unsubscribed_minimized', () =>
    service.from('cold_email_prospects')
      .update({
        email: null,
        first_name: null,
        birth_year_estimate: null,
        linkedin_url: null,
        notes: null,
      }, { count: 'exact' })
      .not('unsubscribed_at', 'is', null)
      .not('email', 'is', null));

  const appCutoff = cutoff(RETENTION.rejectedApplicationsMs);
  await step('ambassador_applications', () =>
    service.from('ambassador_recruitment_applications').delete({ count: 'exact' })
      .neq('status', 'accepted')
      .lt('created_at', appCutoff));

  await step('commercial_applications', () =>
    service.from('commercial_recruitment_applications').delete({ count: 'exact' })
      .neq('status', 'accepted')
      .lt('created_at', appCutoff));

  // Keep the verdict (location_verified, distance_m), drop the coordinates.
  await step('visit_gps_scrubbed', () =>
    service.from('salon_visits')
      .update({ gps_lat: null, gps_lon: null, gps_accuracy_m: null }, { count: 'exact' })
      .not('gps_lat', 'is', null)
      .lt('visited_at', cutoff(RETENTION.visitGpsMs)));

  return NextResponse.json({ ok: true, results });
}
