import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

/**
 * How recent a tip has to be for its review click to count.
 *
 * The invitation is shown on the success page immediately after paying, so a
 * genuine click lands within minutes. A week is generous room for a customer
 * who left the tab open, and it keeps a transaction id that leaks into a log
 * or a browser history from being replayable forever.
 */
const CLICK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const BodySchema = z.object({ transactionId: z.string().uuid() });

/**
 * Records that the customer who left this tip opened the Google review page.
 *
 * Unauthenticated by necessity: the person clicking is the tipper, who has no
 * account and never will. What stands in for auth is that the caller must
 * already hold a real transaction id, the transaction must have succeeded and
 * be recent, and the unique index means a given tip can only ever count once.
 * So the worst a forged call can do is claim a click for a tip that really
 * happened, and only within its own week.
 *
 * It answers 204 in every case, including the ones it rejects. The browser
 * fires this while navigating away to Google and cannot act on a failure; a
 * status code that varied would only tell a caller which transaction ids are
 * real.
 */
export async function POST(request: NextRequest) {
  const noContent = new NextResponse(null, { status: 204 });

  const rl = await rateLimit(`review-click:${getClientIp(request.headers)}`, RATE_LIMIT);
  if (!rl.ok) return noContent;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return noContent;
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return noContent;

  const service = createServiceClient();
  const { data: tx } = await service
    .from('transactions')
    .select('id, establishment_id, status, created_at')
    .eq('id', parsed.data.transactionId)
    .maybeSingle();

  if (!tx || tx.status !== 'succeeded') return noContent;
  if (Date.now() - new Date(tx.created_at).getTime() > CLICK_WINDOW_MS) return noContent;

  // Second press, or a page reopened from history: the row already exists and
  // the unique index refuses it, which is the intended outcome rather than an
  // error to report.
  const { error } = await service
    .from('review_clicks')
    .insert({ transaction_id: tx.id, establishment_id: tx.establishment_id });

  if (error && error.code !== '23505') {
    console.error('[review-click]', error.message);
  }

  return noContent;
}
