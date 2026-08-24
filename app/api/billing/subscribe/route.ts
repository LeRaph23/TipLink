import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { stripe } from '@/lib/stripe/client';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getManageScope, canManageGroup } from '@/lib/auth/ownership';
import { getBaseUrl, serverEnv } from '@/lib/env';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isUpstreamUnavailable } from '@/lib/errors/upstream';

export const runtime = 'nodejs';

const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

const BodySchema = z.object({
  groupId: z.string().uuid(),
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
  locale: z.enum(['fr', 'en']).default('fr'),
});

/**
 * Starts a Digitip Pro subscription, or opens the Stripe billing portal for a
 * group that already has one.
 *
 * The group's `stripe_customer_id` is reused when the hardware purchase already
 * created one, so a customer never ends up with two Stripe identities and a
 * split invoice history.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`subscribe:${ip}`, RATE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 });
  }
  const { groupId, interval, locale } = parsed.data;

  const scope = await getManageScope();
  if (!scope || !canManageGroup(scope, groupId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const env = serverEnv();
  const priceId = interval === 'yearly' ? env.STRIPE_PRICE_PRO_YEARLY : env.STRIPE_PRICE_PRO_MONTHLY;
  if (!priceId) {
    // Deliberately not a 500: the price simply isn't configured in this
    // environment, and everything else keeps working on the free plan.
    console.error('[subscribe] no Pro price configured for interval', interval);
    return NextResponse.json({ error: 'pro_unavailable' }, { status: 503 });
  }

  const service = createServiceClient();
  const { data: group } = await service
    .from('groups')
    .select('id, name, stripe_customer_id, stripe_subscription_id')
    .eq('id', groupId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

  const base = getBaseUrl();
  const returnUrl = `${base}/${locale}/dashboard/billing`;

  try {
    // Already subscribed → the portal, where they can change plan or cancel.
    if (group.stripe_subscription_id && group.stripe_customer_id) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: group.stripe_customer_id,
        return_url: returnUrl,
      });
      return NextResponse.json({ url: portal.url, mode: 'portal' });
    }

    let customerId = group.stripe_customer_id;
    if (!customerId) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const customer = await stripe.customers.create(
        {
          name: group.name,
          ...(user?.email ? { email: user.email } : {}),
          metadata: { group_id: group.id },
        },
        { idempotencyKey: `pro-customer:${group.id}` },
      );
      customerId = customer.id;
      await service.from('groups').update({ stripe_customer_id: customerId }).eq('id', group.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${returnUrl}?pro=success`,
      cancel_url: `${returnUrl}?pro=cancelled`,
      locale,
      // The webhook resolves the group from here. Both are set: the session
      // metadata covers checkout.session.completed, and subscription_data
      // stamps the subscription itself so later customer.subscription.* events
      // can be resolved without another lookup.
      metadata: { group_id: group.id, source: 'pro-subscription' },
      subscription_data: { metadata: { group_id: group.id } },
      automatic_tax: { enabled: true },
      customer_update: { address: 'auto', name: 'auto' },
    });

    return NextResponse.json({ url: session.url, mode: 'checkout' });
  } catch (err) {
    console.error('[subscribe]', err instanceof Error ? err.message : err);
    if (isUpstreamUnavailable(err)) {
      return NextResponse.json({ error: 'billing_unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: 'billing_failed' }, { status: 500 });
  }
}
