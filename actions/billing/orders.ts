'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAdminAction } from '@/lib/admin/audit';
import { sendOrderCanceled } from '@/lib/email';
import { stripe } from '@/lib/stripe/client';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// Group-admin-scoped cancellation. Mirrors the super-admin cancelOrder
// (actions/admin/orders.ts) but enforces that the caller owns the order's
// group through user_roles.role = 'group_admin'.
//
// Same business rules:
//   - cancellable only while pending_payment / pending_fulfillment /
//     encoding / ready_to_ship — once it leaves our hands a refund flow
//     is required instead.
//   - releases tags: NULL out establishment_id on every encoded tag and
//     drop the smarttag_order_tags reservation rows.
export async function cancelMyOrder(
  orderId: string,
  reason: string | null
): Promise<Result<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };

  const service = createServiceClient();

  // Caller must be group_admin (or super_admin) of the order's group.
  const { data: order } = await service
    .from('smarttag_orders')
    .select('id, group_id, pack, quantity, status, stripe_payment_intent_id')
    .eq('id', orderId)
    .single();
  if (!order) return { ok: false, error: 'Order not found' };

  const { data: roles } = await service
    .from('user_roles')
    .select('role, group_id')
    .eq('user_id', user.id);

  const canManage =
    (roles ?? []).some((r) => r.role === 'super_admin') ||
    (roles ?? []).some((r) => r.role === 'group_admin' && r.group_id === order.group_id);

  if (!canManage) return { ok: false, error: 'Forbidden' };

  const cancellable = new Set([
    'pending_payment',
    'pending_fulfillment',
    'encoding',
    'ready_to_ship',
  ]);
  if (!cancellable.has(order.status)) {
    return { ok: false, error: `Cannot cancel an order in status "${order.status}"` };
  }

  // 1. release tags back to the pool
  const { data: linked } = await service
    .from('smarttag_order_tags')
    .select('sticker_id')
    .eq('order_id', orderId);
  const stickerIds = (linked ?? []).map((r) => r.sticker_id);

  if (stickerIds.length > 0) {
    const { error: relErr } = await service
      .from('nfc_stickers')
      .update({ establishment_id: null })
      .in('id', stickerIds);
    if (relErr) return { ok: false, error: `Could not release tags — ${relErr.message}` };

    const { error: delErr } = await service
      .from('smarttag_order_tags')
      .delete()
      .eq('order_id', orderId);
    if (delErr) return { ok: false, error: `Could not unreserve tags — ${delErr.message}` };
  }

  // 2. flip status
  const { error: updErr } = await service
    .from('smarttag_orders')
    .update({ status: 'canceled', tags_encoded_count: 0, fulfilled_at: null })
    .eq('id', orderId);
  if (updErr) return { ok: false, error: updErr.message };

  await logAdminAction('orders.self_cancel', {
    orderId,
    reason,
    releasedTags: stickerIds.length,
    actor: user.email,
  });

  // 3. notify the customer (themselves) so they have a trace in their inbox
  if (user.email) {
    sendOrderCanceled({
      to: user.email,
      pack: order.pack,
      quantity: order.quantity,
      orderId: order.id,
      reason,
    }).catch(() => {});
  }

  revalidatePath('/dashboard/billing');
  revalidatePath(`/dashboard/billing/orders/${orderId}`);
  return { ok: true, data: null };
}

// Resolves the amount + currency + payment-method label for the customer
// detail view. Reads Stripe payment data (amount, receipt URL), so it MUST be
// gated: the caller has to own the order's group (or be super_admin). Without
// this check any user could enumerate orderIds and read other salons' payment
// info / receipts.
export async function getOrderPaymentSummary(
  orderId: string
): Promise<
  | {
      ok: true;
      data: { amount: number; currency: string; paymentMethod: string | null; receiptUrl: string | null };
    }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };

  const service = createServiceClient();
  const { data: order } = await service
    .from('smarttag_orders')
    .select('group_id, stripe_payment_intent_id, stripe_checkout_session_id')
    .eq('id', orderId)
    .single();
  if (!order) return { ok: false, error: 'Order not found' };

  // Caller must be group_admin (or super_admin) of the order's group.
  const { data: roles } = await service
    .from('user_roles')
    .select('role, group_id')
    .eq('user_id', user.id);
  const canManage =
    (roles ?? []).some((r) => r.role === 'super_admin') ||
    (roles ?? []).some((r) => r.role === 'group_admin' && r.group_id === order.group_id);
  if (!canManage) return { ok: false, error: 'Forbidden' };

  try {
    if (order.stripe_payment_intent_id) {
      const intent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id, {
        expand: ['latest_charge'],
      });
      const charge = intent.latest_charge as import('stripe').Stripe.Charge | null;
      const pmType = charge?.payment_method_details?.type ?? null;
      // Map raw Stripe type to a humane label
      const niceType: Record<string, string> = {
        card: 'Carte bancaire',
        link: 'Link',
        sepa_debit: 'Prélèvement SEPA',
        apple_pay: 'Apple Pay',
        google_pay: 'Google Pay',
      };
      return {
        ok: true,
        data: {
          amount: intent.amount,
          currency: intent.currency.toUpperCase(),
          paymentMethod: pmType ? niceType[pmType] ?? pmType : null,
          receiptUrl: charge?.receipt_url ?? null,
        },
      };
    }
    if (order.stripe_checkout_session_id) {
      const session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
      return {
        ok: true,
        data: {
          amount: session.amount_total ?? 0,
          currency: (session.currency ?? 'eur').toUpperCase(),
          paymentMethod: null,
          receiptUrl: null,
        },
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Stripe lookup failed';
    return { ok: false, error: msg };
  }
  return { ok: false, error: 'No payment reference on this order' };
}
