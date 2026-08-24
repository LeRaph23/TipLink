import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { createServiceClient } from '@/lib/supabase/service';
import { sendTipReceipt, sendOrderConfirmation, sendPaymentFailed, sendTipRefunded, sendAdminNewOrder } from '@/lib/email';
import { onTipSucceeded } from '@/lib/email/lifecycle-events';
import { reverseTransactionTransfers, refundTransactionFull } from '@/lib/stripe/refunds';
import { createPackInvoiceForPaymentIntent } from '@/lib/stripe/pack-invoice';
import { signOnboardingToken } from '@/lib/auth/onboarding-token';
import { voidAmbassadorSaleForOrder, restoreAmbassadorSaleForOrder } from '@/lib/ambassadeur/sales';
import { COMMISSION_BY_PACK } from '@/lib/ambassador-tiers';
import { makeUniqueEstablishmentSlug } from '@/lib/establishment-slug';
import { readAccountStatus } from '@/lib/stripe/connect';
import { planForSubscriptionStatus } from '@/lib/billing/entitlements';
import { splitEqually, allocateToOne, type Allocation } from '@/lib/tips/allocation';
import { revalidateEstablishmentTipPages } from '@/lib/stripe/establishment-account';

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
      const dbServiceFee = Number(curMeta.service_fee);
      // Legacy rows (created before the 00073 fee model) carry a `platform_fee`
      // that was deducted FROM the tip. Rows created since omit the key, so the
      // fallback of 0 is what makes the recipient's share the whole tip — the
      // tipper already paid the fee on top.
      const dbDeducted = Number(curMeta.platform_fee);
      const deducted = Number.isFinite(dbDeducted) ? Math.max(0, dbDeducted) : 0;
      const netForStaff = Number.isFinite(dbTip) ? Math.max(0, dbTip - deducted) : 0;
      // What the platform keeps: the service fee the tipper paid on top, plus
      // whatever an old-model row still took out of the tip. With separate
      // charges there is no Stripe application fee object — what we keep is
      // simply what we don't transfer.
      const keptFee = Number.isFinite(dbServiceFee) ? dbServiceFee + deducted : null;

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

      // ── Attribution + one transfer to the establishment ──────────────────
      // Two separate things happen here, and keeping them apart matters:
      //
      //  1. `tip_allocations` records WHO earned the tip. Solo = the scanned
      //     staff member; group = every active colleague, split equally. These
      //     rows never move money — they are what the payroll export reads.
      //  2. A single transfer moves the WHOLE tip to the establishment's
      //     connected account. There is no per-employee transfer any more, and
      //     nothing is deducted: the tipper already paid the service fee.
      if (chargeId && netForStaff > 0) {
        const establishmentId = curTxn?.establishment_id ?? intent.metadata?.establishment_id ?? null;

        let recipients: Allocation[] = [];
        if (isGroup) {
          if (establishmentId) {
            const { data: staffMembers } = await supabase
              .from('staff_profiles')
              .select('id')
              .eq('establishment_id', establishmentId)
              .eq('is_active', true)
              .is('deleted_at', null)
              .order('id'); // deterministic remainder recipient across replays
            recipients = splitEqually(netForStaff, (staffMembers ?? []).map((m) => m.id));
          }
        } else if (curTxn?.staff_id) {
          recipients = allocateToOne(netForStaff, curTxn.staff_id);
        }

        // Idempotency: the unique (transaction_id, staff_id) index makes a
        // re-delivered OR concurrently-delivered webhook a no-op instead of
        // creating duplicate rows. ON CONFLICT DO NOTHING.
        if (recipients.length > 0) {
          await supabase.from('tip_allocations').upsert(
            recipients.map((r) => ({
              transaction_id: transactionId,
              staff_id: r.staffId,
              amount: r.amount,
              status: 'allocated',
              allocated_at: new Date().toISOString(),
            })) as never,
            { onConflict: 'transaction_id,staff_id', ignoreDuplicates: true }
          );
        } else {
          // The money still reaches the establishment below, but nobody is
          // credited for it — the payroll export would silently under-report.
          // Happens when every active staff member was removed between intent
          // creation and this webhook.
          console.error('[webhook] tip settled with no one to attribute it to', {
            transactionId,
            netForStaff,
            isGroup,
            establishmentId,
          });
        }

        // ── The transfer ────────────────────────────────────────────────────
        const { data: estab } = establishmentId
          ? await supabase
              .from('establishments')
              .select('stripe_account_id')
              .eq('id', establishmentId)
              .maybeSingle()
          : { data: null };

        if (!estab?.stripe_account_id) {
          // The tip pages refuse to charge for an unverified establishment, so
          // this means the account was detached between charge and webhook.
          // The funds sit on the platform; the reconcile cron retries.
          console.error('[webhook] tip charged but establishment has no Connect account', {
            transactionId,
            establishmentId,
          });
          await supabase
            .from('transactions')
            .update({ transfer_status: 'failed', transfer_error: 'no_connect_account' } as never)
            .eq('id', transactionId)
            .is('stripe_transfer_id', null);
        } else {
          try {
            const transfer = await stripe.transfers.create(
              {
                amount: netForStaff,
                currency: intent.currency,
                destination: estab.stripe_account_id,
                description: 'Pourboire',
                ...(transferGroup ? { transfer_group: transferGroup } : {}),
                // Caps the transfer at this charge and ties the two together,
                // so a refund can reverse it and the platform balance can never
                // be drawn on before the funds have actually settled.
                source_transaction: chargeId,
              },
              { idempotencyKey: `tip:${transactionId}` }
            );
            await supabase
              .from('transactions')
              .update({
                stripe_transfer_id: transfer.id,
                transfer_status: 'succeeded',
                transfer_error: null,
              } as never)
              .eq('id', transactionId);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'unknown';
            console.error('tip transfer create failed', { transactionId, err });
            await supabase
              .from('transactions')
              .update({ transfer_status: 'failed', transfer_error: msg } as never)
              .eq('id', transactionId)
              .is('stripe_transfer_id', null);
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

      // Nothing to freeze: employees hold no account, and Stripe carries the
      // losses on the establishment's, so the platform cannot pause its payouts
      // either. The lever we do have is withholding the transfer, which
      // reverseTransactionTransfers handles if the dispute is lost.

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
        .select('id, establishment_id, amount')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle();
      if (!txn) break;

      if (event.type === 'charge.dispute.funds_withdrawn' && txn.establishment_id) {
        await supabase.from('negative_balance_events').insert({
          establishment_id: txn.establishment_id,
          transaction_id: txn.id,
          amount_owed: dispute.amount,
          dispute_id: dispute.id,
          status: 'owed',
        } as never);
      } else if (event.type === 'charge.dispute.funds_reinstated') {
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

      // The attribution rows follow the transaction, not the transfer — they
      // carry no Stripe id of their own since 00075.
      const { data: reversedTxn } = await supabase
        .from('transactions')
        .select('id')
        .eq('stripe_transfer_id', transfer.id)
        .maybeSingle();

      if (reversedTxn) {
        await supabase
          .from('tip_allocations')
          .update({ status: 'reversed', reversed_at: now } as never)
          .eq('transaction_id', reversedTxn.id)
          .is('reversed_at', null);
      }

      break;
    }

    case 'payout.paid':
    case 'payout.failed': {
      const payout = event.data.object as Stripe.Payout;
      // Stripe sends payout events on connected accounts; the staff_id is
      // resolved via the account ID on the event.
      const accountId = (event as Stripe.Event & { account?: string }).account ?? null;
      if (!accountId) break;

      const { data: estab } = await supabase
        .from('establishments')
        .select('id')
        .eq('stripe_account_id', accountId)
        .maybeSingle();
      if (!estab) break;

      if (event.type === 'payout.paid') {
        await supabase.from('establishment_payouts').upsert({
          establishment_id: estab.id,
          stripe_payout_id: payout.id,
          amount: payout.amount,
          status: 'paid',
          paid_at: new Date().toISOString(),
        } as never, { onConflict: 'stripe_payout_id' });
      } else {
        await supabase.from('establishment_payouts').upsert({
          establishment_id: estab.id,
          stripe_payout_id: payout.id,
          amount: payout.amount,
          status: 'failed',
          failure_code: payout.failure_code,
          failure_message: payout.failure_message,
          failed_at: new Date().toISOString(),
        } as never, { onConflict: 'stripe_payout_id' });

        // A failed payout means the establishment's bank details need fixing,
        // which it does from /dashboard/paiements through the embedded account
        // management component.
        console.error('[stripe] establishment payout failed', {
          establishmentId: estab.id,
          code: payout.failure_code,
          message: payout.failure_message,
        });
      }

      break;
    }

    case 'account.application.deauthorized': {
      const accountId = (event as Stripe.Event & { account?: string }).account ?? null;
      if (!accountId) break;

      // An establishment that revoked the connection can no longer be paid.
      // Clear the capability flags rather than the account id: keeping the id
      // means a reconnection lands on the same Stripe account instead of
      // silently creating a second one.
      const { data: deauthEstab } = await supabase
        .from('establishments')
        .update({
          stripe_charges_enabled: false,
          stripe_payouts_enabled: false,
          stripe_synced_at: new Date().toISOString(),
        } as never)
        .eq('stripe_account_id', accountId)
        .select('id')
        .maybeSingle();

      if (deauthEstab) {
        await revalidateEstablishmentTipPages(supabase, deauthEstab.id);
        break;
      }

      break;
    }

    case 'account.updated': {
      const account = event.data.object as Stripe.Account;

      // ── Establishment account ────────────────────────────────────────────
      // Mirror the capability flags onto the row and refresh every tip page in
      // the establishment: payability is now an establishment-level property,
      // so one account.updated flips the whole team at once.
      const { data: estabRow } = await supabase
        .from('establishments')
        .select('id')
        .eq('stripe_account_id', account.id)
        .maybeSingle();

      if (estabRow) {
        const status = readAccountStatus(account);
        await supabase
          .from('establishments')
          .update({
            stripe_details_submitted: status.detailsSubmitted,
            stripe_charges_enabled: status.chargesEnabled,
            stripe_payouts_enabled: status.payoutsEnabled,
            stripe_requirements: status.requirements as never,
            stripe_synced_at: new Date().toISOString(),
          } as never)
          .eq('id', estabRow.id);

        await revalidateEstablishmentTipPages(supabase, estabRow.id);
      }

      // No staff branch: employees no longer hold a connected account, so any
      // other account.updated on this endpoint belongs to an ambassador or a
      // commercial, whose status is read on demand rather than mirrored here.
      break;
    }

    // ============================================================
    // SmartTag pack orders (one-shot hardware purchase, mode=payment)
    // ============================================================
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;

      // Digitip Pro. The subscription's own events do the real work; this
      // branch just links the subscription to the group immediately, so the
      // dashboard reflects the purchase on the redirect back rather than
      // whenever customer.subscription.created happens to land.
      if (session.mode === 'subscription') {
        const groupId = session.metadata?.group_id;
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : (session.subscription as Stripe.Subscription | null)?.id ?? null;
        if (groupId && subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await syncSubscription(sub, supabase, groupId);
        }
        break;
      }

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
          // Provisional. The webhook fires before the buyer has told us anything
// about their trade; the onboarding wizard asks and overwrites this.
// The column is NOT NULL with no default, so a value is required here.
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
          } catch (err) { console.error('[webhook] increment_promo_redeemed failed', { promoCodeId, err }); }
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
          // Provisional. The webhook fires before the buyer has told us anything
// about their trade; the onboarding wizard asks and overwrites this.
// The column is NOT NULL with no default, so a value is required here.
business_type: 'beauty',
          slug,
          country,
          currency: 'eur',
          onboarding_status: 'not_started',
        });
      }

      break;
    }

    // ============================================================
    // Digitip Pro subscription
    // ============================================================
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscription(sub, supabase);
      break;
    }

    // Billing outcomes only move the plan through the subscription's status,
    // which Stripe updates and delivers as customer.subscription.updated. These
    // stay handled so a failed renewal is greppable in webhook_events rather
    // than landing in the `default` bucket.
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      break;
    }

    default:
      // Unknown event types are logged but not errored
      break;
  }
}

// ─── Digitip Pro subscription ────────────────────────────────────────────────

/**
 * Mirrors a Stripe subscription onto its group.
 *
 * The plan is derived from the subscription status rather than from which event
 * fired, so an out-of-order delivery — Stripe makes no ordering guarantee —
 * still lands on the right answer instead of, say, a `deleted` arriving after a
 * re-subscription and downgrading a paying customer.
 */
async function syncSubscription(
  sub: Stripe.Subscription,
  supabase: ReturnType<typeof createServiceClient>,
  knownGroupId?: string,
): Promise<void> {
  let groupId: string | null = knownGroupId ?? sub.metadata?.group_id ?? null;

  if (!groupId) {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;
    if (!customerId) return;
    const { data: group } = await supabase
      .from('groups')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .is('deleted_at', null)
      .maybeSingle();
    groupId = group?.id ?? null;
  }
  if (!groupId) {
    // Not ours. This Stripe account also bills other products, so their
    // subscription events land on this endpoint too — a customer that matches
    // no Digitip group is the normal case for those, not an error worth
    // paging on. Only a subscription that claims to be ours and still fails to
    // resolve is a genuine problem.
    if (sub.metadata?.group_id) {
      console.error('[stripe] Digitip subscription with an unknown group', {
        subscription: sub.id,
        groupId: sub.metadata.group_id,
      });
    }
    return;
  }

  const plan = planForSubscriptionStatus(sub.status);
  const item = sub.items?.data?.[0];
  const periodEnd = item?.current_period_end ?? null;

  await supabase
    .from('groups')
    .update({
      plan,
      stripe_subscription_id: sub.id,
      subscription_status: sub.status,
      subscription_current_period_end: periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : null,
      trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    } as never)
    .eq('id', groupId);
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
      } catch (err) { console.error('[webhook] increment_promo_redeemed failed', { promoCodeId, err }); }
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
    // Provisional. The webhook fires before the buyer has told us anything
// about their trade; the onboarding wizard asks and overwrites this.
// The column is NOT NULL with no default, so a value is required here.
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
    } catch (err) { console.error('[webhook] increment_promo_redeemed failed', { promoCodeId, err }); }
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
      // Provisional. The webhook fires before the buyer has told us anything
// about their trade; the onboarding wizard asks and overwrites this.
// The column is NOT NULL with no default, so a value is required here.
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
