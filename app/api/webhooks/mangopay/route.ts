import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getClientIp } from '@/lib/rate-limit';
import { isAllowedWebhookIp } from '@/lib/mangopay/hooks';
import { getPayIn } from '@/lib/mangopay/payins';
import { getPayOut } from '@/lib/mangopay/payouts';
import { getRefund } from '@/lib/mangopay/refunds';
import { getDispute } from '@/lib/mangopay/disputes';
import { getKycDocument, kycStatusFromDocument } from '@/lib/mangopay/kyc';
import { generatePackInvoice, makeInvoiceNumber } from '@/lib/mangopay/invoice-pdf';
import {
  sendTipReceipt,
  sendPaymentFailed,
  sendTipRefunded,
  sendOrderConfirmation,
  sendAdminNewOrder,
  sendReferralValidatedToParrain,
} from '@/lib/email';
import { onTipSucceeded, onPayoutFailed } from '@/lib/email/lifecycle-events';
import { voidAmbassadorSaleForOrder } from '@/lib/ambassadeur/sales';
import { COMMISSION_BY_PACK } from '@/lib/ambassador-tiers';
import { signOnboardingToken } from '@/lib/auth/onboarding-token';
import { getBaseUrl } from '@/lib/env';
import type { Json } from '@/types/database';

// Mangopay Hooks are unsigned HTTP GET notifications carrying only
// EventType + RessourceId + Date. The handler authenticates by source IP,
// refetches the resource (the notification has no payload), and dispatches.
export const runtime = 'nodejs';

type Supabase = ReturnType<typeof createServiceClient>;

type Address = {
  name?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  postal_code: string;
  country: string;
};

// Shape of payin_contexts.context written by the two pack PayIn routes.
type PackContext = {
  pack: 'solo' | 'duo';
  quantity: number;
  locale: string;
  base_amount: number;
  discount_amount: number;
  ht_amount: number;
  tax_amount: number;
  total_amount: number;
  tax_country: string;
  tax_rate_percent: number | null;
  promo_code: string | null;
  promo_code_id: string | null;
  customer_email: string | null;
  vat_number?: string | null;
  shipping: Address | null;
  group_id?: string;
  user_id?: string;
  legal_name?: string;
};

type StaffJoin = { full_name: string; establishments: { name: string } | null } | null;

export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers);
  if (!isAllowedWebhookIp(ip)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const eventType = params.get('EventType');
  const resourceId = params.get('RessourceId');
  if (!eventType || !resourceId) {
    return NextResponse.json({ error: 'Missing EventType or RessourceId' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Idempotency gate — (mangopay_resource_id, mangopay_event_type) is unique.
  const { error: insertErr } = await supabase.from('webhook_events').insert({
    event_type: eventType,
    mangopay_event_type: eventType,
    mangopay_resource_id: resourceId,
    payload: null,
  });

  if (insertErr) {
    if (insertErr.code !== '23505') {
      return NextResponse.json({ error: 'Failed to record event' }, { status: 500 });
    }
    // Already seen. If a prior attempt completed, ack and stop; otherwise it
    // crashed mid-way — fall through and re-process (handlers are idempotent).
    const { data: existing } = await supabase
      .from('webhook_events')
      .select('processed_at')
      .eq('mangopay_resource_id', resourceId)
      .eq('mangopay_event_type', eventType)
      .maybeSingle();
    if (existing?.processed_at) {
      return NextResponse.json({ received: true });
    }
  }

  try {
    await handleEvent(eventType, resourceId, supabase);
    await supabase
      .from('webhook_events')
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq('mangopay_resource_id', resourceId)
      .eq('mangopay_event_type', eventType);
    return NextResponse.json({ received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[mangopay webhook] handler failed:', eventType, resourceId, err);
    await supabase
      .from('webhook_events')
      .update({ error: msg })
      .eq('mangopay_resource_id', resourceId)
      .eq('mangopay_event_type', eventType);
    // Non-200 makes Mangopay retry (10 min ×6, then 8 h ×9).
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }
}

async function handleEvent(eventType: string, resourceId: string, supabase: Supabase): Promise<void> {
  switch (eventType) {
    case 'PAYIN_NORMAL_SUCCEEDED':
      return handlePayInSucceeded(resourceId, supabase);
    case 'PAYIN_NORMAL_FAILED':
      return handlePayInFailed(resourceId, supabase);
    case 'PAYIN_REFUND_SUCCEEDED':
      return handlePayInRefund(resourceId, supabase);
    case 'TRANSFER_NORMAL_FAILED':
      return handleTransferFailed(resourceId, supabase);
    case 'TRANSFER_REFUND_SUCCEEDED':
      return handleTransferRefund(resourceId, supabase);
    case 'PAYOUT_NORMAL_SUCCEEDED':
    case 'PAYOUT_NORMAL_FAILED':
      return handlePayOut(resourceId, supabase);
    case 'KYC_SUCCEEDED':
    case 'KYC_FAILED':
      return handleKyc(resourceId, supabase);
    case 'DISPUTE_CREATED':
      return handleDisputeCreated(resourceId, supabase);
    case 'DISPUTE_CLOSED':
      return handleDisputeClosed(resourceId, supabase);
    // TRANSFER_NORMAL_SUCCEEDED: the payout route proceeds synchronously.
    // DISPUTE_ACTION_REQUIRED / PAYIN_REPUDIATION_CREATED: informational —
    // the Hook's mandatory alert email notifies an admin.
    default:
      return;
  }
}

// ─── PayIn success ────────────────────────────────────────────────────────────

async function handlePayInSucceeded(payInId: string, supabase: Supabase): Promise<void> {
  const payIn = await getPayIn(payInId);
  if (payIn.Status !== 'SUCCEEDED') return;

  const { data: txn } = await supabase
    .from('transactions')
    .select('id, status, establishment_id, metadata')
    .eq('mangopay_payin_id', payInId)
    .maybeSingle();

  if (txn) {
    await handleTipPaid(txn, supabase);
    return;
  }

  const { data: ctx } = await supabase
    .from('payin_contexts')
    .select('id, source, status, context')
    .eq('mangopay_payin_id', payInId)
    .maybeSingle();

  if (!ctx) {
    console.warn('[mangopay webhook] PayIn not tracked:', payInId);
    return;
  }
  if (ctx.status === 'succeeded') return;

  const context = ctx.context as unknown as PackContext;
  if (ctx.source === 'pack-express') {
    await handlePackExpressPaid(payInId, context, supabase);
  } else if (ctx.source === 'pack-order') {
    await handlePackOrderPaid(payInId, context, supabase);
  }

  await supabase
    .from('payin_contexts')
    .update({ status: 'succeeded', processed_at: new Date().toISOString() })
    .eq('id', ctx.id);
}

type TxnRow = {
  id: string;
  status: string;
  establishment_id: string;
  metadata: Json;
};

async function handleTipPaid(txn: TxnRow, supabase: Supabase): Promise<void> {
  const meta = (txn.metadata ?? {}) as Record<string, unknown>;

  // Group tip: split the staff-distributable amount into ledger rows. No
  // Mangopay Transfer — the whole tip stays in the central wallet and each
  // staff member's share is a `group_tip_transfers` accounting line.
  if (meta.source === 'group_tip') {
    const { data: existingRows } = await supabase
      .from('group_tip_transfers')
      .select('id')
      .eq('transaction_id', txn.id)
      .limit(1);

    if (!existingRows || existingRows.length === 0) {
      const tipAmount = Number(meta.tip_amount);
      const platformFee = Number(meta.platform_fee);
      const netForStaff =
        Number.isFinite(tipAmount) && Number.isFinite(platformFee)
          ? Math.max(0, tipAmount - platformFee)
          : 0;

      if (netForStaff > 0) {
        const { data: staff } = await supabase
          .from('staff_profiles')
          .select('id')
          .eq('establishment_id', txn.establishment_id)
          .eq('is_active', true)
          .is('deleted_at', null)
          .order('id'); // deterministic remainder recipient

        if (staff && staff.length > 0) {
          const n = staff.length;
          const baseShare = Math.floor(netForStaff / n);
          const remainder = netForStaff - baseShare * n;
          const rows = staff.map((s, i) => ({
            transaction_id: txn.id,
            staff_id: s.id,
            amount: baseShare + (i === 0 ? remainder : 0),
            status: 'succeeded',
          }));
          await supabase.from('group_tip_transfers').insert(rows);
        }
      }
    }
  }

  // Only fire side effects on the real pending -> succeeded transition.
  const { data: updated } = await supabase
    .from('transactions')
    .update({ status: 'succeeded', succeeded_at: new Date().toISOString() })
    .eq('id', txn.id)
    .eq('status', 'pending')
    .select('id');
  const firstTransition = !!updated && updated.length > 0;
  if (!firstTransition) return;

  const email = typeof meta.customer_email === 'string' ? meta.customer_email : null;
  if (email) {
    const { data: full } = await supabase
      .from('transactions')
      .select('amount, currency, staff_profiles(full_name, establishments(name))')
      .eq('id', txn.id)
      .single();
    if (full) {
      const staff = full.staff_profiles as StaffJoin;
      await sendTipReceipt({
        to: email,
        amount: full.amount,
        currency: full.currency,
        staffName: staff?.full_name ?? 'votre serveur',
        establishmentName: staff?.establishments?.name ?? '',
        transactionId: txn.id,
      }).catch((e) => console.error('[email] sendTipReceipt failed', e));
    }
  }

  await onTipSucceeded(supabase, txn.id).catch((e) =>
    console.error('[lifecycle] onTipSucceeded failed', e)
  );
}

// ─── PayIn failure ────────────────────────────────────────────────────────────

async function handlePayInFailed(payInId: string, supabase: Supabase): Promise<void> {
  const payIn = await getPayIn(payInId);
  if (payIn.Status !== 'FAILED') return;

  const { data: txn } = await supabase
    .from('transactions')
    .select('id, amount, currency, metadata, staff_profiles(full_name, establishments(name))')
    .eq('mangopay_payin_id', payInId)
    .maybeSingle();

  if (txn) {
    await supabase
      .from('transactions')
      .update({ status: 'failed' })
      .eq('id', txn.id)
      .eq('status', 'pending');

    const meta = (txn.metadata ?? {}) as Record<string, unknown>;
    const email = typeof meta.customer_email === 'string' ? meta.customer_email : null;
    if (email) {
      const staff = txn.staff_profiles as StaffJoin;
      await sendPaymentFailed({
        to: email,
        amount: txn.amount,
        currency: txn.currency,
        staffName: staff?.full_name ?? 'le staff',
        establishmentName: staff?.establishments?.name ?? '',
      }).catch(() => {});
    }
    return;
  }

  const { data: ctx } = await supabase
    .from('payin_contexts')
    .select('id, status')
    .eq('mangopay_payin_id', payInId)
    .maybeSingle();
  if (ctx && ctx.status === 'pending') {
    await supabase
      .from('payin_contexts')
      .update({ status: 'failed', processed_at: new Date().toISOString() })
      .eq('id', ctx.id);
  }
}

// ─── PayIn refund ─────────────────────────────────────────────────────────────

async function handlePayInRefund(refundId: string, supabase: Supabase): Promise<void> {
  const refund = await getRefund(refundId);
  const payInId = refund.InitialTransactionId;
  const refundedAmount = refund.DebitedFunds?.Amount ?? 0;

  const { data: txn } = await supabase
    .from('transactions')
    .select('id, amount, currency, refunded_amount, metadata, staff_profiles(full_name, establishments(name))')
    .eq('mangopay_payin_id', payInId)
    .maybeSingle();

  if (txn) {
    const totalRefunded = Math.min(txn.amount, (txn.refunded_amount ?? 0) + refundedAmount);
    await supabase
      .from('transactions')
      .update({
        status: totalRefunded >= txn.amount ? 'refunded' : 'partially_refunded',
        refunded_amount: totalRefunded,
      })
      .eq('id', txn.id);

    // Drop the group-tip ledger lines so the staff balance no longer counts them.
    await supabase
      .from('group_tip_transfers')
      .update({ reversed_at: new Date().toISOString() })
      .eq('transaction_id', txn.id)
      .is('reversed_at', null);

    const meta = (txn.metadata ?? {}) as Record<string, unknown>;
    const email = typeof meta.customer_email === 'string' ? meta.customer_email : null;
    if (email) {
      const staff = txn.staff_profiles as StaffJoin;
      await sendTipRefunded({
        to: email,
        amount: refundedAmount,
        currency: txn.currency,
        staffName: staff?.full_name,
        establishmentName: staff?.establishments?.name ?? undefined,
      }).catch(() => {});
    }
    return;
  }

  // A refunded pack purchase: void the ambassador commission earned on it.
  const { data: order } = await supabase
    .from('smarttag_orders')
    .select('id')
    .eq('mangopay_payin_id', payInId)
    .maybeSingle();
  if (order) {
    await voidAmbassadorSaleForOrder(supabase, order.id, 'pack_refunded').catch(() => {});
  }
}

// ─── Transfers & payouts ──────────────────────────────────────────────────────

async function handleTransferFailed(transferId: string, supabase: Supabase): Promise<void> {
  // The central -> staff-wallet leg of a withdrawal failed. Mark the payout
  // row failed so a retry re-runs the transfer rather than skipping it.
  const now = new Date().toISOString();
  await supabase
    .from('staff_payouts')
    .update({ status: 'failed', failed_at: now, failure_message: 'Transfer failed' })
    .eq('mangopay_transfer_id', transferId);
  await supabase
    .from('ambassador_payouts')
    .update({ status: 'failed', failure_reason: 'Transfer failed' })
    .eq('mangopay_transfer_id', transferId);
}

async function handleTransferRefund(refundId: string, supabase: Supabase): Promise<void> {
  // A transfer was clawed back into the central wallet (refund/lost dispute).
  const refund = await getRefund(refundId);
  await supabase
    .from('group_tip_transfers')
    .update({ reversed_at: new Date().toISOString() })
    .eq('mangopay_transfer_id', refund.InitialTransactionId)
    .is('reversed_at', null);
}

async function handlePayOut(payOutId: string, supabase: Supabase): Promise<void> {
  const payOut = await getPayOut(payOutId);
  const now = new Date().toISOString();

  if (payOut.Status === 'SUCCEEDED') {
    await supabase
      .from('staff_payouts')
      .update({ status: 'paid', paid_at: now })
      .eq('mangopay_payout_id', payOutId);
    await supabase
      .from('ambassador_payouts')
      .update({ status: 'paid', paid_at: now })
      .eq('mangopay_payout_id', payOutId);
    return;
  }
  if (payOut.Status !== 'FAILED') return;

  const failMsg = payOut.ResultMessage || 'Payout failed';
  const { data: rows } = await supabase
    .from('staff_payouts')
    .update({
      status: 'failed',
      failed_at: now,
      failure_code: payOut.ResultCode || null,
      failure_message: failMsg,
    })
    .eq('mangopay_payout_id', payOutId)
    .select('staff_id');
  await supabase
    .from('ambassador_payouts')
    .update({ status: 'failed', failure_reason: failMsg })
    .eq('mangopay_payout_id', payOutId);

  const staffId = rows?.[0]?.staff_id;
  if (staffId) {
    await supabase
      .from('staff_profiles')
      .update({ last_payout_failure_code: payOut.ResultCode || null, last_payout_failure_at: now })
      .eq('id', staffId);
    await onPayoutFailed(supabase, staffId).catch((e) =>
      console.error('[lifecycle] onPayoutFailed failed', e)
    );
  }
}

// ─── KYC ──────────────────────────────────────────────────────────────────────

async function handleKyc(documentId: string, supabase: Supabase): Promise<void> {
  const doc = await getKycDocument(documentId);
  const status = kycStatusFromDocument(doc.Status);
  if (!doc.UserId) return;

  const { data: staff } = await supabase
    .from('staff_profiles')
    .select('id')
    .eq('mangopay_user_id', doc.UserId)
    .maybeSingle();
  if (staff) {
    await supabase
      .from('staff_profiles')
      .update({ mangopay_kyc_status: status })
      .eq('id', staff.id);
    return;
  }

  const { data: amb } = await supabase
    .from('ambassadors')
    .select('id')
    .eq('mangopay_user_id', doc.UserId)
    .maybeSingle();
  if (amb) {
    await supabase
      .from('ambassadors')
      .update({ mangopay_kyc_status: status })
      .eq('id', amb.id);
  }
}

// ─── Disputes ─────────────────────────────────────────────────────────────────

async function handleDisputeCreated(disputeId: string, supabase: Supabase): Promise<void> {
  const dispute = await getDispute(disputeId);
  const payInId = dispute.InitialTransactionId;

  const { data: txn } = await supabase
    .from('transactions')
    .select('id, staff_id')
    .eq('mangopay_payin_id', payInId)
    .maybeSingle();

  if (txn) {
    await supabase
      .from('transactions')
      .update({ status: 'disputed', mangopay_dispute_id: disputeId })
      .eq('id', txn.id);
    if (txn.staff_id) {
      await supabase
        .from('staff_profiles')
        .update({ payouts_frozen: true })
        .eq('id', txn.staff_id);
    }
    return;
  }

  // A dispute against a pack purchase: freeze the selling ambassador and void
  // the commission. The freeze is intentionally not auto-cleared — a
  // super-admin reviews it.
  const { data: order } = await supabase
    .from('smarttag_orders')
    .select('id')
    .eq('mangopay_payin_id', payInId)
    .maybeSingle();
  if (order) {
    const { data: sale } = await supabase
      .from('ambassador_sales')
      .select('ambassador_id')
      .eq('smarttag_order_id', order.id)
      .maybeSingle();
    if (sale?.ambassador_id) {
      await supabase
        .from('ambassadors')
        .update({ payouts_frozen: true })
        .eq('id', sale.ambassador_id);
    }
    await voidAmbassadorSaleForOrder(supabase, order.id, 'pack_dispute_opened').catch(() => {});
  }
}

async function handleDisputeClosed(disputeId: string, supabase: Supabase): Promise<void> {
  const dispute = await getDispute(disputeId);
  // We do not run a dispute-contestation flow, so a closed dispute with no
  // contested funds means the chargeback stands and the money is permanently
  // gone from the central wallet. A contested dispute's outcome needs manual
  // review (a super-admin clears the freeze / un-reverses if Mangopay rules in
  // our favour) — see docs/migration-mangopay.md "à confirmer".
  const contested = dispute.ContestedFunds?.Amount ?? 0;
  if (contested > 0) return;

  const { data: txn } = await supabase
    .from('transactions')
    .select('id')
    .eq('mangopay_dispute_id', disputeId)
    .maybeSingle();
  if (!txn) return;

  await supabase.from('transactions').update({ status: 'reversed' }).eq('id', txn.id);
  await supabase
    .from('group_tip_transfers')
    .update({ reversed_at: new Date().toISOString() })
    .eq('transaction_id', txn.id)
    .is('reversed_at', null);
}

// ─── Pack purchases ───────────────────────────────────────────────────────────

function packDescription(pack: 'solo' | 'duo', quantity: number): string {
  return `Digitip — Pack ${pack === 'solo' ? 'Solo' : 'Duo'} (${quantity} SmartTag${quantity > 1 ? 's' : ''})`;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function buildInvoice(
  c: PackContext,
  buyerName: string
): Promise<string | null> {
  const ship = c.shipping;
  const { invoicePdfUrl } = await generatePackInvoice({
    invoiceNumber: makeInvoiceNumber(),
    date: new Date(),
    buyerName,
    buyerVatNumber: c.vat_number ?? null,
    buyerAddress: ship
      ? {
          line1: ship.line1,
          line2: ship.line2,
          city: ship.city,
          postalCode: ship.postal_code,
          country: ship.country,
        }
      : null,
    description: packDescription(c.pack, c.quantity),
    quantity: c.quantity,
    htAmount: c.ht_amount,
    taxAmount: c.tax_amount,
    totalAmount: c.total_amount,
    taxRatePercent: c.tax_rate_percent,
  });
  return invoicePdfUrl;
}

async function handlePackExpressPaid(
  payInId: string,
  c: PackContext,
  supabase: Supabase
): Promise<void> {
  // Idempotency: an order already linked to this PayIn means we are done.
  const { data: existing } = await supabase
    .from('smarttag_orders')
    .select('id')
    .eq('mangopay_payin_id', payInId)
    .maybeSingle();
  if (existing) return;

  const shipping = c.shipping;
  const email = c.customer_email;
  const legalName = shipping?.name?.trim() || email || 'Client';

  const { data: group, error: groupErr } = await supabase
    .from('groups')
    .insert({
      name: legalName,
      legal_name: legalName,
      shipping_address: (shipping ?? null) as unknown as Json,
      settings: { tip_thresholds: [1, 2, 5, 10] },
    })
    .select('id')
    .single();
  if (groupErr || !group) {
    throw new Error(`pack-express: failed to create group — ${groupErr?.message ?? 'unknown'}`);
  }

  const invoicePdfUrl = await buildInvoice(c, legalName);

  const { data: order, error: orderErr } = await supabase
    .from('smarttag_orders')
    .insert({
      group_id: group.id,
      pack: c.pack,
      quantity: c.quantity,
      mangopay_payin_id: payInId,
      invoice_pdf_url: invoicePdfUrl,
      status: 'pending_fulfillment',
      shipping_address: (shipping ?? null) as unknown as Json,
      promo_code: c.promo_code,
      promo_code_id: c.promo_code_id,
      discount_amount: c.discount_amount,
    })
    .select('id')
    .single();
  if (orderErr || !order) {
    throw new Error(`pack-express: failed to create order — ${orderErr?.message ?? 'unknown'}`);
  }

  await autoAssignTagsToOrder(supabase, order.id, c.quantity);
  await incrementPromoRedeemed(supabase, c.promo_code_id);
  if (c.promo_code) {
    await attributeAmbassadorSale(supabase, c.promo_code, order.id, c.pack, legalName);
  }
  await provisionStarterEstablishment(supabase, group.id, legalName, shipping?.country);

  if (email) {
    const onboardingToken = signOnboardingToken(group.id, email);
    const setupUrl = `${getBaseUrl()}/${c.locale}/onboarding?group=${group.id}&token=${onboardingToken}&email=${encodeURIComponent(email)}`;
    await sendOrderConfirmation({
      to: email,
      pack: c.pack,
      quantity: c.quantity,
      orderId: order.id,
      invoicePdfUrl,
      setupUrl,
      locale: c.locale,
    }).catch((e) => console.error('[email] sendOrderConfirmation failed', e));
    await sendAdminNewOrder({
      customerName: legalName,
      customerEmail: email,
      pack: c.pack,
      quantity: c.quantity,
      orderId: order.id,
      promoCode: c.promo_code,
      locale: c.locale,
    }).catch(() => {});
  }
}

async function handlePackOrderPaid(
  payInId: string,
  c: PackContext,
  supabase: Supabase
): Promise<void> {
  if (!c.group_id) {
    throw new Error(`pack-order: missing group_id for PayIn ${payInId}`);
  }

  const { data: existing } = await supabase
    .from('smarttag_orders')
    .select('id')
    .eq('mangopay_payin_id', payInId)
    .maybeSingle();
  if (existing) return;

  const buyerName = c.legal_name || c.shipping?.name?.trim() || c.customer_email || 'Client';
  const invoicePdfUrl = await buildInvoice(c, buyerName);

  const { data: order, error: orderErr } = await supabase
    .from('smarttag_orders')
    .insert({
      group_id: c.group_id,
      pack: c.pack,
      quantity: c.quantity,
      mangopay_payin_id: payInId,
      invoice_pdf_url: invoicePdfUrl,
      status: 'pending_fulfillment',
      shipping_address: (c.shipping ?? null) as unknown as Json,
      promo_code: c.promo_code,
      promo_code_id: c.promo_code_id,
      discount_amount: c.discount_amount,
    })
    .select('id')
    .single();
  if (orderErr || !order) {
    throw new Error(`pack-order: failed to create order — ${orderErr?.message ?? 'unknown'}`);
  }

  await autoAssignTagsToOrder(supabase, order.id, c.quantity);
  await incrementPromoRedeemed(supabase, c.promo_code_id);
  if (c.promo_code) {
    await attributeAmbassadorSale(supabase, c.promo_code, order.id, c.pack, buyerName);
  }
  await provisionStarterEstablishment(supabase, c.group_id, buyerName, c.shipping?.country);

  if (c.customer_email) {
    await sendOrderConfirmation({
      to: c.customer_email,
      pack: c.pack,
      quantity: c.quantity,
      orderId: order.id,
      invoicePdfUrl,
      locale: c.locale,
    }).catch((e) => console.error('[email] sendOrderConfirmation failed', e));
    await sendAdminNewOrder({
      customerName: buyerName,
      customerEmail: c.customer_email,
      pack: c.pack,
      quantity: c.quantity,
      orderId: order.id,
      promoCode: c.promo_code,
      locale: c.locale,
    }).catch(() => {});
  }
}

// Provisions a starter establishment so the tip flow works as soon as the
// SmartTags arrive. Best-effort and a no-op when one already exists.
async function provisionStarterEstablishment(
  supabase: Supabase,
  groupId: string,
  name: string,
  country: string | undefined
): Promise<void> {
  const { data: existing } = await supabase
    .from('establishments')
    .select('id')
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (existing) return;

  await supabase.from('establishments').insert({
    group_id: groupId,
    name,
    business_type: 'beauty',
    slug: slugify(name) || `group-${groupId.slice(0, 8)}`,
    country: (country ?? 'FR').toUpperCase(),
    currency: 'eur',
    onboarding_status: 'not_started',
  });
}

async function incrementPromoRedeemed(
  supabase: Supabase,
  promoCodeId: string | null
): Promise<void> {
  if (!promoCodeId) return;
  try {
    await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)(
      'increment_promo_redeemed',
      { promo_id: promoCodeId }
    );
  } catch {
    /* best-effort */
  }
}

// Picks `needed` free tags from the pool and links them to the order.
async function autoAssignTagsToOrder(
  supabase: Supabase,
  orderId: string,
  needed: number
): Promise<void> {
  try {
    const { data: claimed } = await supabase.from('smarttag_order_tags').select('sticker_id');
    const claimedIds = (claimed ?? []).map((r) => r.sticker_id);

    const base = supabase.from('nfc_stickers').select('id').is('establishment_id', null).limit(needed);
    const { data: freeTags } = await (claimedIds.length > 0
      ? base.not('id', 'in', `(${claimedIds.join(',')})`)
      : base);
    if (!freeTags?.length) return;

    await supabase
      .from('smarttag_order_tags')
      .insert(freeTags.map((t) => ({ order_id: orderId, sticker_id: t.id })));
  } catch {
    /* best-effort — never break the webhook */
  }
}

async function attributeAmbassadorSale(
  supabase: Supabase,
  promoCodeStr: string,
  orderId: string,
  pack: 'solo' | 'duo',
  rawSalonName: string
): Promise<void> {
  try {
    const { data: pc } = await supabase
      .from('promo_codes')
      .select('id')
      .eq('code', promoCodeStr.toUpperCase())
      .maybeSingle();
    if (!pc) return;

    const { data: ambassador } = await supabase
      .from('ambassadors')
      .select('id, name')
      .eq('promo_code_id', pc.id)
      .eq('is_active', true)
      .maybeSingle();
    if (!ambassador) return;

    const trimmed = rawSalonName.trim();
    const salonPartial = trimmed.length >= 3 ? `***${trimmed.slice(-3)}` : '***';

    // The unique constraint on smarttag_order_id makes this a no-op on a
    // re-delivered webhook; on any insert error, stop before side effects.
    const { error: saleErr } = await supabase.from('ambassador_sales').insert({
      ambassador_id: ambassador.id,
      smarttag_order_id: orderId,
      pack,
      commission_amount: COMMISSION_BY_PACK[pack],
      salon_name_partial: salonPartial,
    });
    if (saleErr) return;

    void notifyTelegram(ambassador.name, salonPartial, pack).catch(() => {});

    const { checkAndValidateReferral } = await import('@/lib/referrals');
    void checkAndValidateReferral(supabase, ambassador.id)
      .then(async (event) => {
        if (!event) return;
        await sendReferralValidatedToParrain(
          supabase,
          event.referrerId,
          ambassador.name,
          event.amountCents
        ).catch(() => {});
      })
      .catch(() => {});
  } catch {
    /* best-effort — ambassador attribution never breaks the webhook */
  }
}

async function notifyTelegram(
  ambassadorName: string,
  salon: string,
  pack: string
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const packLabel = pack === 'duo' ? 'Pack Duo (+35€)' : 'Pack Solo (+25€)';
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `🔥 BOOM ! ${ambassadorName} vient de vendre un ${packLabel} à ${salon} !`,
    }),
  });
}
