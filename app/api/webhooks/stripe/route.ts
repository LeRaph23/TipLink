import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { createServiceClient } from '@/lib/supabase/service';
import { sendTipReceipt, sendOrderConfirmation, sendPaymentFailed, sendTipRefunded, sendAdminNewOrder } from '@/lib/email';

// MUST be nodejs: stripe.webhooks.constructEvent() uses Node.js crypto module
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
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

      const transactionId = intent.metadata?.transaction_id;

      if (!transactionId) {
        throw new Error(`Missing transaction_id in payment_intent metadata: ${intent.id}`);
      }

      // Defensive: only flip to succeeded if Stripe confirms the PI is fully paid.
      if (intent.status !== 'succeeded') break;

      await supabase
        .from('transactions')
        .update({
          status: 'succeeded',
          stripe_payment_intent_id: intent.id,
        })
        .eq('id', transactionId)
        .eq('status', 'pending');

      // For group tips: create Stripe transfers to each payable staff member equally
      if (intent.metadata?.group_tip === 'true') {
        const netForStaff = parseInt(intent.metadata.net_for_staff ?? '0', 10);
        const transferGroup = intent.metadata.transfer_group;
        const establishmentId = intent.metadata.establishment_id;
        const chargeId = typeof intent.latest_charge === 'string'
          ? intent.latest_charge
          : (intent.latest_charge as Stripe.Charge | null)?.id;

        if (netForStaff > 0 && transferGroup && establishmentId && chargeId) {
          const { data: staffMembers } = await supabase
            .from('staff_profiles')
            .select('id, stripe_account_id')
            .eq('establishment_id', establishmentId)
            .eq('is_active', true)
            .eq('onboarding_status', 'complete')
            .is('deleted_at', null)
            .not('stripe_account_id', 'is', null);

          if (staffMembers && staffMembers.length > 0) {
            const shareAmount = Math.floor(netForStaff / staffMembers.length);
            await Promise.allSettled(
              staffMembers.map((s) =>
                stripe.transfers.create({
                  amount: shareAmount,
                  currency: intent.currency,
                  destination: s.stripe_account_id!,
                  transfer_group: transferGroup,
                  source_transaction: chargeId,
                })
              )
            );
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
          }).catch(() => {}); // email failure must never break the webhook
        }
      }

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

      await supabase
        .from('transactions')
        .update({ status: 'refunded' })
        .eq('stripe_payment_intent_id', paymentIntentId)
        .eq('status', 'succeeded');

      const customerEmail = charge.receipt_email ?? charge.billing_details.email;
      if (customerEmail) {
        const { data: txn } = await supabase
          .from('transactions')
          .select('amount, currency, staff_profiles(full_name, establishments(name))')
          .eq('stripe_payment_intent_id', paymentIntentId)
          .single();

        if (txn) {
          const staff = txn.staff_profiles as { full_name: string; establishments: { name: string } | null } | null;
          await sendTipRefunded({
            to: customerEmail,
            amount: charge.amount_refunded,
            currency: charge.currency,
            staffName: staff?.full_name ?? undefined,
            establishmentName: staff?.establishments?.name ?? undefined,
          }).catch(() => {});
        }
      }

      break;
    }

    case 'account.updated': {
      const account = event.data.object as Stripe.Account;
      if (account.details_submitted && account.charges_enabled) {
        await supabase
          .from('staff_profiles')
          .update({ onboarding_status: 'complete' })
          .eq('stripe_account_id', account.id);
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

      const groupId = session.metadata?.group_id;
      const rawPack = session.metadata?.pack;
      const pack = (['solo', 'duo'] as const).find((p) => p === rawPack);

      // ── Express checkout (landing page guest flow) ──────────────────────────
      if (!groupId && session.metadata?.source === 'express' && pack) {
        const email = session.customer_details?.email;
        const legalName = session.customer_details?.name ?? email ?? 'Unknown';
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
            settings: { tip_thresholds: [1, 2, 5, 10] },
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
        const expressSlug = legalName.toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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
        // The group UUID is cryptographically random — safe to include in the URL.
        if (email && newOrder) {
          const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? '';
          const setupUrl = `${base}/${expressLocale}/onboarding?group=${newGroup.id}&email=${encodeURIComponent(email)}`;
          await sendOrderConfirmation({
            to: email,
            pack,
            quantity,
            orderId: newOrder.id,
            invoicePdfUrl,
            setupUrl,
            locale: expressLocale,
          }).catch(() => {});

          await sendAdminNewOrder({
            customerName: legalName,
            customerEmail: email,
            pack,
            quantity,
            orderId: newOrder.id,
            promoCode: expressPromoCode,
            locale: expressLocale,
          }).catch(() => {});
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
        const slug = estName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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

  const shipping = intent.shipping ?? null;

  // Prefer receipt_email (set via confirmParams.receipt_email on confirm).
  // Fallback to billing_details on the latest charge — Link populates this even
  // when the user never typed an email into our form, so we retrieve the charge
  // when the event payload only carries the id.
  let email: string | null = intent.receipt_email ?? null;
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

  const legalName = shipping?.name ?? email ?? 'Unknown';
  const quantity =
    Number(intent.metadata?.quantity ?? 0) || (pack === 'solo' ? 1 : 2);
  const promoCodeStr = intent.metadata?.promo_code ?? null;
  const promoCodeId = intent.metadata?.promo_code_id ?? null;
  const discountAmount = Number(intent.metadata?.discount_amount ?? 0) || 0;
  const locale = intent.metadata?.locale === 'fr' ? 'fr' : 'en';

  const customerId = typeof intent.customer === 'string'
    ? intent.customer
    : (intent.customer as Stripe.Customer | null)?.id ?? null;

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
      settings: { tip_thresholds: [1, 2, 5, 10] },
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
  const slug = legalName
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const country = (shipping?.address?.country ?? 'FR').toUpperCase();

  await supabase.from('establishments').insert({
    group_id: newGroup.id,
    name: legalName,
    business_type: 'beauty',
    slug: slug || `group-${newGroup.id.slice(0, 8)}`,
    country,
    currency: 'eur',
    onboarding_status: 'not_started',
  });

  // Send customer confirmation + setup link
  if (email && newOrder) {
    const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? '';
    const setupUrl = `${base}/${locale}/onboarding?group=${newGroup.id}&email=${encodeURIComponent(email)}`;
    await sendOrderConfirmation({
      to: email,
      pack,
      quantity,
      orderId: newOrder.id,
      invoicePdfUrl: null,
      setupUrl,
      locale,
    }).catch(() => {});

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

    const commissionAmount = pack === 'duo' ? 3500 : 2500;
    const trimmed = rawSalonName.trim();
    const salonPartial = trimmed.length >= 3 ? `***${trimmed.slice(-3)}` : '***';

    await supabase.from('ambassador_sales').insert({
      ambassador_id: ambassador.id,
      smarttag_order_id: orderId,
      pack,
      commission_amount: commissionAmount,
      salon_name_partial: salonPartial,
    });

    void notifyTelegram(ambassador.name, salonPartial, pack).catch(() => {});

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

async function notifyTelegram(ambassadorName: string, salon: string, pack: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const packLabel = pack === 'duo' ? 'Pack Duo (+35€)' : 'Pack Solo (+25€)';
  const text = `🔥 BOOM ! ${ambassadorName} vient de vendre un ${packLabel} à ${salon} !`;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
