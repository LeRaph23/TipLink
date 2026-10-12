'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { loadStripe, type Stripe, type StripeElementsOptions } from '@stripe/stripe-js';
import {
  AddressElement,
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import type { BuyerGroup } from '@/lib/billing/buyer-group';
import { trackPixel } from '@/lib/meta/pixel';
import { SHIPPING_COUNTRIES, isShippingCountry, type ShippingCountry } from '@/lib/billing/shipping-countries';
import { CheckoutFooter, CheckoutShell, OrderSummary, SC, type Pack, type SummaryProduct } from './OrderSummary';

/** The signed-in buyer: their email, and their business when they own one. */
export type CheckoutAccount = {
  email: string;
  name: string | null;
  shipping: BuyerGroup['shipping'];
};

interface Props {
  pack: Pack;
  locale: string;
  account?: CheckoutAccount | null;
  product: SummaryProduct;
  /** Country from the visitor's IP, if known. */
  ipCountry?: string | null;
}

const ALLOWED_SHIPPING_COUNTRIES = [...SHIPPING_COUNTRIES];

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!stripePromise) {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = pk ? loadStripe(pk) : Promise.resolve(null);
  }
  return stripePromise;
}

type IntentData = {
  clientSecret: string;
  amount: number;
  baseAmount: number;
  discountAmount: number;
  promoCode: string | null;
};

type CachedIntent = { key: string; data: IntentData } | { key: string; error: string };

// VAT breakdown returned by /api/billing/pack-tax (all cents).
type Tax = { ht: number; tax: number; total: number; ratePct: number | null; country: string };

export function PackCheckout({ pack, locale, account = null, product, ipCountry = null }: Props) {
  const t = useTranslations('checkout');
  const [reloadKey, setReloadKey] = useState(0);
  const [cached, setCached] = useState<CachedIntent | null>(null);

  // Promo codes are applied to this same intent later (/api/billing/pack-promo),
  // so only the pack, the locale and an explicit retry create a new one.
  const requestKey = `${pack}|${locale}|${reloadKey}`;

  useEffect(() => {
    const ac = new AbortController();
    fetch('/api/billing/create-pack-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pack, locale }),
      signal: ac.signal,
    })
      .then(async (res) => {
        // Defensive parse: a 5xx with an empty/non-JSON body must not throw
        // "Unexpected end of JSON input" — surface a clean, retryable error.
        const data = (await res.json().catch(() => null)) as
          | { clientSecret?: string; amount?: number; baseAmount?: number; discountAmount?: number; promoCode?: string; error?: string }
          | null;
        if (ac.signal.aborted) return;
        if (!res.ok || !data || !data.clientSecret) {
          setCached({
            key: requestKey,
            error: data?.error === 'payment_unavailable'
              ? t('errPaymentUnavailable')
              : t('errPaymentInit'),
          });
          return;
        }
        setCached({
          key: requestKey,
          data: {
            clientSecret: data.clientSecret,
            amount: data.amount ?? 0,
            baseAmount: data.baseAmount ?? 0,
            discountAmount: data.discountAmount ?? 0,
            promoCode: data.promoCode ?? null,
          },
        });
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        const msg = e instanceof Error ? e.message : 'Network error';
        setCached({ key: requestKey, error: msg });
      });
    return () => ac.abort();
    // `t` is referenced only to build the two error strings and is left out
    // deliberately: this effect creates a PaymentIntent, so an extra run costs
    // a real Stripe call. requestKey already covers everything that should
    // trigger a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack, locale, requestKey]);

  // Treat any cached result for a stale key as "still loading".
  const isCurrent = cached?.key === requestKey;
  if (!isCurrent) {
    return (
      <CheckoutShell
        summary={<OrderSummary product={product} locale={locale} taxLoading />}
        form={<CheckoutSkeleton />}
        footer={<CheckoutFooter />}
      />
    );
  }

  if ('error' in cached) {
    return (
      <CheckoutShell summary={<OrderSummary product={product} locale={locale} />} footer={<CheckoutFooter />} form={
      <div style={{ fontSize: 14, color: '#df1b41' }}>
        {cached.error}
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          style={{
            display: 'block', marginTop: 12, padding: '8px 12px', borderRadius: 6,
            background: SC.fill, border: 'none', color: SC.text,
            fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {t('retry')}
        </button>
      </div>
      } />
    );
  }

  const { data } = cached;
  const options: StripeElementsOptions = {
    clientSecret: data.clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: SC.brand,
        colorText: '#1a1a1a',
        borderRadius: '6px',
        fontFamily: SC.font,
      },
    },
  };

  return (
    <Elements stripe={getStripe()} options={options} key={data.clientSecret}>
      <InnerCheckout
        pack={pack}
        locale={locale}
        amount={data.amount}
        baseAmount={data.baseAmount}
        discountAmount={data.discountAmount}
        promoCode={data.promoCode}
        clientSecret={data.clientSecret}
        account={account}
        product={product}
        defaultCountry={defaultCountry(account, ipCountry)}
      />
    </Elements>
  );
}

interface InnerProps {
  pack: Pack;
  locale: string;
  amount: number;
  baseAmount: number;
  discountAmount: number;
  promoCode: string | null;
  clientSecret: string;
  account: CheckoutAccount | null;
  product: SummaryProduct;
  defaultCountry: ShippingCountry;
}

// The country the form opens on, and that VAT is first priced for: the
// account's last delivery address, else the visitor's location, else France.
// Switzerland is never picked from the IP: near the border (Mulhouse, Basel)
// the IP says CH for French buyers, who then typed a French address under
// "Suisse" and were charged an export price with no VAT. A Swiss buyer picks
// it in the address form, and the VAT follows.
function defaultCountry(account: CheckoutAccount | null, ipCountry: string | null): ShippingCountry {
  const pick = (c: string | null | undefined) => {
    const up = c?.toUpperCase();
    return isShippingCountry(up) ? up : undefined;
  };
  const fromIp = pick(ipCountry);
  return pick(account?.shipping?.country) ?? (fromIp && fromIp !== 'CH' ? fromIp : 'FR');
}

function InnerCheckout({
  pack,
  locale,
  amount: initialAmount,
  baseAmount,
  discountAmount: initialDiscount,
  promoCode: initialPromo,
  clientSecret,
  account,
  product,
  defaultCountry: initialCountry,
}: InnerProps) {
  const t = useTranslations('checkout');
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  // One AddPaymentInfo per checkout, however many times a declined card is retried.
  const paymentInfoSent = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState(account?.email ?? '');
  const [promoInput, setPromoInput] = useState(initialPromo ?? '');
  // Applying a code updates the intent this form already holds (see
  // /api/billing/pack-promo): the form, and everything typed in it, stays.
  const [promo, setPromo] = useState({ code: initialPromo, discount: initialDiscount, amount: initialAmount });
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoOpen, setPromoOpen] = useState(!!initialPromo);
  const promoCode = promo.code;
  const discountAmount = promo.discount;
  const amount = promo.amount;

  // Pack prices are stored excl. VAT (HT). VAT is resolved server-side from
  // the shipping country (Stripe Tax) and the PaymentIntent amount is updated
  // to HT + VAT before the customer can pay.
  const [tax, setTax] = useState<Tax | null>(null);
  const [taxLoading, setTaxLoading] = useState(false);
  const taxKeyRef = useRef<string>('');

  // What the summary shows until the full address is priced: the rate Stripe
  // Tax gives the delivery country (the visitor's, then whatever the address
  // form says), from a per-country cache (/api/billing/vat-rate). Changing
  // the country refreshes it at once; it never sets what is charged.
  const [previewCountry, setPreviewCountry] = useState<string>(initialCountry);
  const [preview, setPreview] = useState<{ country: string; ratePct: number } | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/billing/vat-rate?country=${encodeURIComponent(previewCountry)}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { country?: string; ratePercent?: number | null } | null) => {
        if (ac.signal.aborted) return;
        setPreview(d?.country && d.ratePercent != null ? { country: d.country, ratePct: d.ratePercent } : null);
      })
      .catch(() => { if (!ac.signal.aborted) setPreview(null); });
    return () => ac.abort();
  }, [previewCountry]);

  // Calls /api/billing/pack-tax, which recomputes VAT and updates the PI amount.
  const fetchTax = useCallback(
    async (country: string, postalCode?: string | null): Promise<Tax> => {
      const res = await fetch('/api/billing/pack-tax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientSecret, country, postalCode: postalCode ?? undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'pack tax lookup failed');
      return { ht: d.htAmount, tax: d.taxAmount, total: d.totalAmount, ratePct: d.taxRatePercent, country: country.toUpperCase() };
    },
    [clientSecret]
  );

  // Card flow. Any change of country updates the preview straight away; the
  // billed Stripe Tax calculation (which also sets the intent's amount) runs
  // only once the address is complete, then again if its country or postcode
  // changes. It used to run on every keystroke of the postcode.
  type AddressChange = {
    complete: boolean;
    value: { address: { country?: string; postal_code?: string } };
  };
  // The billed Stripe Tax calculation for a complete address; also sets the
  // intent's amount (see /api/billing/pack-tax).
  const priceAddress = useCallback(
    (country: string, postalCode?: string) => {
      const key = `${country}|${postalCode ?? ''}`;
      if (key === taxKeyRef.current) return;
      taxKeyRef.current = key;
      setTaxLoading(true);
      setError(null);
      fetchTax(country, postalCode)
        .then(setTax)
        .catch((err: unknown) => {
          // Swallowed before. With `canPay = !!tax`, a failed VAT lookup left
          // the pay button disabled under its "enter your shipping
          // address" — telling a buyer who had just filled in a complete
          // address to fill it in, with no error and no way to retry. Clearing
          // taxKeyRef alone was not a recovery: the address had not changed,
          // so nothing would fetch again.
          console.error('[checkout] VAT lookup failed', err);
          taxKeyRef.current = '';
          setTax(null);
          setError(t('errTaxAddress'));
        })
        .finally(() => setTaxLoading(false));
    },
    // `t` omitted for the same reason as the intent effect above: it is only
    // read to format an error, and a new identity here would re-run the VAT
    // lookup on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchTax]
  );

  const onAddressChange = useCallback(
    (event: AddressChange) => {
      const addr = event.value?.address;
      if (!addr?.country) return;
      const country = addr.country.toUpperCase();
      setPreviewCountry(country);
      // A figure priced for another country no longer describes this order.
      setTax((prev) => {
        if (prev && prev.country !== country) {
          taxKeyRef.current = '';
          return null;
        }
        return prev;
      });
      if (event.complete) priceAddress(country, addr.postal_code);
    },
    [priceAddress]
  );

  // A prefilled address is priced straight away rather than waiting for the
  // buyer to touch it (the key check makes a later change event a no-op).
  const prefilledCountry = account?.shipping?.country;
  const prefilledPostal = account?.shipping?.postal_code;
  useEffect(() => {
    if (prefilledCountry) {
      priceAddress(prefilledCountry.toUpperCase(), prefilledPostal);
    }
  }, [prefilledCountry, prefilledPostal, priceAddress]);

  // Wallet flow (Apple/Google Pay) — recompute when the customer picks an
  // address in the payment sheet, and feed the updated lines back to Stripe.
  type ShippingChange = {
    address: { country?: string; postal_code?: string; postalCode?: string };
    resolve: (d?: { lineItems?: Array<{ name: string; amount: number }> }) => void;
    reject: () => void;
  };
  const onShippingAddressChange = useCallback(
    async (event: ShippingChange) => {
      try {
        const country = event.address?.country ?? '';
        const postal = event.address?.postal_code ?? event.address?.postalCode ?? null;
        if (!country) { event.reject(); return; }
        const t = await fetchTax(country, postal);
        setTax(t);
        taxKeyRef.current = `${country}|${postal ?? ''}`;
        event.resolve({
          lineItems: [
            { name: pack === 'duo' ? 'Pack Duo (HT)' : 'Pack Solo (HT)', amount: t.ht },
            { name: `TVA${t.ratePct != null ? ` (${t.ratePct}%)` : ''}`, amount: t.tax },
          ],
        });
      } catch {
        event.reject();
      }
    },
    [fetchTax, pack]
  );

  type ExpressConfirmEvent = {
    billingDetails?: { email?: string | null; name?: string | null } | null;
    shippingAddress?: {
      name?: string | null;
      address?: { line1?: string | null; line2?: string | null; city?: string | null; postal_code?: string | null; state?: string | null; country?: string | null } | null;
    } | null;
  };

  // We deliberately DO NOT pass receipt_email to confirmPayment — that would
  // trigger Stripe's own branded receipt email, duplicating the Digitip one.
  // The webhook reads metadata.customer_email (set via attach-pi-email).
  async function handleConfirm(event?: ExpressConfirmEvent) {
    if (!stripe || !elements) return;
    const expressEmail = event?.billingDetails?.email ?? null;
    // Signed in, the order is the account's whatever the wallet holds.
    const finalEmail = (account?.email ?? expressEmail ?? email).trim();
    if (!finalEmail) {
      setError(t('errEmailRequired'));
      return;
    }
    if (!tax) {
      setError(t('errAddressRequired'));
      return;
    }
    setError(null);
    setIsLoading(true);
    if (!paymentInfoSent.current) {
      paymentInfoSent.current = true;
      trackPixel('AddPaymentInfo', {
        content_ids: [pack],
        content_type: 'product',
        value: tax.total / 100,
        currency: 'EUR',
      });
    }
    try {
      await fetch('/api/billing/attach-pi-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientSecret, email: finalEmail }),
      }).catch(() => {});

      const shipping = event?.shippingAddress?.address
        ? {
            name: (event.shippingAddress.name ?? '').trim() || finalEmail,
            address: {
              line1: event.shippingAddress.address.line1 ?? '',
              line2: event.shippingAddress.address.line2 ?? undefined,
              city: event.shippingAddress.address.city ?? '',
              postal_code: event.shippingAddress.address.postal_code ?? '',
              state: event.shippingAddress.address.state ?? undefined,
              country: event.shippingAddress.address.country ?? '',
            },
          }
        : undefined;
      const { error: confirmErr } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/${locale}/order/success`,
          ...(shipping ? { shipping } : {}),
        },
      });
      if (confirmErr) {
        setError(confirmErr.message ?? t('errPaymentFailed'));
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApplyPromo() {
    const v = promoInput.trim().toUpperCase();
    setPromoError(null);
    setPromoBusy(true);
    try {
      const res = await fetch('/api/billing/pack-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientSecret, promoCode: v || undefined }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d) {
        setPromoError(
          res.status === 400 && d?.error === 'Invalid promo code'
            ? t('errPromoInvalid')
            : t('errPromoApply'),
        );
        return;
      }
      setPromo({ code: d.promoCode ?? null, discount: d.discountAmount ?? 0, amount: d.totalAmount ?? amount });
      // Once the address has been priced, the totals shown come from `tax`.
      if (tax) setTax({ ht: d.htAmount, tax: d.taxAmount, total: d.totalAmount, ratePct: d.taxRatePercent ?? tax.ratePct, country: tax.country });
      // Wallet sheets (Apple Pay, Google Pay) show the intent's amount.
      await elements?.fetchUpdates().catch(() => {});
    } finally {
      setPromoBusy(false);
    }
  }

  const isPromoApplied = !!promoCode && promoCode === promoInput.trim().toUpperCase();
  const canPay = !!tax && !taxLoading;
  const payDisabled = !stripe || !elements || isLoading || !canPay;

  const field: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 6,
    border: '1px solid #e0e0e0', fontSize: 16, color: '#1a1a1a',
    background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
    boxShadow: '0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(0,0,0,0.02)',
  };
  const heading: React.CSSProperties = { fontSize: 16, fontWeight: 500, margin: '0 0 12px' };

  const promoSlot = promoOpen ? (
    <div>
      <div style={{ position: 'relative' }}>
        <input
          value={promoInput}
          autoFocus={!initialPromo}
          onChange={(e) => setPromoInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleApplyPromo(); } }}
          placeholder={t('promoPlaceholder')}
          aria-label={t('promoLabel')}
          style={{ ...field, fontSize: 14, paddingRight: 90, textTransform: 'uppercase' }}
        />
        <button
          type="button"
          onClick={() => { void handleApplyPromo(); }}
          disabled={isLoading || promoBusy || isPromoApplied || !promoInput.trim()}
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            padding: '4px 8px', border: 'none', background: 'none', fontFamily: 'inherit',
            fontSize: 14, fontWeight: 500, color: SC.brand, cursor: 'pointer',
            opacity: isLoading || promoBusy || isPromoApplied || !promoInput.trim() ? 0.5 : 1,
          }}
        >
          {isPromoApplied ? t('promoApplied') : t('promoApply')}
        </button>
      </div>
      {promoError && <p style={{ margin: '6px 0 0', fontSize: 13, color: '#df1b41' }}>{promoError}</p>}
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setPromoOpen(true)}
      style={{
        padding: '8px 12px', borderRadius: 6, border: 'none', background: SC.fill,
        color: SC.text, fontSize: 14, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
      }}
    >
      {t('promoAdd')}
    </button>
  );

  const form = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Express checkout (Apple/Google Pay/Link) */}
      <div>
        <ExpressCheckoutElement
          onConfirm={handleConfirm}
          onShippingAddressChange={onShippingAddressChange}
          options={{
            buttonHeight: 44,
            buttonType: { applePay: 'buy', googlePay: 'buy' },
            buttonTheme: { applePay: 'black', googlePay: 'black' },
            layout: { maxColumns: 1, maxRows: 2 },
            emailRequired: true,
            shippingAddressRequired: true,
            allowedShippingCountries: [...ALLOWED_SHIPPING_COUNTRIES],
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}>
          <div style={{ flex: 1, height: 1, background: SC.line }} />
          <span style={{ fontSize: 14, color: SC.text2 }}>{t('orPayByCard')}</span>
          <div style={{ flex: 1, height: 1, background: SC.line }} />
        </div>
      </div>

      {/* Contact email — signed in, the account's own */}
      <section>
        <h2 style={heading}>{t('contactHeading')}</h2>
        {account ? (
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>
            {account.name && <div style={{ fontWeight: 500 }}>{account.name}</div>}
            <div style={{ color: SC.text2 }}>{t('accountEmail', { email: account.email })}</div>
            {account.name && <div style={{ color: SC.text2 }}>{t('accountOrder')}</div>}
          </div>
        ) : (
          <>
            <label htmlFor="checkout-email" style={{ display: 'block', fontSize: 13, fontWeight: 500, color: SC.text2, marginBottom: 4 }}>
              {t('emailLabel')}
            </label>
            <input
              id="checkout-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              required
              style={field}
            />
          </>
        )}
      </section>

      {/* Shipping address — drives the VAT calculation */}
      <section>
        <h2 style={heading}>{t('shippingLabel')}</h2>
        <AddressElement
          options={{
            mode: 'shipping',
            allowedCountries: ALLOWED_SHIPPING_COUNTRIES,
            // Never left to Stripe's own IP guess: see defaultCountry.
            // A returning customer gets the address of their last order.
            defaultValues: account?.shipping
              ? {
                  name: account.shipping.name ?? account.name ?? '',
                  address: {
                    line1: account.shipping.line1,
                    line2: account.shipping.line2 ?? undefined,
                    city: account.shipping.city,
                    postal_code: account.shipping.postal_code,
                    country: account.shipping.country,
                  },
                }
              : { address: { country: initialCountry } },
            fields: { phone: 'always' },
            validation: { phone: { required: 'auto' } },
          }}
          onChange={onAddressChange}
        />
      </section>

      {/* Payment element */}
      <section>
        <h2 style={heading}>{t('paymentLabel')}</h2>
        <PaymentElement options={{ layout: { type: 'accordion', defaultCollapsed: false, radios: 'always', spacedAccordionItems: false } }} />
      </section>

      <div>
        {error && (
          <p role="alert" style={{ margin: '0 0 12px', fontSize: 14, color: '#df1b41' }}>{error}</p>
        )}
        <button
          type="button"
          onClick={() => { void handleConfirm(); }}
          disabled={payDisabled}
          style={{
            width: '100%', height: 44, borderRadius: 6, border: 'none',
            background: SC.brand, color: '#fff', fontFamily: 'inherit',
            fontSize: 16, fontWeight: 600,
            // Processing keeps the full colour; only a button that cannot be
            // pressed yet fades (UI/UX audit, UX-03, UX-20).
            opacity: payDisabled && !isLoading ? 0.5 : 1,
            cursor: isLoading ? 'progress' : payDisabled ? 'not-allowed' : 'pointer',
            boxShadow: 'inset 0 0 0 1px rgba(50,50,93,0.1), 0 2px 5px 0 rgba(50,50,93,0.1), 0 1px 1px 0 rgba(0,0,0,0.07)',
          }}
        >
          {isLoading
            ? t('btnProcessing')
            : taxLoading
              ? t('btnCalculatingVat')
              : tax
                ? t('btnPay')
                : t('btnNeedAddress')}
        </button>
        <p style={{ fontSize: 12, color: SC.text2, textAlign: 'center', lineHeight: 1.5, margin: '12px 0 0' }}>
          {t('legal')}
        </p>
      </div>
    </div>
  );

  return (
    <CheckoutShell
      summary={
        <OrderSummary
          // The server's figure, so the subtotal matches what the intent holds.
          product={baseAmount ? { ...product, unitAmount: baseAmount } : product}
          locale={locale}
          discount={discountAmount}
          promoCode={promoCode}
          tax={tax}
          preview={preview}
          taxLoading={taxLoading}
          promoSlot={promoSlot}
        />
      }
      form={form}
      footer={<CheckoutFooter />}
    />
  );
}

export function CheckoutSkeleton() {
  const block: React.CSSProperties = {
    background: 'linear-gradient(90deg, #f1f1f4 0%, #e8e8ed 50%, #f1f1f4 100%)',
    backgroundSize: '200% 100%',
    animation: 'packSweep 1.4s ease-in-out infinite',
    borderRadius: 6,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`@keyframes packSweep { 0% {background-position: 200% 0;} 100% {background-position: -200% 0;} }`}</style>
      <div style={{ ...block, height: 48 }} />
      <div style={{ ...block, height: 56 }} />
      <div style={{ ...block, height: 120 }} />
      <div style={{ ...block, height: 180 }} />
      <div style={{ ...block, height: 56 }} />
    </div>
  );
}
