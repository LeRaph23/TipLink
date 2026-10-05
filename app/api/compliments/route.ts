import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { effectivePlan } from '@/lib/billing/entitlements';
import { COMPLIMENT_MESSAGE_MAX, COMPLIMENT_TAGS } from '@/lib/compliments';

export const runtime = 'nodejs';

const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

/**
 * How recent a tip has to be for a compliment to be accepted. The form sits on
 * the success page, so a real one arrives within minutes; a day leaves room
 * for a tab left open, and stops a leaked transaction id being used later to
 * put words in a customer's mouth.
 */
const WINDOW_MS = 24 * 60 * 60 * 1000;

const BodySchema = z.object({
  transactionId: z.string().uuid(),
  tags: z.array(z.enum(COMPLIMENT_TAGS)).max(COMPLIMENT_TAGS.length).default([]),
  message: z.string().max(COMPLIMENT_MESSAGE_MAX).optional(),
});

/**
 * Stores the compliment a tipper left for whoever served them.
 *
 * Unauthenticated by necessity, like /api/reviews/click: the tipper has no
 * account. What stands in for auth is holding the id of a real, recent,
 * succeeded tip, and the unique index means each tip carries one compliment
 * at most. The recipient is read from the transaction, never from the body,
 * so nobody can address a compliment to a colleague who did not serve them.
 *
 * Answers `{ ok: true }` for anything well-formed, including a tip that does
 * not exist or a group without Pro: the customer sees a thank-you either way,
 * and a status that varied would only tell a caller which ids are real.
 */
export async function POST(request: NextRequest) {
  const ok = NextResponse.json({ ok: true });

  const rl = await rateLimit(`compliment:${getClientIp(request.headers)}`, RATE_LIMIT);
  if (!rl.ok) return NextResponse.json({ ok: false }, { status: 429 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const tags = [...new Set(parsed.data.tags)];
  const message = parsed.data.message?.trim() || null;
  if (tags.length === 0 && !message) return NextResponse.json({ ok: false }, { status: 400 });

  const service = createServiceClient();
  const { data: tx } = await service
    .from('transactions')
    .select('id, establishment_id, staff_id, status, created_at, establishments(group_id, groups(plan, pro_trial_ends_at))')
    .eq('id', parsed.data.transactionId)
    .maybeSingle();

  if (!tx || tx.status !== 'succeeded' || !tx.establishment_id) return ok;
  if (Date.now() - new Date(tx.created_at).getTime() > WINDOW_MS) return ok;

  // The form is only rendered for Pro groups; this is the same check made
  // where it can be trusted.
  const group = (tx.establishments as { groups?: { plan?: string | null; pro_trial_ends_at?: string | null } | null } | null)?.groups;
  if (effectivePlan(group) !== 'pro') return ok;

  const { error } = await service.from('tip_compliments').insert({
    transaction_id: tx.id,
    establishment_id: tx.establishment_id,
    staff_id: tx.staff_id,
    tags,
    message,
  } as never);

  // A second submission for the same tip is refused by the unique index, which
  // is the intended outcome rather than an error.
  if (error && error.code !== '23505') {
    console.error('[compliments]', error.message);
  }

  return ok;
}
