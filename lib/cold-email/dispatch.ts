// Cold email dispatch — single place that translates a prospect row into
// the right send call and updates the funnel state.
//
// Routes by `target_program`:
//   - 'ambassador' → Resend / sendColdEmailStep, FROM ambassadeur@digitip.app
//   - 'commercial' → Brevo / sendCommercialColdEmailStep, FROM raphael@partenaires.digitip.app
//
// Reputation isolation is the whole point of having two providers — a
// degraded commercial cold-mail score can never spill onto transactional
// digitip.app traffic.

import { createServiceClient } from '@/lib/supabase/service';
import { getBaseUrl } from '@/lib/env';
import { signColdEmailUnsubToken } from '@/lib/cold-email/unsub-token';
import {
  sendColdEmailStep,
  sendCommercialColdEmailStep,
} from '@/lib/email';

export type ColdProgram = 'ambassador' | 'commercial';

type ProspectRow = {
  id: string;
  siret: string | null;
  email: string | null;
  first_name: string | null;
  company_name: string | null;
  city: string | null;
  sequence_step: number;
  target_program: ColdProgram;
};

const LANDING_URLS: Record<ColdProgram, string> = {
  ambassador: '/fr/devenir-ambassadeur',
  commercial: '/fr/devenir-commercial-pro',
};

/**
 * Sends the next step for one prospect. Caller decides whom to send to (the
 * cron / batch action queries the eligible rows) — this function only:
 *   1. Builds the unsubscribe token + landing URL
 *   2. Calls the right channel (Resend or Brevo)
 *   3. Updates sequence_step + last_sent_at on success
 * Returns "sent" / "skipped" / "failed" for the caller's tally.
 */
export async function dispatchColdEmailNext(
  prospect: ProspectRow,
): Promise<'sent' | 'skipped' | 'failed'> {
  if (!prospect.email) return 'skipped';
  if (prospect.sequence_step >= 3) return 'skipped';
  const nextStep = (prospect.sequence_step + 1) as 1 | 2 | 3;

  // A SIRET is required to mint a signed unsub token. Manually-created
  // prospects (no SIRET) can't be sent to cold — they have to be contacted
  // by other means (the unsub link is the compliance backbone).
  if (!prospect.siret) return 'skipped';

  const baseUrl = getBaseUrl();
  const unsubscribeUrl = `${baseUrl}/api/cold-email/unsubscribe/${signColdEmailUnsubToken(prospect.siret)}`;
  const landingUrl = `${baseUrl}${LANDING_URLS[prospect.target_program]}`;

  let ok = false;
  let errMsg: string | null = null;
  try {
    if (prospect.target_program === 'commercial') {
      const r = await sendCommercialColdEmailStep({
        to: prospect.email,
        firstName: prospect.first_name,
        companyName: prospect.company_name,
        city: prospect.city,
        step: nextStep,
        unsubscribeUrl,
        landingUrl,
      });
      ok = r.ok;
      errMsg = r.error ?? null;
    } else {
      const r = await sendColdEmailStep({
        to: prospect.email,
        firstName: prospect.first_name,
        city: prospect.city,
        step: nextStep,
        unsubscribeUrl,
        landingUrl,
      });
      ok = r.ok;
    }
  } catch (e) {
    errMsg = e instanceof Error ? e.message : 'unknown';
  }

  if (!ok) {
    console.error('[cold-email] dispatch failed', {
      id: prospect.id, program: prospect.target_program, step: nextStep, error: errMsg,
    });
    return 'failed';
  }

  const service = createServiceClient();
  await service
    .from('cold_email_prospects')
    .update({ sequence_step: nextStep, last_sent_at: new Date().toISOString() })
    .eq('id', prospect.id);

  return 'sent';
}

type BatchOptions = {
  /** Per-program cap. Default 50 — well below Brevo free 300/day and below
   *  most Gmail/Outlook bulk-sender thresholds for a new sending domain. */
  limit?: number;
  /** Only send a follow-up if last_sent_at is older than this. Default 4 days. */
  followUpDelayDays?: number;
  /** Restrict to a single program. Omit to process both. */
  program?: ColdProgram;
};

export type ColdBatchTally = {
  program: ColdProgram;
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
};

/**
 * One pass of the cold-email batch sender. Picks eligible prospects per
 * program (sequence_step ∈ {0,1,2}, not unsubscribed, not replied, has email,
 * follow-up delay elapsed) and dispatches up to `limit` per program.
 *
 * Idempotent enough: each row's sequence_step is bumped on a successful
 * send, so re-running the batch the same day is a no-op for already-bumped
 * rows. Failed sends are NOT bumped, so they retry on the next run.
 */
export async function runColdEmailBatch(opts: BatchOptions = {}): Promise<ColdBatchTally[]> {
  const limit = opts.limit ?? 50;
  const followUpDelayDays = opts.followUpDelayDays ?? 4;
  const programs: ColdProgram[] = opts.program ? [opts.program] : ['ambassador', 'commercial'];
  const service = createServiceClient();

  const followUpCutoff = new Date(Date.now() - followUpDelayDays * 86400000).toISOString();
  const tallies: ColdBatchTally[] = [];

  for (const program of programs) {
    const t: ColdBatchTally = { program, considered: 0, sent: 0, skipped: 0, failed: 0 };

    // Step-0 prospects (never sent) — fire the first email.
    const { data: step0 } = await service
      .from('cold_email_prospects')
      .select('id, siret, email, first_name, company_name, city, sequence_step, target_program')
      .eq('target_program', program)
      .eq('sequence_step', 0)
      .not('email', 'is', null)
      .is('unsubscribed_at', null)
      .is('replied_at', null)
      .order('imported_at', { ascending: true })
      .limit(limit);

    // Follow-ups for step 1 and 2 — gated by the configured delay.
    const { data: stepFollow } = await service
      .from('cold_email_prospects')
      .select('id, siret, email, first_name, company_name, city, sequence_step, target_program')
      .eq('target_program', program)
      .in('sequence_step', [1, 2])
      .lt('last_sent_at', followUpCutoff)
      .not('email', 'is', null)
      .is('unsubscribed_at', null)
      .is('replied_at', null)
      .order('last_sent_at', { ascending: true })
      .limit(limit);

    const rows = [...(step0 ?? []), ...(stepFollow ?? [])].slice(0, limit);
    for (const row of rows) {
      t.considered++;
      const outcome = await dispatchColdEmailNext(row as ProspectRow);
      t[outcome]++;
    }

    tallies.push(t);
  }

  return tallies;
}
