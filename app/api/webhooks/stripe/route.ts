import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { createServiceClient } from '@/lib/supabase/service';
import { sendTipReceipt, sendOrderConfirmation, sendPaymentFailed, sendTipRefunded, sendAdminNewOrder } from '@/lib/email';
import { onTipSucceeded, onStaffBankingComplete, onPayoutFailed } from '@/lib/email/lifecycle-events';
import { reverseTransactionTransfers, refundTransactionFull } from '@/lib/stripe/refunds';
import { releaseStaffPendingTransfers } from '@/lib/stripe/tip-transfers';
import { createPackInvoiceForPaymentIntent } from '@/lib/stripe/pack-invoice';
import { signOnboardingToken } from '@/lib/auth/onboarding-token';
import { voidAmbassadorSaleForOrder, restoreAmbassadorSaleForOrder } from '@/lib/ambassadeur/sales';
import { COMMISSION_BY_PACK } from '@/lib/ambassador-tiers';
import { makeUniqueEstablishmentSlug } from '@/lib/establishment-slug';

// MUST be nodejs: stripe.webhooks.constructEvent() uses Node.js crypto module
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  // A single URL backs TWO Stripe endpoints with different signing secrets:
  //  - the platform ("your account") endpoint → payment_intent.*, charge.*,
  //    checkout.session.* (tips are charged on the platform);
  //  - the Connect ("connected accounts") endpoint → account.updated, payout.*,
  //    transfer.* (events on staff/connected accounts).
  // Try each configured secret so both kinds of event verify on the same route.
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET_CONNECT,
  ].filter((s): s is string => !!s);

  let event: Stripe.Event | null = null;
  let lastErr = 'no signing secret configured';
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(body, sig, secret);
      break;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : 'Unknown error';
    }
  }
  if (!event) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${lastErr}` }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Idempotency: check if already successfully processed
  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id, processed_at')
    .eq('stripe_event_id', event.id)
    .single();

  if (existing?.processed_at) {
    return NextResponse.json({ received: true });
  }

  // Log event first — ensures replay support even if handler crashes
  await supabase.from('webhook_events').upsert(
    {
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event as unknown as import('@/types/database').Json,
    },
    { onConflict: 'stripe_event_id' }
  );

  try {
    await handleEvent(event, supabase);

    await supabase
      .from('webhook_events')
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq('stripe_event_id', event.id);

    return NextResponse.json({ received: true });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stripe webhook] handler failed:', err);

    await supabase
      .from('webhook_events')
      .update({ error: errorMsg })
      .eq('stripe_event_id', event.id);

    // Return 500 so Stripe retries delivery
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }
}

async function handleEvent(
  event: Stripe.Event,
  supabase: ReturnType<typeof createServiceClient>
) {
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const intent = event.data.object as Stripe.PaymentIntent;

      // ── Hardware pack express (embedded checkout on /checkout page) ──
      if (intent.metadata?.source === 'pack-express') {
        if (intent.status !== 'succeeded') break;
        await handlePackExpressPaid(intent, supabase);
        break;
      }

      // ── Hardware pack order (the /order wizard, in-page payment) ──
      if (intent.metadata?.source === 'pack-order') {
        if (intent.status !== 'succeeded') break;
        await handlePackOrderPaid(intent, supabase);
        break;
      }

      const transactionId = intent.metadata?.transaction_id;

      if (!transactionId) {
        throw new Error(`Missing transaction_id in payment_intent metadata: ${intent.id}`);
      }

      // Defensive: only flip to succeeded if Stripe confirms the PI is fully paid.
      if (intent.status !== 'succeeded') break;

      const chargeId = typeof intent.latest_charge === 'string'
        ? intent.latest_charge
        : (intent.latest_charge as Stripe.Charge | null)?.id ?? null;

      const isGroup = intent.metadata?.group_tip === 'true';
      const transferGroup = intent.metadata?.transfer_group ?? null;

      // Defense-in-depth: read the distributable amount and the kept fee from
      // our own transaction record (written server-side at intent creation),
      // never from the mutable PaymentIntent metadata.
      const { data: curTxn } = await supabase
        .from('transactions')
        .select('staff_id, establishment_id, metadata')
        .eq('id', transactionId)
        .single();
      const curMeta = (curTxn?.metadata ?? {}) as Record<string, unknown>;
      const dbTip = Number(curMeta.tip_amount);
      const dbPlatformFee = Number(curMeta.platform_fee);
      const dbServiceFee = Number(curMeta.service_fee);
      const netForStaff = Number.isFinite(dbTip) && Number.isFinite(dbPlatformFee)
        ? Math.max(0, dbTip - dbPlatformFee)
        : 0;
      // The platform keeps the commission + the fixed service fee; everything
      // else is owed to staff. With separate charges there is no Stripe
      // application fee object — what we keep is simply what we don't transfer.
      const keptFee = Number.isFinite(dbPlatformFee)
        ? dbPlatformFee + (Number.isFinite(dbServiceFee) ? dbServiceFee : 0)
        : null;

      // Mark the transaction succeeded. Persist transfer_group into metadata so
      // the reconcile cron can replay held transfers later. Idempotent: the
      // `status='pending'` guard makes a duplicate delivery a no-op.
      await supabase
        .from('transactions')
        .update({
          status: 'succeeded',
          stripe_payment_intent_id: intent.id,
          succeeded_at: new Date().toISOString(),
          stripe_charge_id: chargeId,
          application_fee_amount: keptFee,
          metadata: { ...curMeta, ...(transferGroup ? { transfer_group: transferGroup } : {}) },
        } as never)
        .eq('id', transactionId)
        .eq('status', 'pending');

      // ── Held allocations: one group_tip_transfers row per staff member ──
      // Solo = a single recipient; group = split across EVERY active staff
      // member (onboarded or not). Each row starts `pending` and is transferred
      // once that staff member's Stripe account is ready — here if already
      // onboarded, otherwise on account.updated or via the reconcile cron.
      // The rounding remainder goes to the first staff member so the whole net
      // is always distributed (no centimes stranded on the platform).
      if (chargeId && netForStaff > 0) {
        let recipients: Array<{ staff_id: string; amount: number }> = [];
        if (isGroup) {
          const establishmentId = curTxn?.establishment_id ?? intent.metadata?.establishment_id ?? null;
          if (establishmentId) {
            const { data: staffMembers } = await supabase
              .from('staff_profiles')
              .select('id')
              .eq('establishment_id', establishmentId)
              .eq('is_active', true)
              .is('deleted_at', null)
              .order('id'); // deterministic remainder recipient
            if (staffMembers && staffMembers.length > 0) {
              const n = staffMembers.length;
              const baseShare = Math.floor(netForStaff / n);
              const remainder = netForStaff - baseShare * n;
              recipients = staffMembers.map((s, i) => ({
                staff_id: s.id,
                amount: baseShare + (i === 0 ? remainder : 0),
              }));
            }
          }
        } else if (curTxn?.staff_id) {
          recipients = [{ staff_id: curTxn.staff_id, amount: netForStaff }];
        }

        // Idempotency: a unique (transaction_id, staff_id) index makes a
        // re-delivered OR concurrently-delivered webhook a no-op instead of
        // creating duplicate allocation rows (the old check-then-insert had a
        // race between two parallel deliveries). ON CONFLICT DO NOTHING.
        if (recipients.length > 0) {
          await supabase.from('group_tip_transfers').upsert(
            recipients.map((r) => ({
              transaction_id: transactionId,
              staff_id: r.staff_id,
              amount: r.amount,
              status: 'pending',
            })) as never,
            { onConflict: 'transaction_id,staff_id', ignoreDuplicates: true }
          );
        }

        // Transfer to staff who are already onboarded; the rest stays held.
        const { data: rowsRaw } = await supabase
          .from('group_tip_transfers')
          .select('id, staff_id, amount, status')
          .eq('transaction_id', transactionId);
        const pendingRows = ((rowsRaw ?? []) as Array<{ id: string; staff_id: string; amount: number; status?: string }>)
          .filter((r) => (r.status ?? 'pending') === 'pending');

        if (pendingRows.length > 0) {
          const { data: staffAccts } = await supabase
            .from('staff_profiles')
            .select('id, stripe_account_id, onboarding_status')
            .in('id', pendingRows.map((r) => r.staff_id));
          const readyAccountById = new Map<string, string>();
          for (const s of staffAccts ?? []) {
            if (s.stripe_account_id && s.onboarding_status === 'complete') {
              readyAccountById.set(s.id, s.stripe_account_id);
            }
          }

          for (const row of pendingRows) {
            const account = readyAccountById.get(row.staff_id);
            if (!account) continue; // held until this staff member finishes onboarding
            try {
              const transfer = await stripe.transfers.create(
                {
                  amount: row.amount,
                  currency: intent.currency,
                  destination: account,
                  description: 'Pourboire',
                  ...(transferGroup ? { transfer_group: transferGroup } : {}),
                  source_transaction: chargeId,
                },
                { idempotencyKey: `gtt:${row.id}` }
              );
              await supabase
                .from('group_tip_transfers')
                .update({ status: 'succeeded', stripe_transfer_id: transfer.id, attempts: 1, error: null, transferred_at: new Date().toISOString() } as never)
                .eq('id', row.id);
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'unknown';
              console.error('tip transfer create failed', { rowId: row.id, err });
              await supabase
                .from('group_tip_transfers')
                .update({ status: 'failed', error: msg, attempts: 1 } as never)
                .eq('id', row.id);
            }
          }
        }
      }

      // Send receipt email if customer provided their email
      if (intent.receipt_email) {
        const { data: txn } = await supabase
          .from('transactions')
          .select('amount, currency, staff_profiles(full_name, establishments(name))')
          .eq('id', transactionId)
          .single();

        if (txn) {
          const staff = txn.staff_profiles as { full_name: string; establishments: { name: string } | null } | null;
          await sendTipReceipt({
            to: intent.receipt_email,
            amount: txn.amount,
            currency: txn.currency,
            staffName: staff?.full_name ?? 'your server',
            establishmentName: staff?.establishments?.name ?? '',
            transactionId,
          }).catch((err) => console.error('[email] sendTipReceipt failed', err));
        }
      }

      // Lifecycle: first-tip celebration + earnings milestones (non-blocking).
      await onTipSucceeded(supabase, transactionId).catch((err) =>
        console.error('[lifecycle] onTipSucceeded failed', err));

      break;
    }

    case 'payment_intent.payment_failed': {
      const intent = event.data.object as Stripe.PaymentIntent;
      const transactionId = intent.metadata?.transaction_id;
      if (!transactionId) break;

      await supabase
        .from('transactions')
        .update({
          status: 'failed',
          stripe_payment_intent_id: intent.id,
        })
        .eq('id', transactionId)
        .eq('status', 'pending');

      if (intent.receipt_email) {
        const { data: txn } = await supabase
          .from('transactions')
          .select('amount, currency, staff_profiles(full_name, establishments(name))')
          .eq('id', transactionId)
          .single();

        if (txn) {
          const staff = txn.staff_profiles as { full_name: string; establishments: { name: string } | null } | null;
          await sendPaymentFailed({
            to: intent.receipt_email,
            amount: intent.amount,
            currency: intent.currency,
            staffName: staff?.full_name ?? 'the staff member',
            establishmentName: staff?.establishments?.name ?? '',
          }).catch(() => {});
        }
      }

      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id;

      if (!paymentIntentId) break;

      const { data: txn } = await supabase
        .from('transactions')
        .select('id, amount, currency, staff_profiles(full_name, establishments(name))')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle();

      if (txn) {
        const fullyRefunded = charge.amount_refunded >= charge.amount;
        const newStatus = fullyRefunded ? 'refunded' : 'partially_refunded';

        await supabase
          .from('transactions')
          .update({
            status: newStatus,
            refunded_amount: charge.amount_refunded,
          } as never)
          .eq('id', txn.id);

        // Reverse the transfer(s) to the connected account(s) so the platform
        // doesn't end up bearing the refund alone. Idempotent — Stripe may
        // have already reversed if the refund was created with reverse_transfer:true.
        try {
          await reverseTransactionTransfers(txn.id, supabase);
        } catch (err) {
          console.error('refund: transfer reversal failed', { transactionId: txn.id, err });
        }
      }

      // Not a tip — possibly a SmartTag pack purchase. A fully refunded pack
      // produced no kept revenue, so the ambassador commission earned on it
      // must be voided (otherwise it stays withdrawable on money returned).
      if (!txn && charge.amount_refunded >= charge.amount) {
        await voidAmbassadorCommissionByPaymentIntent(supabase, paymentIntentId, 'pack_refunded');
      }

      const customerEmail = charge.receipt_email ?? charge.billing_details.email;
      if (customerEmail && txn) {
        const staff = txn.staff_profiles as { full_name: string; establishments: { name: string } | null } | null;
        await sendTipRefunded({
          to: customerEmail,
          amount: charge.amount_refunded,
          currency: charge.currency,
          staffName: staff?.full_name ?? undefined,
          establishmentName: staff?.establishments?.name ?? undefined,
        }).catch(() => {});
      }

      break;
    }

    case 'charge.dispute.created': {
      const dispute = event.data.object as Stripe.Dispute;
      const paymentIntentId =
        typeof dispute.payment_intent === 'string'
          ? dispute.payment_intent
          : dispute.payment_intent?.id ?? null;
      if (!paymentIntentId) break;

      const { data: txn } = await supabase
        .from('transactions')
        .select('id, staff_id, amount')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle();
      if (!txn) {
        // Not a tip — possibly a SmartTag pack purchase. Void the ambassador
        // commission and freeze the seller until a super-admin reviews it.
        await handlePackDisputeOpened(supabase, paymentIntentId);
        break;
      }

      await supabase
        .from('transactions')
        .update({ status: 'disputed', dispute_id: dispute.id } as never)
        .eq('id', txn.id);

      // Freeze payouts for this staff member until the dispute is resolved.
      if (txn.staff_id) {
        await supabase
          .from('staff_profiles')
          .update({ payouts_frozen: true } as never)
          .eq('id', txn.staff_id);
      }

      break;
    }

    case 'charge.dispute.closed': {
      const dispute = event.data.object as Stripe.Dispute;
      const paymentIntentId =
        typeof dispute.payment_intent === 'string'
          ? dispute.payment_intent
          : dispute.payment_intent?.id ?? null;
      if (!paymentIntentId) break;

      const { data: txn } = await supabase
        .from('transactions')
        .select('id, staff_id')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle();
      if (!txn) {
        // SmartTag pack dispute resolution. Won → the commission is earned
        // again and is un-voided; lost → it stays voided. Either way the
        // seller stays frozen until a super-admin reviews from the dashboard.
        if (dispute.status === 'won' || dispute.status === 'warning_closed') {
          await restoreAmbassadorCommissionByPaymentIntent(supabase, paymentIntentId);
        }
        break;
      }

      if (dispute.status === 'won' || dispute.status === 'warning_closed') {
        // Funds restored — clear dispute marker and unfreeze if no other disputes.
        await supabase
          .from('transactions')
          .update({ status: 'succeeded', dispute_id: null } as never)
          .eq('id', txn.id);

        if (txn.staff_id) {
          const { data: stillDisputed } = await supabase
            .from('transactions')
            .select('id')
            .eq('staff_id', txn.staff_id)
            .eq('status', 'disputed')
            .limit(1);
          if (!stillDisputed || stillDisputed.length === 0) {
            await supabase
              .from('staff_profiles')
              .update({ payouts_frozen: false } as never)
              .eq('id', txn.staff_id);
          }
        }
      } else if (dispute.status === 'lost') {
        // Funds permanently withdrawn — make sure the transfer is reversed.
        try {
          await reverseTransactionTransfers(txn.id, supabase);
        } catch (err) {
          console.error('dispute lost: reversal failed', { transactionId: txn.id, err });
        }
        await supabase
          .from('transactions')
          .update({ status: 'reversed' } as never)
          .eq('id', txn.id);
      }

      break;
    }

    case 'charge.dispute.funds_withdrawn':
    case 'charge.dispute.funds_reinstated': {
      // Bookkeeping only — actual status changes happen on dispute.created
      // and dispute.closed. We just record that Stripe moved money.
      const dispute = event.data.object as Stripe.Dispute;
      const paymentIntentId =
        typeof dispute.payment_intent === 'string'
          ? dispute.payment_intent
          : dispute.payment_intent?.id ?? null;
      if (!paymentIntentId) break;

      const { data: txn } = await supabase
        .from('transactions')
        .select('id, staff_id, amount')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle();
      if (!txn) break;

      if (event.type === 'charge.dispute.funds_withdrawn' && txn.staff_id) {
        await supabase.from('negative_balance_events').insert({
          staff_id: txn.staff_id,
          transaction_id: txn.id,
          amount_owed: dispute.amount,
          dispute_id: dispute.id,
          status: 'owed',
        } as never);
      } else if (event.type === 'charge.dispute.funds_reinstated' && txn.staff_id) {
        await supabase
          .from('negative_balance_events')
          .update({ status: 'recovered', resolved_at: new Date().toISOString() } as never)
          .eq('dispute_id', dispute.id)
          .eq('status', 'owed');
      }

      break;
    }

    case 'radar.early_fraud_warning.created': {
      const efw = event.data.object as Stripe.Radar.EarlyFraudWarning;
      const chargeId = typeof efw.charge === 'string' ? efw.charge : efw.charge?.id ?? null;
      if (!chargeId || !efw.actionable) break;

      const { data: txn } = await supabase
        .from('transactions')
        .select('id, status')
        .eq('stripe_charge_id', chargeId)
        .maybeSingle();
      if (!txn) break;
      if (txn.status === 'refunded' || txn.status === 'reversed') break;

      // Refund now to dodge the 15 EUR dispute fee that follows shortly after EFW.
      const res = await refundTransactionFull(txn.id, supabase, 'early_fraud_warning');
      if (!res.ok) {
        console.error('EFW auto-refund failed', { transactionId: txn.id, error: res.error });
      }
      break;
    }

    case 'transfer.reversed': {
      const transfer = event.data.object as Stripe.Transfer;
      const now = new Date().toISOString();

      await supabase
        .from('transactions')
        .update({ reversed_at: now } as never)
        .eq('stripe_transfer_id', transfer.id)
        .is('reversed_at', null);

      await supabase
        .from('group_tip_transfers')
        .update({ reversed_at: now } as never)
        .eq('stripe_transfer_id', transfer.id)
        .is('reversed_at', null);

      break;
    }

    case 'payout.paid':
    case 'payout.failed': {
      const payout = event.data.object as Stripe.Payout;
      // Stripe sends payout events on connected accounts; the staff_id is
      // resolved via the account ID on the event.
      const accountId = (event as Stripe.Event & { account?: string }).account ?? null;
      if (!accountId) break;

      const { data: staff } = await supabase
        .from('staff_profiles')
        .select('id')
        .eq('stripe_account_id', accountId)
        .maybeSingle();
      if (!staff) break;

      if (event.type === 'payout.paid') {
        await supabase.from('staff_payouts').upsert({
          staff_id: staff.id,
          stripe_payout_id: payout.id,
          amount: payout.amount,
          status: 'paid',
          paid_at: new Date().toISOString(),
        } as never, { onConflict: 'stripe_payout_id' });
      } else {
        await supabase.from('staff_payouts').upsert({
          staff_id: staff.id,
          stripe_payout_id: payout.id,
          amount: payout.amount,
          status: 'failed',
          failure_code: payout.failure_code,
          failure_message: payout.failure_message,
          failed_at: new Date().toISOString(),
        } as never, { onConflict: 'stripe_payout_id' });

        await supabase
          .from('staff_profiles')
          .update({
            last_payout_failure_code: payout.failure_code,
            last_payout_failure_at: new Date().toISOString(),
          } as never)
          .eq('id', staff.id);

        await onPayoutFailed(supabase, staff.id).catch((err) =>
          console.error('[lifecycle] onPayoutFailed failed', err));
      }

      break;
    }

    case 'account.application.deauthorized': {
      const accountId = (event as Stripe.Event & { account?: string }).account ?? null;
      if (!accountId) break;

      await supabase
        .from('staff_profiles')
        .update({ payouts_frozen: true, onboarding_status: 'deauthorized' } as never)
        .eq('stripe_account_id', accountId);

      break;
    }

    case 'account.updated': {
      const account = event.data.object as Stripe.Account;
      if (account.details_submitted && account.charges_enabled) {
        const { data: staffRow } = await supabase
          .from('staff_profiles')
          .select('id, onboarding_status')
          .eq('stripe_account_id', account.id)
          .maybeSingle();
        // Only act on the actual transition into 'complete'.
        if (staffRow && staffRow.onboarding_status !== 'complete') {
          await supabase
            .from('staff_profiles')
            .update({ onboarding_status: 'complete' })
            .eq('id', staffRow.id);
          await onStaffBankingComplete(supabase, staffRow.id).catch((err) =>
            console.error('[lifecycle] onStaffBankingComplete failed', err));
          // Deferred onboarding: pay out every tip that accumulated (held) while
          // this staff member was completing their Stripe onboarding.
          await releaseStaffPendingTransfers(supabase, staffRow.id).catch((err) =>
            console.error('[release] releaseStaffPendingTransfers failed', err));
        }
      }
      break;
    }

    // ============================================================
    // SmartTag pack orders (one-shot hardware purchase, mode=payment)
    // ============================================================
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      // Legacy subscription sessions are ignored; everything is one-shot now.
      if (session.mode !== 'payment') break;

      // Persist the PaymentIntent id on the order so a later refund/dispute
      // webhook (which only carries the charge → PI) can reverse the
      // ambassador commission tied to this purchase.
      const sessionPaymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent as { id?: string } | null)?.id ?? null;

      const groupId = session.metadata?.group_id;
      const rawPack = session.metadata?.pack;
      const pack = (['solo', 'duo'] as const).find((p) => p === rawPack);

      // ── Express checkout (landing page guest flow) ──────────────────────────
      if (!groupId && session.metadata?.source === 'express' && pack) {
        const email = session.customer_details?.email;
        const legalName = session.customer_details?.name?.trim() || email || 'Unknown';
        const shipping = session.collected_information?.shipping_details ?? null;
        const customerId = typeof session.customer === 'string'
          ? session.customer
          : (session.customer as Stripe.Customer | null)?.id ?? null;
        const quantity = Number(session.metadata?.quantity ?? 0) || (pack === 'solo' ? 1 : 2);

        const { data: newGroup, error: groupErr } = await supabase
          .from('groups')
          .insert({
            name: legalName,
            legal_name: legalName,
            stripe_customer_id: customerId,
            shipping_address: shipping
              ? ({ name: shipping.name, ...shipping.address } as unknown as import('@/types/database').Json)
              : null,
            settings: { tip_thresholds: [5, 10, 20] },
          })
          .select('id')
          .single();

        if (groupErr || !newGroup) {
          throw new Error(`Express checkout: failed to create group — ${groupErr?.message ?? 'unknown'}`);
        }

        // Fetch the Stripe invoice created by invoice_creation.enabled
        const invoiceId = typeof session.invoice === 'string' ? session.invoice : (session.invoice as { id?: string } | null)?.id ?? null;
        let invoicePdfUrl: string | null = null;
        if (invoiceId) {
          try {
            const inv = await stripe.invoices.retrieve(invoiceId);
            invoicePdfUrl = inv.invoice_pdf ?? null;
          } catch { /* non-blocking */ }
        }

        // Extract discount info for express checkout
        const expressPromoCode = session.metadata?.promo_code ?? null;
        const expressDiscount = session.total_details?.amount_discount ?? 0;
        const expressFirstDiscount = session.total_details?.breakdown?.discounts?.[0];
        const expressDiscountId = expressFirstDiscount
          ? (typeof expressFirstDiscount.discount === 'string' ? expressFirstDiscount.discount : (expressFirstDiscount.discount as { id?: string } | null)?.id ?? null)
          : null;

        const { data: newOrder, error: newOrderErr } = await supabase.from('smarttag_orders').insert({
          group_id: newGroup.id,
          pack,
          quantity,
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: sessionPaymentIntentId,
          stripe_invoice_id: invoiceId,
          status: 'pending_fulfillment',
          shipping_address: shipping
            ? ({ name: shipping.name, ...shipping.address } as unknown as import('@/types/database').Json)
            : null,
          promo_code: expressPromoCode,
          discount_amount: expressDiscount,
          stripe_discount_id: expressDiscountId,
        }).select('id').single();
        if (newOrderErr || !newOrder) {
          throw new Error(`express checkout: failed to create smarttag_order — ${newOrderErr?.message ?? 'unknown'}`);
        }

        // Best-effort: auto-assign available unencoded tags from pool to this order
        if (newOrder?.id) {
          await autoAssignTagsToOrder(supabase, newOrder.id, quantity);
        }

        // Ambassador attribution for express checkout
        if (newOrder?.id && expressPromoCode) {
          await attributeAmbassadorSale(
            supabase, expressPromoCode,
            newOrder.id, pack, session.customer_details?.name ?? ''
          );
        }

        // Auto-provision establishment for the express checkout group
        const expressSlug = await makeUniqueEstablishmentSlug(supabase, legalName);
        const expressCountry = (shipping?.address?.country ?? 'FR').toUpperCase();
        const expressLocale = session.locale?.startsWith('fr') ? 'fr' : 'en';

        await supabase.from('establishments').insert({
          group_id: newGroup.id,
          name: legalName,
          business_type: 'beauty',
          slug: expressSlug,
          country: expressCountry,
          currency: 'eur',
          onboarding_status: 'not_started',
        });

        // Build the setup URL embedded in the order confirmation email.
        // The link is signed (HMAC) so a leaked / guessed group UUID alone
        // cannot trigger the express onboarding wizard.
        if (email && newOrder) {
          const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? '';
          const onboardingToken = signOnboardingToken(newGroup.id, email);
          const setupUrl = `${base}/${expressLocale}/onboarding?group=${newGroup.id}&token=${onboardingToken}&email=${encodeURIComponent(email)}`;
          await sendOrderConfirmation({
            to: email,
            pack,
            quantity,
            orderId: newOrder.id,
            invoicePdfUrl,
            setupUrl,
            locale: expressLocale,
          }).catch((err) => console.error('[email] sendOrderConfirmation failed', err));

          await sendAdminNewOrder({
            customerName: legalName,
            customerEmail: email,
            pack,
            quantity,
            orderId: newOrder.id,
            promoCode: expressPromoCode,
            locale: expressLocale,
          }).catch((err) => console.error('[email] sendAdminNewOrder failed', err));
        }

        break;
      }

      if (!groupId || !pack) {
        // Not a known pack checkout.
        break;
      }

      const customerId = typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id;

      const shipping = session.collected_information?.shipping_details ?? null;

      await supabase
        .from('groups')
        .update({
          stripe_customer_id: customerId ?? undefined,
          ...(shipping
            ? {
                shipping_address: {
                  name: shipping.name,
                  ...shipping.address,
                } as unknown as import('@/types/database').Json,
              }
            : {}),
        })
        .eq('id', groupId);

      // Fetch Stripe invoice created by invoice_creation.enabled
      const invoiceId = typeof session.invoice === 'string' ? session.invoice : (session.invoice as { id?: string } | null)?.id ?? null;
      let invoicePdfUrl: string | null = null;
      if (invoiceId) {
        try {
          const inv = await stripe.invoices.retrieve(invoiceId);
          invoicePdfUrl = inv.invoice_pdf ?? null;
        } catch { /* non-blocking */ }
      }

      const quantity = Number(session.metadata?.quantity ?? 0) || null;

      // Extract discount info from the Stripe session
      const promoCodeStr = session.metadata?.promo_code ?? null;
      const totalDiscount = session.total_details?.amount_discount ?? 0;
      const firstDiscount = session.total_details?.breakdown?.discounts?.[0];
      const stripeDiscountId = firstDiscount
        ? (typeof firstDiscount.discount === 'string' ? firstDiscount.discount : (firstDiscount.discount as { id?: string } | null)?.id ?? null)
        : null;

      // Resolve our internal promo_code_id if we know the code
      let promoCodeId: string | null = null;
      if (promoCodeStr) {
        const { data: pc } = await supabase
          .from('promo_codes')
          .select('id')
          .eq('code', promoCodeStr)
          .maybeSingle();
        promoCodeId = pc?.id ?? null;
        // Increment times_redeemed (best effort — never break the webhook)
        if (promoCodeId) {
          try {
            await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)(
              'increment_promo_redeemed',
              { promo_id: promoCodeId }
            );
          } catch { /* ignore */ }
        }
      }

      const { data: upsertedOrder, error: upsertErr } = await supabase
        .from('smarttag_orders')
        .upsert(
          {
            group_id: groupId,
            pack,
            quantity: quantity ?? (pack === 'solo' ? 1 : 2),
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: sessionPaymentIntentId,
            stripe_invoice_id: invoiceId,
            status: 'pending_fulfillment',
            shipping_address: shipping
              ? ({
                  name: shipping.name,
                  ...shipping.address,
                } as unknown as import('@/types/database').Json)
              : null,
            promo_code: promoCodeStr,
            promo_code_id: promoCodeId,
            discount_amount: totalDiscount,
            stripe_discount_id: stripeDiscountId,
          },
          { onConflict: 'stripe_checkout_session_id' }
        ).select('id').single();

      if (upsertErr || !upsertedOrder) {
        throw new Error(`auth checkout: failed to upsert smarttag_order — ${upsertErr?.message ?? 'unknown'}`);
      }

      // Best-effort: auto-assign available tags from pool to this order
      if (upsertedOrder?.id) {
        const orderQty = quantity ?? (pack === 'solo' ? 1 : 2);
        await autoAssignTagsToOrder(supabase, upsertedOrder.id, orderQty);
      }

      // Send order confirmation email to the group admin
      if (upsertedOrder) {
        try {
          const { data: adminRole } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('group_id', groupId)
            .eq('role', 'group_admin')
            .limit(1)
            .single();
          if (adminRole) {
            const { data: { user: adminUser } } = await supabase.auth.admin.getUserById(adminRole.user_id);
            if (adminUser?.email) {
              await sendOrderConfirmation({
                to: adminUser.email,
                pack,
                quantity: upsertedOrder ? (quantity ?? (pack === 'solo' ? 1 : 2)) : (pack === 'solo' ? 1 : 2),
                orderId: upsertedOrder.id,
                invoicePdfUrl,
                locale: session.locale?.startsWith('fr') ? 'fr' : 'en',
              }).catch(() => {});
            }
          }
        } catch { /* non-blocking */ }
      }

      // Admin alert for new order
      if (upsertedOrder?.id) {
        const authLocale = session.locale?.startsWith('fr') ? 'fr' : 'en';
        const authQty = quantity ?? (pack === 'solo' ? 1 : 2);
        const customerName = session.customer_details?.name ?? session.customer_details?.email ?? 'Unknown';
        await sendAdminNewOrder({
          customerName,
          customerEmail: session.customer_details?.email ?? undefined,
          pack,
          quantity: authQty,
          orderId: upsertedOrder.id,
          promoCode: promoCodeStr,
          locale: authLocale,
        }).catch(() => {});
      }

      // Ambassador attribution for authenticated checkout
      if (upsertedOrder?.id && promoCodeStr) {
        await attributeAmbassadorSale(
          supabase, promoCodeStr,
          upsertedOrder.id, pack, session.customer_details?.name ?? ''
        );
      }

      // Auto-provision first establishment for new groups so the tip flow works immediately
      const { data: existingEst } = await supabase
        .from('establishments')
        .select('id')
        .eq('group_id', groupId)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();

      if (!existingEst) {
        const { data: grp } = await supabase
          .from('groups')
          .select('name, legal_name')
          .eq('id', groupId)
          .single();

        const estName = grp?.legal_name ?? grp?.name ?? 'Mon établissement';
        const slug = await makeUniqueEstablishmentSlug(supabase, estName);
        const country = (shipping?.address?.country ?? 'FR').toUpperCase();

        await supabase.from('establishments').insert({
          group_id: groupId,
          name: estName,
          business_type: 'beauty',
          slug,
          country,
          currency: 'eur',
          onboarding_status: 'not_started',
        });
      }

      break;
    }

    // Legacy subscription events — kept as no-ops so historical customers
    // on the old model don't trigger webhook errors. Safe to remove once
    // all legacy subs are canceled.
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'invoice.payment_failed':
    case 'invoice.paid': {
      break;
    }

    default:
      // Unknown event types are logged but not errored
      break;
  }
}

// ─── Hardware pack express (embedded /checkout) ──────────────────────────────

async function handlePackExpressPaid(
  intent: Stripe.PaymentIntent,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const rawPack = intent.metadata?.pack;
  const pack = (['solo', 'duo'] as const).find((p) => p === rawPack);
  if (!pack) {
    throw new Error(`pack-express PI missing valid pack metadata: ${intent.id}`);
  }

  // Idempotency: if this PI already produced an order, exit silently.
  const { data: existing } = await supabase
    .from('smarttag_orders')
    .select('id')
    .eq('stripe_payment_intent_id', intent.id)
    .maybeSingle();
  if (existing) return;

  const rawShipping = intent.shipping ?? null;
  // Stripe sometimes hands us a shipping object that's structurally present
  // but full of empty strings (Link without shippingAddressRequired). Treat
  // that as "no shipping" so downstream fallbacks kick in.
  const shippingName = rawShipping?.name?.trim() || null;
  const shippingHasAddress =
    !!(rawShipping?.address && (
      rawShipping.address.line1?.trim() ||
      rawShipping.address.city?.trim() ||
      rawShipping.address.postal_code?.trim()
    ));
  const shipping = shippingName || shippingHasAddress ? rawShipping : null;

  // Email resolution order:
  //  1. PI metadata.customer_email — set by /api/billing/attach-pi-email just
  //     before confirmPayment, so the webhook has a deterministic source even
  //     when receipt_email is intentionally unset to suppress Stripe receipts.
  //  2. intent.receipt_email — legacy fallback for older PIs.
  //  3. latest_charge.billing_details.email — Link populates this; we retrieve
  //     the charge because event payloads carry only the id.
  let email: string | null = intent.metadata?.customer_email?.trim() || null;
  if (!email) email = intent.receipt_email ?? null;
  if (!email && intent.latest_charge) {
    if (typeof intent.latest_charge !== 'string') {
      email = (intent.latest_charge as Stripe.Charge).billing_details?.email ?? null;
    } else {
      try {
        const charge = await stripe.charges.retrieve(intent.latest_charge);
        email = charge.billing_details?.email ?? null;
      } catch { /* non-blocking */ }
    }
  }

  const legalName = shippingName ?? email ?? 'Unknown';
  const quantity =
    Number(intent.metadata?.quantity ?? 0) || (pack === 'solo' ? 1 : 2);
  const promoCodeStr = intent.metadata?.promo_code ?? null;
  const promoCodeId = intent.metadata?.promo_code_id ?? null;
  const discountAmount = Number(intent.metadata?.discount_amount ?? 0) || 0;
  const locale = intent.metadata?.locale === 'fr' ? 'fr' : 'en';

  let customerId = typeof intent.customer === 'string'
    ? intent.customer
    : (intent.customer as Stripe.Customer | null)?.id ?? null;

  // The embedded /checkout flow charges a bare PaymentIntent with no Stripe
  // customer. Create one now so the order can be issued a real invoice below.
  if (!customerId) {
    try {
      const customer = await stripe.customers.create(
        {
          ...(email ? { email } : {}),
          name: legalName,
          ...(shipping?.address
            ? {
                address: {
                  line1: shipping.address.line1 ?? undefined,
                  line2: shipping.address.line2 ?? undefined,
                  city: shipping.address.city ?? undefined,
                  postal_code: shipping.address.postal_code ?? undefined,
                  state: shipping.address.state ?? undefined,
                  country: shipping.address.country ?? undefined,
                },
              }
            : {}),
          metadata: { source: 'pack-express', payment_intent: intent.id },
        },
        { idempotencyKey: `pack-express-customer:${intent.id}` },
      );
      customerId = customer.id;
    } catch (err) {
      console.error('[pack-express] customer create failed', err);
    }
  }

  // Create the group on the fly (mirror of express checkout.session.completed)
  const { data: newGroup, error: groupErr } = await supabase
    .from('groups')
    .insert({
      name: legalName,
      legal_name: legalName,
      stripe_customer_id: customerId,
      shipping_address: shipping
        ? ({ name: shipping.name, ...shipping.address } as unknown as import('@/types/database').Json)
        : null,
      settings: { tip_thresholds: [5, 10, 20] },
    })
    .select('id')
    .single();

  if (groupErr || !newGroup) {
    throw new Error(`pack-express: failed to create group — ${groupErr?.message ?? 'unknown'}`);
  }

  const { data: newOrder, error: orderErr } = await supabase
    .from('smarttag_orders')
    .insert({
      group_id: newGroup.id,
      pack,
      quantity,
      stripe_payment_intent_id: intent.id,
      status: 'pending_fulfillment',
      shipping_address: shipping
        ? ({ name: shipping.name, ...shipping.address } as unknown as import('@/types/database').Json)
        : null,
      promo_code: promoCodeStr,
      promo_code_id: promoCodeId,
      discount_amount: discountAmount,
    })
    .select('id')
    .single();

  if (orderErr || !newOrder) {
    throw new Error(`pack-express: failed to create smarttag_order — ${orderErr?.message ?? 'unknown'}`);
  }

  // Issue a downloadable invoice for the order. The embedded checkout pays a
  // raw PaymentIntent, so Stripe's invoice_creation (Checkout-only) can't
  // apply — build and pay the invoice out of band. Best-effort: never throw.
  let invoicePdfUrl: string | null = null;
  if (customerId && newOrder?.id) {
    try {
      // HT (excl. VAT) so the invoice breaks out VAT consistently with the
      // amount charged. `ht_amount` is written by /api/billing/pack-tax;
      // fall back to base_amount − discount for older PIs.
      const htAmount = intent.metadata?.ht_amount
        ? parseInt(intent.metadata.ht_amount, 10)
        : (intent.metadata?.base_amount
            ? Math.max(0, parseInt(intent.metadata.base_amount, 10) - discountAmount)
            : null);
      const { invoiceId, invoicePdfUrl: pdf } = await createPackInvoiceForPaymentIntent({
        paymentIntent: intent,
        customerId,
        description: `Digitip — Pack ${pack === 'solo' ? 'Solo' : 'Duo'} (${quantity} SmartTag${quantity > 1 ? 's' : ''})`,
        htAmount,
      });
      invoicePdfUrl = pdf;
      await supabase
        .from('smarttag_orders')
        .update({ stripe_invoice_id: invoiceId })
        .eq('id', newOrder.id);
    } catch (err) {
      console.error('[pack-express] invoice generation failed', err);
    }
  }

  if (newOrder?.id) {
    await autoAssignTagsToOrder(supabase, newOrder.id, quantity);

    // Increment promo redemption count (best-effort)
    if (promoCodeId) {
      try {
        await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)(
          'increment_promo_redeemed',
          { promo_id: promoCodeId }
        );
      } catch { /* ignore */ }
    }

    if (promoCodeStr) {
      await attributeAmbassadorSale(
        supabase, promoCodeStr,
        newOrder.id, pack, legalName
      );
    }
  }

  // Provision a starter establishment so the tip flow works immediately
  const slug = await makeUniqueEstablishmentSlug(supabase, legalName);
  const country = (shipping?.address?.country ?? 'FR').toUpperCase();

  await supabase.from('establishments').insert({
    group_id: newGroup.id,
    name: legalName,
    business_type: 'beauty',
    slug,
    country,
    currency: 'eur',
    onboarding_status: 'not_started',
  });

  // Send customer confirmation + setup link (signed HMAC token).
  if (email && newOrder) {
    const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? '';
    const onboardingToken = signOnboardingToken(newGroup.id, email);
    const setupUrl = `${base}/${locale}/onboarding?group=${newGroup.id}&token=${onboardingToken}&email=${encodeURIComponent(email)}`;
    await sendOrderConfirmation({
      to: email,
      pack,
      quantity,
      orderId: newOrder.id,
      invoicePdfUrl,
      setupUrl,
      locale,
    }).catch((err) => console.error('[email] sendOrderConfirmation failed', err));

    await sendAdminNewOrder({
      customerName: legalName,
      customerEmail: email,
      pack,
      quantity,
      orderId: newOrder.id,
      promoCode: promoCodeStr,
      locale,
    }).catch(() => {});
  }
}

// Handles a paid SmartTag pack order from the /order wizard (in-page Stripe
// Elements). Unlike pack-express, the billing group already exists — the
// PaymentIntent carries its id. Creates the order, invoice, tags and emails.
async function handlePackOrderPaid(
  intent: Stripe.PaymentIntent,
  supabase: ReturnType<typeof createServiceClient>
): Promise<void> {
  const rawPack = intent.metadata?.pack;
  const pack = (['solo', 'duo'] as const).find((p) => p === rawPack);
  const groupId = intent.metadata?.group_id;
  if (!pack || !groupId) {
    throw new Error(`pack-order PI missing pack/group metadata: ${intent.id}`);
  }

  // Idempotency: if this PI already produced an order, exit silently.
  const { data: existing } = await supabase
    .from('smarttag_orders')
    .select('id')
    .eq('stripe_payment_intent_id', intent.id)
    .maybeSingle();
  if (existing) return;

  const quantity = Number(intent.metadata?.quantity ?? 0) || (pack === 'solo' ? 1 : 2);
  const promoCodeStr = intent.metadata?.promo_code ?? null;
  const promoCodeId = intent.metadata?.promo_code_id ?? null;
  const discountAmount = Number(intent.metadata?.discount_amount ?? 0) || 0;
  const locale = intent.metadata?.locale === 'fr' ? 'fr' : 'en';
  const customerId = typeof intent.customer === 'string'
    ? intent.customer
    : (intent.customer as Stripe.Customer | null)?.id ?? null;
  const shipping = intent.shipping ?? null;

  // Invoice — customer already has a billing address, so automatic_tax breaks
  // out the VAT. Best-effort: never throw out of the webhook.
  let invoiceId: string | null = null;
  let invoicePdfUrl: string | null = null;
  if (customerId) {
    try {
      const htAmount = intent.metadata?.ht_amount ? parseInt(intent.metadata.ht_amount, 10) : null;
      const res = await createPackInvoiceForPaymentIntent({
        paymentIntent: intent,
        customerId,
        description: `Digitip — Pack ${pack === 'solo' ? 'Solo' : 'Duo'} (${quantity} SmartTag${quantity > 1 ? 's' : ''})`,
        htAmount,
      });
      invoiceId = res.invoiceId;
      invoicePdfUrl = res.invoicePdfUrl;
    } catch (err) {
      console.error('[pack-order] invoice generation failed', err);
    }
  }

  await supabase
    .from('groups')
    .update({
      ...(customerId ? { stripe_customer_id: customerId } : {}),
      ...(shipping?.address
        ? { shipping_address: { name: shipping.name, ...shipping.address } as unknown as import('@/types/database').Json }
        : {}),
    })
    .eq('id', groupId);

  if (promoCodeId) {
    try {
      await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)(
        'increment_promo_redeemed',
        { promo_id: promoCodeId }
      );
    } catch { /* ignore */ }
  }

  const { data: order, error: orderErr } = await supabase
    .from('smarttag_orders')
    .upsert(
      {
        group_id: groupId,
        pack,
        quantity,
        stripe_payment_intent_id: intent.id,
        stripe_invoice_id: invoiceId,
        status: 'pending_fulfillment',
        shipping_address: shipping?.address
          ? ({ name: shipping.name, ...shipping.address } as unknown as import('@/types/database').Json)
          : null,
        promo_code: promoCodeStr,
        promo_code_id: promoCodeId,
        discount_amount: discountAmount,
      },
      { onConflict: 'stripe_payment_intent_id' }
    )
    .select('id')
    .single();

  if (orderErr || !order) {
    throw new Error(`pack-order: failed to upsert smarttag_order — ${orderErr?.message ?? 'unknown'}`);
  }

  await autoAssignTagsToOrder(supabase, order.id, quantity);

  if (promoCodeStr) {
    await attributeAmbassadorSale(supabase, promoCodeStr, order.id, pack, shipping?.name ?? '');
  }

  // Order confirmation to the buyer + admin alert.
  const userId = intent.metadata?.user_id;
  if (userId) {
    try {
      const { data: { user: buyer } } = await supabase.auth.admin.getUserById(userId);
      if (buyer?.email) {
        await sendOrderConfirmation({
          to: buyer.email, pack, quantity, orderId: order.id, invoicePdfUrl, locale,
        }).catch((err) => console.error('[email] sendOrderConfirmation failed', err));
        await sendAdminNewOrder({
          customerName: shipping?.name ?? buyer.email,
          customerEmail: buyer.email,
          pack, quantity, orderId: order.id, promoCode: promoCodeStr, locale,
        }).catch(() => {});
      }
    } catch { /* non-blocking */ }
  }

  // Auto-provision a starter establishment so the tip flow works immediately.
  const { data: existingEst } = await supabase
    .from('establishments')
    .select('id')
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (!existingEst) {
    const { data: grp } = await supabase
      .from('groups')
      .select('name, legal_name')
      .eq('id', groupId)
      .single();
    const estName = grp?.legal_name ?? grp?.name ?? 'Mon établissement';
    const slug = await makeUniqueEstablishmentSlug(supabase, estName);
    const country = (shipping?.address?.country ?? 'FR').toUpperCase();
    await supabase.from('establishments').insert({
      group_id: groupId,
      name: estName,
      business_type: 'beauty',
      slug,
      country,
      currency: 'eur',
      onboarding_status: 'not_started',
    });
  }
}

// ─── SmartTag auto-assignment ─────────────────────────────────────────────────

// Picks `needed` unassigned tags from the pool and links them to the order.
// Best-effort: silently skips if the pool is empty or partially full.
async function autoAssignTagsToOrder(
  supabase: ReturnType<typeof createServiceClient>,
  orderId: string,
  needed: number
): Promise<void> {
  try {
    // Find IDs of tags already claimed by any order (to exclude them)
    const { data: claimed } = await supabase
      .from('smarttag_order_tags')
      .select('sticker_id');

    const claimedIds = (claimed ?? []).map((r) => r.sticker_id);

    // Pick `needed` free tags
    const query = supabase
      .from('nfc_stickers')
      .select('id')
      .is('establishment_id', null)
      .limit(needed);

    const freeTagsQuery = claimedIds.length > 0
      ? query.not('id', 'in', `(${claimedIds.join(',')})`)
      : query;

    const { data: freeTags } = await freeTagsQuery;
    if (!freeTags?.length) return;

    await supabase.from('smarttag_order_tags').insert(
      freeTags.map((t) => ({ order_id: orderId, sticker_id: t.id }))
    );
  } catch {
    // Never break the webhook — tag assignment is best-effort
  }
}

// ─── Ambassador helpers ───────────────────────────────────────────────────────

/**
 * Resolves the SmartTag order behind a Stripe charge so a refund/dispute can
 * reverse the ambassador commission. Express PaymentIntent orders carry the PI
 * directly; checkout-session orders are matched via the PI's session.
 */
async function resolveSmarttagOrderIdByPaymentIntent(
  supabase: ReturnType<typeof createServiceClient>,
  paymentIntentId: string
): Promise<string | null> {
  const { data: direct } = await supabase
    .from('smarttag_orders')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle();
  if (direct) return direct.id;

  // Fallback for orders created before the PI was persisted on the row.
  try {
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: paymentIntentId,
      limit: 1,
    });
    const sessionId = sessions.data[0]?.id;
    if (sessionId) {
      const { data: bySession } = await supabase
        .from('smarttag_orders')
        .select('id')
        .eq('stripe_checkout_session_id', sessionId)
        .maybeSingle();
      if (bySession) return bySession.id;
    }
  } catch (err) {
    console.error('resolveSmarttagOrderIdByPaymentIntent: session lookup failed', err);
  }
  return null;
}

/** Voids the ambassador commission tied to a charge's SmartTag order. */
async function voidAmbassadorCommissionByPaymentIntent(
  supabase: ReturnType<typeof createServiceClient>,
  paymentIntentId: string,
  reason: string
): Promise<void> {
  const orderId = await resolveSmarttagOrderIdByPaymentIntent(supabase, paymentIntentId);
  if (!orderId) return;
  await voidAmbassadorSaleForOrder(supabase, orderId, reason);
}

/** Un-voids the ambassador commission tied to a charge's SmartTag order. */
async function restoreAmbassadorCommissionByPaymentIntent(
  supabase: ReturnType<typeof createServiceClient>,
  paymentIntentId: string
): Promise<void> {
  const orderId = await resolveSmarttagOrderIdByPaymentIntent(supabase, paymentIntentId);
  if (!orderId) return;
  await restoreAmbassadorSaleForOrder(supabase, orderId);
}

/**
 * Handles a dispute opened against a SmartTag pack purchase: freezes the
 * selling ambassador's withdrawals (so a payout cannot drain funds while the
 * money is at risk) and voids the commission earned on that order. The freeze
 * is intentionally not auto-cleared — a super-admin reviews and unfreezes.
 */
async function handlePackDisputeOpened(
  supabase: ReturnType<typeof createServiceClient>,
  paymentIntentId: string
): Promise<void> {
  const orderId = await resolveSmarttagOrderIdByPaymentIntent(supabase, paymentIntentId);
  if (!orderId) return;

  const { data: sale } = await supabase
    .from('ambassador_sales')
    .select('ambassador_id')
    .eq('smarttag_order_id', orderId)
    .maybeSingle();

  if (sale?.ambassador_id) {
    await supabase
      .from('ambassadors')
      .update({ payouts_frozen: true })
      .eq('id', sale.ambassador_id);
  }

  await voidAmbassadorSaleForOrder(supabase, orderId, 'pack_dispute_opened');
}

async function attributeAmbassadorSale(
  supabase: ReturnType<typeof createServiceClient>,
  promoCodeStr: string,
  orderId: string,
  pack: 'solo' | 'duo',
  rawSalonName: string
): Promise<void> {
  try {
    const { data: pc } = await supabase
      .from('promo_codes')
      .select('id, seller_type')
      .eq('code', promoCodeStr.toUpperCase())
      .maybeSingle();

    if (!pc) return;

    // Route to the commercial programme when the promo code is tagged as such.
    // Codes with a NULL seller_type are treated as ambassador for backward
    // compatibility with pre-migration codes.
    if (pc.seller_type === 'commercial') {
      await attributeCommercialSale(supabase, pc.id, orderId, pack, rawSalonName);
      return;
    }

    const { data: ambassador } = await supabase
      .from('ambassadors')
      .select('id, name')
      .eq('promo_code_id', pc.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!ambassador) return;

    const commissionAmount = COMMISSION_BY_PACK[pack];
    const trimmed = rawSalonName.trim();
    const salonPartial = trimmed.length >= 3 ? `***${trimmed.slice(-3)}` : '***';

    // The unique constraint on smarttag_order_id makes this a no-op if the
    // order was already attributed (a re-delivered webhook). On any insert
    // error, stop — don't fire the referral/Telegram side effects twice.
    const { error: saleErr } = await supabase.from('ambassador_sales').insert({
      ambassador_id: ambassador.id,
      smarttag_order_id: orderId,
      pack,
      commission_amount: commissionAmount,
      salon_name_partial: salonPartial,
    });
    if (saleErr) return;

    void notifyTelegram(ambassador.name, salonPartial, pack).catch((err) => {
      console.error('[webhook] Telegram sale notification failed', err);
    });

    const { checkAndValidateReferral } = await import('@/lib/referrals');
    void checkAndValidateReferral(supabase, ambassador.id)
      .then(async (event) => {
        if (!event) return;
        const { sendReferralValidatedToParrain } = await import('@/lib/email');
        await sendReferralValidatedToParrain(supabase, event.referrerId, ambassador.name, event.amountCents).catch(() => {});
      })
      .catch(() => {});
  } catch {
    // Never break the webhook — ambassador attribution is best-effort
  }
}

/**
 * Records a sale against the Commerciaux Pros programme (50 € solo / 65 € duo).
 * Mirrors `attributeAmbassadorSale` but writes to `commercial_sales` — no
 * referral side-effects and no Telegram alert (that channel is ambassador-only).
 */
async function attributeCommercialSale(
  supabase: ReturnType<typeof createServiceClient>,
  promoCodeId: string,
  orderId: string,
  pack: 'solo' | 'duo',
  rawSalonName: string,
): Promise<void> {
  try {
    const { COMMERCIAL_COMMISSION_BY_PACK } = await import('@/lib/commercial-tiers');

    const { data: commercial } = await supabase
      .from('commerciaux')
      .select('id, name')
      .eq('promo_code_id', promoCodeId)
      .eq('is_active', true)
      .maybeSingle();

    if (!commercial) return;

    const commissionAmount = COMMERCIAL_COMMISSION_BY_PACK[pack];
    const trimmed = rawSalonName.trim();
    const salonPartial = trimmed.length >= 3 ? `***${trimmed.slice(-3)}` : '***';

    const { error: saleErr } = await supabase.from('commercial_sales').insert({
      commercial_id: commercial.id,
      smarttag_order_id: orderId,
      pack,
      commission_amount: commissionAmount,
      salon_name_partial: salonPartial,
    });
    if (saleErr) return;
  } catch {
    // Best-effort attribution — never break the webhook on a downstream error.
  }
}

// Server-only notification — runs in the webhook handler, so the browser CSP
// (connect-src) does not apply to this api.telegram.org call.
async function notifyTelegram(ambassadorName: string, salon: string, pack: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const packLabel = pack === 'duo' ? 'Pack Duo (+45€)' : 'Pack Solo (+35€)';
  const text = `BOOM ! ${ambassadorName} vient de vendre un ${packLabel} à ${salon} !`;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
