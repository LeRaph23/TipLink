'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/admin/audit';

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
  await logAdminAction('orders.mark_shipped', { orderId });
  return { ok: true, data: null };
}

export async function markOrderDelivered(orderId: string): Promise<Result<null>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await auth.supabase
    .from('smarttag_orders')
    .update({ status: 'delivered', delivered_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/admin/orders');
  revalidatePath(`/dashboard/admin/orders/${orderId}`);
  await logAdminAction('orders.mark_delivered', { orderId });
  return { ok: true, data: null };
}
