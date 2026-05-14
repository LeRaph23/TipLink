'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAdminAction } from '@/lib/admin/audit';
import {
  sendOrderShipped,
  sendOrderDelivered,
  sendOrderConfirmation,
  sendOrderCanceled,
  sendOrderCustomNote,
} from '@/lib/email';
import { stripe } from '@/lib/stripe/client';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function assertSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, ok: false as const, error: 'Unauthorized' };

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  const isSuperAdmin = (roles ?? []).some((r) => r.role === 'super_admin');
  if (!isSuperAdmin) return { supabase, ok: false as const, error: 'Forbidden' };

  return { supabase, ok: true as const };
}

/** Find the group admin's email for a given group. */
async function getGroupAdminEmail(groupId: string): Promise<{ email: string; locale: string } | null> {
  const service = createServiceClient();
  const { data: role } = await service
    .from('user_roles')
    .select('user_id')
    .eq('group_id', groupId)
    .eq('role', 'group_admin')
    .limit(1)
    .single();
  if (!role) return null;

  const { data: { user } } = await service.auth.admin.getUserById(role.user_id);
  if (!user?.email) return null;

  const locale = (user.user_metadata?.locale as string | undefined) ?? 'fr';
  return { email: user.email, locale };
}

/**
 * Resolve the customer email for an order, regardless of whether the group
 * has finished onboarding yet. Tries the group_admin user first, then falls
 * back to the Stripe customer attached to the group, then to the billing
 * details on the PaymentIntent / Charge of the order (covers Link express
 * checkouts that don't carry a Supabase user yet).
 */
async function resolveOrderRecipient(
  orderId: string
): Promise<{ email: string; locale: string; onboardingUrl: string | null } | null> {
  const service = createServiceClient();
  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? '';

  const { data: order } = await service
    .from('smarttag_orders')
    .select('group_id, stripe_payment_intent_id, stripe_checkout_session_id')
    .eq('id', orderId)
    .single();
  if (!order) return null;

  // 1) Onboarded group — use the group_admin Supabase user.
  const admin = await getGroupAdminEmail(order.group_id);
  if (admin) {
    return {
      email: admin.email,
      locale: admin.locale,
      onboardingUrl: `${base}/dashboard`,
    };
  }

  // 2) Pre-onboarding express groups — try the Stripe customer.
  const { data: grp } = await service
    .from('groups')
    .select('stripe_customer_id')
    .eq('id', order.group_id)
    .single();

  if (grp?.stripe_customer_id) {
    try {
      const customer = await stripe.customers.retrieve(grp.stripe_customer_id);
      if (!customer.deleted && customer.email) {
        return {
          email: customer.email,
          locale: 'fr',
          onboardingUrl: `${base}/fr/onboarding?group=${order.group_id}&email=${encodeURIComponent(customer.email)}`,
        };
      }
    } catch { /* swallow — fall through */ }
  }

  // 3) Fallback to the billing_details on the PI's charge (Link populates it).
  if (order.stripe_payment_intent_id) {
    try {
      const intent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
      const chargeId = typeof intent.latest_charge === 'string'
        ? intent.latest_charge
        : intent.latest_charge?.id;
      if (chargeId) {
        const charge = await stripe.charges.retrieve(chargeId);
        const email = intent.receipt_email ?? charge.billing_details?.email ?? null;
        if (email) {
          return {
            email,
            locale: 'fr',
            onboardingUrl: `${base}/fr/onboarding?group=${order.group_id}&email=${encodeURIComponent(email)}`,
          };
        }
      }
    } catch { /* swallow */ }
  }

  return null;
}

/**
 * Fulfill an order: link a batch of stock tags to the order and to
 * an establishment of the order's group. Updates counters/status.
 */
export async function fulfillOrder(
  orderId: string,
  stickerIds: string[],
  establishmentId: string
): Promise<Result<{ encoded_count: number; total_quantity: number; status: string }>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!stickerIds.length) return { ok: false, error: 'No tags selected' };

  const { data: order } = await auth.supabase
    .from('smarttag_orders')
    .select('id, group_id, quantity, tags_encoded_count, status')
    .eq('id', orderId)
    .single();
  if (!order) return { ok: false, error: 'Order not found' };

  const { data: est } = await auth.supabase
    .from('establishments')
    .select('id, group_id')
    .eq('id', establishmentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!est) return { ok: false, error: 'Establishment not found' };
  if (est.group_id !== order.group_id) {
    return { ok: false, error: 'Establishment does not belong to the order group' };
  }

  if (order.tags_encoded_count + stickerIds.length > order.quantity) {
    return { ok: false, error: 'Exceeds order quantity' };
  }

  // Assign tags
  const { data: updated, error: upErr } = await auth.supabase
    .from('nfc_stickers')
    .update({ establishment_id: establishmentId })
    .in('id', stickerIds)
    .is('establishment_id', null)
    .select('id');
  if (upErr) return { ok: false, error: upErr.message };
  if ((updated ?? []).length !== stickerIds.length) {
    return { ok: false, error: 'Some tags were not in stock' };
  }

  // Link to order
  const { error: linkErr } = await auth.supabase
    .from('smarttag_order_tags')
    .insert(stickerIds.map((id) => ({ order_id: orderId, sticker_id: id })));
  if (linkErr) return { ok: false, error: linkErr.message };

  const newCount = order.tags_encoded_count + stickerIds.length;
  const newStatus: 'ready_to_ship' | 'encoding' =
    newCount >= order.quantity ? 'ready_to_ship' : 'encoding';

  const { error: orderErr } = await auth.supabase
    .from('smarttag_orders')
    .update({
      tags_encoded_count: newCount,
      status: newStatus,
      fulfilled_at: newStatus === 'ready_to_ship' ? new Date().toISOString() : null,
    })
    .eq('id', orderId);
  if (orderErr) return { ok: false, error: orderErr.message };

  revalidatePath('/dashboard/admin/orders');
  revalidatePath(`/dashboard/admin/orders/${orderId}`);
  revalidatePath('/dashboard/admin/smarttags');

  await logAdminAction('orders.fulfill', { orderId, establishmentId, stickerCount: stickerIds.length });
  return {
    ok: true,
    data: { encoded_count: newCount, total_quantity: order.quantity, status: newStatus },
  };
}

export async function markOrderShipped(
  orderId: string,
  trackingNumber?: string
): Promise<Result<null>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: order } = await auth.supabase
    .from('smarttag_orders')
    .select('id, group_id, pack, quantity')
    .eq('id', orderId)
    .single();

  const { error } = await auth.supabase
    .from('smarttag_orders')
    .update({
      status: 'shipped',
      shipped_at: new Date().toISOString(),
      tracking_number: trackingNumber ?? null,
    })
    .eq('id', orderId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/admin/orders');
  revalidatePath(`/dashboard/admin/orders/${orderId}`);
  revalidatePath('/dashboard/billing');
  await logAdminAction('orders.mark_shipped', { orderId });

  if (order) {
    (async () => {
      try {
        const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? '';
        let to: string | null = null;
        let locale = 'fr';
        let onboardingUrl: string | null = null;

        const adminContact = await getGroupAdminEmail(order.group_id);
        if (adminContact) {
          to = adminContact.email;
          locale = adminContact.locale;
          onboardingUrl = `${base}/dashboard`;
        } else {
          // Express checkout group — retrieve customer email from Stripe
          const service = createServiceClient();
          const { data: grp } = await service
            .from('groups')
            .select('stripe_customer_id')
            .eq('id', order.group_id)
            .single();

          if (grp?.stripe_customer_id) {
            const customer = await stripe.customers.retrieve(grp.stripe_customer_id);
            if (!customer.deleted && customer.email) {
              to = customer.email;
              onboardingUrl = `${base}/fr/onboarding?group=${order.group_id}`;
            }
          }
        }

        if (to) {
          await sendOrderShipped({
            to,
            pack: order.pack,
            quantity: order.quantity,
            orderId: order.id,
            trackingNumber: trackingNumber ?? null,
            locale,
            onboardingUrl,
          });
        }
      } catch { /* never break the action */ }
    })();
  }

  return { ok: true, data: null };
}

const ORDER_STATUSES = [
  'pending_payment',
  'pending_fulfillment',
  'encoding',
  'ready_to_ship',
  'shipped',
  'delivered',
  'canceled',
] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

export async function forceOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  trackingNumber?: string
): Promise<Result<null>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const service = createServiceClient();
  const patch: {
    status: OrderStatus;
    shipped_at?: string;
    delivered_at?: string;
    tracking_number?: string;
  } = { status: newStatus };

  if (newStatus === 'shipped') {
    patch.shipped_at = new Date().toISOString();
    if (trackingNumber) patch.tracking_number = trackingNumber;
  }
  if (newStatus === 'delivered') {
    patch.delivered_at = new Date().toISOString();
  }

  const { error } = await service
    .from('smarttag_orders')
    .update(patch)
    .eq('id', orderId);

  if (error) return { ok: false, error: error.message };

  await logAdminAction('orders.force_status', { orderId, newStatus });
  revalidatePath('/dashboard/admin/orders');
  revalidatePath(`/dashboard/admin/orders/${orderId}`);
  return { ok: true, data: null };
}

export async function markOrderDelivered(orderId: string): Promise<Result<null>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: order } = await auth.supabase
    .from('smarttag_orders')
    .select('id, group_id, pack, quantity')
    .eq('id', orderId)
    .single();

  const { error } = await auth.supabase
    .from('smarttag_orders')
    .update({ status: 'delivered', delivered_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/admin/orders');
  revalidatePath(`/dashboard/admin/orders/${orderId}`);
  revalidatePath('/dashboard/billing');
  await logAdminAction('orders.mark_delivered', { orderId });

  if (order) {
    getGroupAdminEmail(order.group_id).then((contact) => {
      if (!contact) return;
      sendOrderDelivered({
        to: contact.email,
        pack: order.pack,
        quantity: order.quantity,
        orderId: order.id,
        locale: contact.locale,
      }).catch(() => {});
    }).catch(() => {});
  }

  return { ok: true, data: null };
}

// ─── Cancel an order ──────────────────────────────────────────────────────────
// Releases any reserved/encoded tags back to the pool (clears their
// establishment_id and deletes the smarttag_order_tags reservation rows),
// then transitions the order to `canceled`. Optionally emails the customer.
// Refunds are intentionally out of scope here — admins issue them via Stripe.
export async function cancelOrder(
  orderId: string,
  reason: string | null,
  options?: { sendEmail?: boolean }
): Promise<Result<null>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: order } = await auth.supabase
    .from('smarttag_orders')
    .select('id, group_id, pack, quantity, status')
    .eq('id', orderId)
    .single();
  if (!order) return { ok: false, error: 'Order not found' };

  // Cancel only makes sense up to "ready_to_ship". After that the goods are
  // physically out — admins should refund + handle returns instead.
  const cancellable = new Set(['pending_payment', 'pending_fulfillment', 'encoding', 'ready_to_ship']);
  if (!cancellable.has(order.status)) {
    return { ok: false, error: `Cannot cancel an order in status "${order.status}"` };
  }

  const service = createServiceClient();

  // 1. release reserved tags (clears smarttag_order_tags rows + frees the
  //    tag back into the unassigned pool by nulling establishment_id).
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

  // 2. transition the order to canceled (zeroing encoded_count for clarity).
  const { error: orderErr } = await service
    .from('smarttag_orders')
    .update({ status: 'canceled', tags_encoded_count: 0, fulfilled_at: null })
    .eq('id', orderId);
  if (orderErr) return { ok: false, error: orderErr.message };

  await logAdminAction('orders.cancel', {
    orderId,
    reason,
    releasedTags: stickerIds.length,
  });

  // 3. optional customer email.
  if (options?.sendEmail !== false) {
    const recipient = await resolveOrderRecipient(orderId);
    if (recipient) {
      sendOrderCanceled({
        to: recipient.email,
        pack: order.pack,
        quantity: order.quantity,
        orderId: order.id,
        reason,
        locale: recipient.locale,
      }).catch(() => {});
    }
  }

  revalidatePath('/dashboard/admin/orders');
  revalidatePath(`/dashboard/admin/orders/${orderId}`);
  revalidatePath('/dashboard/admin/smarttags');
  return { ok: true, data: null };
}

// ─── Resend a templated email ─────────────────────────────────────────────────
type ResendKind = 'confirmation' | 'shipped' | 'delivered' | 'canceled';

export async function resendOrderEmail(
  orderId: string,
  kind: ResendKind
): Promise<Result<{ to: string }>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: order } = await auth.supabase
    .from('smarttag_orders')
    .select('id, pack, quantity, tracking_number, stripe_invoice_id')
    .eq('id', orderId)
    .single();
  if (!order) return { ok: false, error: 'Order not found' };

  const recipient = await resolveOrderRecipient(orderId);
  if (!recipient) {
    return { ok: false, error: 'No customer email found for this order' };
  }

  try {
    if (kind === 'confirmation') {
      let invoicePdfUrl: string | null = null;
      if (order.stripe_invoice_id) {
        try {
          const inv = await stripe.invoices.retrieve(order.stripe_invoice_id);
          invoicePdfUrl = inv.invoice_pdf ?? null;
        } catch { /* non-blocking */ }
      }
      await sendOrderConfirmation({
        to: recipient.email,
        pack: order.pack,
        quantity: order.quantity,
        orderId: order.id,
        invoicePdfUrl,
        setupUrl: recipient.onboardingUrl,
        locale: recipient.locale,
      });
    } else if (kind === 'shipped') {
      await sendOrderShipped({
        to: recipient.email,
        pack: order.pack,
        quantity: order.quantity,
        orderId: order.id,
        trackingNumber: order.tracking_number,
        locale: recipient.locale,
        onboardingUrl: recipient.onboardingUrl,
      });
    } else if (kind === 'delivered') {
      await sendOrderDelivered({
        to: recipient.email,
        pack: order.pack,
        quantity: order.quantity,
        orderId: order.id,
        locale: recipient.locale,
      });
    } else if (kind === 'canceled') {
      await sendOrderCanceled({
        to: recipient.email,
        pack: order.pack,
        quantity: order.quantity,
        orderId: order.id,
        reason: null,
        locale: recipient.locale,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Email failed';
    return { ok: false, error: msg };
  }

  await logAdminAction('orders.resend_email', { orderId, kind });
  return { ok: true, data: { to: recipient.email } };
}

// ─── Send a custom free-text email to the customer ───────────────────────────
export async function sendCustomOrderEmail(
  orderId: string,
  subject: string,
  body: string
): Promise<Result<{ to: string }>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const cleanSubject = subject.trim();
  const cleanBody = body.trim();
  if (cleanSubject.length < 3 || cleanSubject.length > 200) {
    return { ok: false, error: 'Subject must be 3–200 characters' };
  }
  if (cleanBody.length < 5 || cleanBody.length > 10000) {
    return { ok: false, error: 'Body must be 5–10000 characters' };
  }

  const recipient = await resolveOrderRecipient(orderId);
  if (!recipient) return { ok: false, error: 'No customer email found for this order' };

  try {
    await sendOrderCustomNote({
      to: recipient.email,
      orderId,
      subject: cleanSubject,
      bodyText: cleanBody,
      locale: recipient.locale,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Email failed';
    return { ok: false, error: msg };
  }

  await logAdminAction('orders.custom_email', { orderId, subjectLength: cleanSubject.length, bodyLength: cleanBody.length });
  return { ok: true, data: { to: recipient.email } };
}

// ─── Update internal admin notes ─────────────────────────────────────────────
export async function updateOrderInternalNotes(
  orderId: string,
  notes: string
): Promise<Result<null>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const trimmed = notes.length > 10_000 ? notes.slice(0, 10_000) : notes;

  const service = createServiceClient();
  const { error } = await service
    .from('smarttag_orders')
    .update({ internal_notes: trimmed.length === 0 ? null : trimmed })
    .eq('id', orderId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dashboard/admin/orders/${orderId}`);
  await logAdminAction('orders.update_notes', { orderId, length: trimmed.length });
  return { ok: true, data: null };
}
