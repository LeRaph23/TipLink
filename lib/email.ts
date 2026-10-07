import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = 'Digitip <noreply@digitip.app>';
const FROM_AMBASSADOR = process.env.RESEND_FROM_AMBASSADOR_OUTREACH ?? 'Digitip <ambassadeur@digitip.app>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://digitip.app';

// ─── Shared helpers ───────────────────────────────────────────────────────────
//
// Emails default to a LIGHT palette (inline styles) and switch to the brand
// dark palette via `@media (prefers-color-scheme: dark)` plus Outlook.com's
// `[data-ogsc]` dark-mode attribute. `!important` is required so the media
// query overrides the inline defaults in supporting clients (Apple Mail,
// iOS Mail, Gmail mobile/web, Outlook iOS/Android/web).

const DARK_OVERRIDES = `
  .email-body{background:#0a0a0d!important;color:#f2f2f5!important}
  .card{background:#17171d!important;border-color:#2e2e38!important}
  .divider{border-color:#232329!important}
  .divider-strong{border-color:#2e2e38!important}
  .panel{background:#1f1f27!important;border-color:#2e2e38!important}
  .panel-row{border-color:#232329!important}
  .panel-label{color:#5a5a6a!important}
  .panel-value{color:#9898a8!important}
  .text-primary{color:#f2f2f5!important}
  .text-secondary{color:#9898a8!important}
  .text-muted{color:#5a5a6a!important}
  .text-body{color:#e2e2ea!important}
  .text-strong{color:#f2f2f5!important}
  .highlight{background:#2b1b22!important;border-color:#57313d!important}
  .neutral-btn{background:#ffffff!important;color:#000000!important}
  .outline-btn{background:#1f1f27!important;color:#f2f2f5!important;border-color:#2e2e38!important}
`;

const THEME_STYLE = `
  :root{color-scheme:light dark;supported-color-schemes:light dark}
  body{margin:0;padding:0}
  a{color:#E57A97}
  @media (prefers-color-scheme: dark){${DARK_OVERRIDES}}
  [data-ogsc] .email-body{background:#0a0a0d!important;color:#f2f2f5!important}
  [data-ogsc] .card{background:#17171d!important;border-color:#2e2e38!important}
  [data-ogsc] .divider{border-color:#232329!important}
  [data-ogsc] .divider-strong{border-color:#2e2e38!important}
  [data-ogsc] .panel{background:#1f1f27!important;border-color:#2e2e38!important}
  [data-ogsc] .panel-row{border-color:#232329!important}
  [data-ogsc] .panel-label{color:#5a5a6a!important}
  [data-ogsc] .panel-value{color:#9898a8!important}
  [data-ogsc] .text-primary{color:#f2f2f5!important}
  [data-ogsc] .text-secondary{color:#9898a8!important}
  [data-ogsc] .text-muted{color:#5a5a6a!important}
  [data-ogsc] .text-body{color:#e2e2ea!important}
  [data-ogsc] .text-strong{color:#f2f2f5!important}
  [data-ogsc] .highlight{background:#2b1b22!important;border-color:#57313d!important}
  [data-ogsc] .neutral-btn{background:#ffffff!important;color:#000000!important}
  [data-ogsc] .outline-btn{background:#1f1f27!important;color:#f2f2f5!important;border-color:#2e2e38!important}
`;

function themedLayout(content: string, locale: string = 'fr') {
  const footer = locale === 'fr' ? '© Digitip · Le pourboire sans contact' : '© Digitip · Cashless tips';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style>${THEME_STYLE}</style>
</head>
<body class="email-body" style="margin:0;padding:0;background:#f6f7f9;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f0f12">
  <table width="100%" cellpadding="0" cellspacing="0" class="card" style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden">
    ${content}
    <tr><td class="divider-strong" style="padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center">
      <span class="text-muted" style="font-size:11px;color:#9898a8">${footer}</span>
    </td></tr>
  </table>
</body>
</html>`;
}

function infoRow(label: string, value: string) {
  return `<tr class="panel-row" style="border-bottom:1px solid #f1f2f4">
    <td class="panel-label" style="padding:12px 16px;font-size:12px;color:#9898a8">${label}</td>
    <td class="panel-value" style="padding:12px 16px;font-size:12px;color:#5a5a6a;text-align:right">${value}</td>
  </tr>`;
}

function packLabel(pack: string, locale: string) {
  const names: Record<string, Record<string, string>> = {
    solo: { fr: 'Solo (1 plaque)', en: 'Solo (1 plaque)' },
    duo:  { fr: 'Duo (2 plaques)',  en: 'Duo (2 plaques)' },
  };
  return names[pack]?.[locale] ?? pack.toUpperCase();
}

// ─── Tip receipt ──────────────────────────────────────────────────────────────
//
// The three emails a tipper can get (receipt, failed payment, refund) are
// written in the language of the page they tipped from, carried on the
// PaymentIntent as `metadata.locale`. French when it is missing: the venues
// are in France, and intents created before the field existed have none.

/** 'fr' or 'en' from whatever the PaymentIntent carried. */
export function tipperLocale(raw: string | null | undefined): 'fr' | 'en' {
  return raw === 'en' ? 'en' : 'fr';
}

function tipperMoney(cents: number, currency: string, locale: 'fr' | 'en'): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** "Clara chez Le Comptoir", or "l'équipe chez Le Comptoir" for a team tip ("chez"
 * works whatever article the venue name starts with). */
function tipRecipient(locale: 'fr' | 'en', staffName: string | null, establishmentName: string): string {
  const est = escapeHtml(establishmentName);
  if (staffName) {
    const who = `<strong class="text-strong" style="color:#0f0f12">${escapeHtml(staffName)}</strong>`;
    if (!est) return who;
    return locale === 'fr' ? `${who} chez ${est}` : `${who} at ${est}`;
  }
  if (locale === 'fr') return est ? `l\u2019équipe chez <strong class="text-strong" style="color:#0f0f12">${est}</strong>` : 'l\u2019équipe';
  return est ? `the team at <strong class="text-strong" style="color:#0f0f12">${est}</strong>` : 'the team';
}

export async function sendTipReceipt(opts: {
  to: string;
  /** What the card was charged: the tip plus the service fee. */
  amount: number;
  /** The tip alone. */
  tipAmount: number;
  currency: string;
  /** Null for a team tip. */
  staffName: string | null;
  establishmentName: string;
  transactionId: string;
  locale: 'fr' | 'en';
}): Promise<void> {
  if (!resend) return;

  const { to, amount, tipAmount, currency, staffName, establishmentName, transactionId, locale } = opts;
  const fr = locale === 'fr';
  const total = tipperMoney(amount, currency, locale);
  const fee = Math.max(0, amount - tipAmount);
  const shortRef = transactionId.slice(0, 8).toUpperCase();
  const recipient = tipRecipient(locale, staffName, establishmentName);

  await resend.emails.send({
    from: FROM,
    to,
    subject: fr ? `Votre reçu de pourboire · ${total}` : `Your tip receipt · ${total}`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">${fr ? 'Reçu de pourboire' : 'Tip receipt'}</div>
    </td></tr>
    <tr><td style="padding:28px 32px">
      <div class="text-primary" style="font-size:40px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:4px">${total}</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a">${fr ? 'Pourboire pour' : 'Tip for'} ${recipient}</div>
    </td></tr>
    <tr><td style="padding:0 32px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" class="panel" style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden">
        ${infoRow(fr ? 'Pourboire' : 'Tip', tipperMoney(tipAmount, currency, locale))}
        ${fee > 0 ? infoRow(fr ? 'Frais de service' : 'Service fee', tipperMoney(fee, currency, locale)) : ''}
        ${infoRow(fr ? 'Total débité' : 'Total charged', total)}
        ${infoRow(fr ? 'Statut' : 'Status', `<span style="color:#22c55e;font-weight:600">● ${fr ? 'Payé' : 'Paid'}</span>`)}
        ${infoRow(fr ? 'Référence' : 'Reference', `<span style="font-family:monospace">${shortRef}</span>`)}
      </table>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:0;line-height:1.6">
        ${fr
          ? 'Paiement traité par Stripe. Digitip encaisse le pourboire puis le reverse à l\u2019établissement, qui le remet à son équipe. Une question\u00a0? Écrivez à contact@digitip.app.'
          : 'Payment processed by Stripe. Digitip collects the tip and pays it out to the business, which passes it on to its team. Questions? Write to contact@digitip.app.'}
      </p>
    </td></tr>`, locale),
  });
}

// ─── Order confirmation ───────────────────────────────────────────────────────

export async function sendOrderConfirmation(opts: {
  to: string;
  pack: string;
  quantity: number;
  orderId: string;
  invoicePdfUrl?: string | null;
  setupUrl?: string | null;
  locale?: string;
}): Promise<void> {
  if (!resend) return;

  const { to, pack, quantity, orderId, invoicePdfUrl, setupUrl, locale = 'fr' } = opts;
  const isFr = locale === 'fr';
  const shortRef = orderId.slice(0, 8).toUpperCase();
  const label = packLabel(pack, locale);

  const subject = isFr
    ? `C'est commandé : votre pack ${label} Digitip`
    : `Your Digitip order is confirmed · ${label}`;

  const headline = isFr ? 'Commande confirmée' : 'Order confirmed';
  const subline = isFr
    ? 'Merci ! On programme vos plaques à la main.'
    : 'Thank you! We program your plaques by hand.';
  const nextStepsTitle = isFr ? 'La suite' : "What happens next";
  const step1 = isFr
    ? 'On programme vos plaques et on les expédie sous 3 jours ouvrés.'
    : 'We program your plaques and ship them within 3 working days.';
  const step2 = isFr
    ? "Dès qu'elles partent, vous recevez un e-mail avec le numéro de suivi."
    : "As soon as they ship, you get an email with the tracking number.";
  const step3 = isFr
    ? 'Vous posez la plaque, vous la scannez une fois, et les pourboires peuvent arriver.'
    : 'Put the plaque up, scan it once, and tips can start coming in.';
  const invoiceLabel = isFr ? 'Télécharger la facture' : 'Download the invoice';
  const orderLabel = isFr ? 'Pack commandé' : 'Pack ordered';
  const qtyLabel = isFr ? 'Quantité' : 'Quantity';
  const refLabel = isFr ? 'Référence' : 'Reference';
  const invoiceRow = isFr ? 'Facture' : 'Invoice';
  const footer = isFr
    ? 'Une question ? Répondez à cet e-mail, ou écrivez à contact@digitip.app.'
    : 'Questions? Reply to this email or write to contact@digitip.app.';

  const invoiceSection = invoicePdfUrl
    ? `<tr><td style="padding:0 32px 24px">
        <a href="${invoicePdfUrl}" class="neutral-btn" style="display:inline-block;padding:10px 20px;background:#0f0f12;color:#ffffff;font-size:13px;font-weight:600;border-radius:8px;text-decoration:none">
          ↓ ${invoiceLabel}
        </a>
      </td></tr>`
    : '';

  const setupSection = setupUrl
    ? `<tr><td style="padding:0 32px 28px">
        <div class="highlight" style="background:#fde7ee;border:1px solid #f4c2d2;border-radius:12px;padding:20px 24px">
          <div class="text-strong" style="font-size:14px;font-weight:700;color:#0f0f12;margin-bottom:6px">
            ${isFr ? 'Configurez votre établissement dès maintenant' : 'Set up your venue now'}
          </div>
          <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-bottom:16px;line-height:1.5">
            ${isFr
              ? 'Ça prend 2 minutes : le nom de l\'établissement, votre équipe, et vos plaques seront prêtes à recevoir des pourboires dès leur arrivée.'
              : 'It takes 2 minutes: the venue name, your team, and your plaques will be ready for tips as soon as they arrive.'}
          </div>
          <a href="${setupUrl}" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#E57A97,#EC97B0);color:#fff;font-size:14px;font-weight:700;border-radius:10px;text-decoration:none;letter-spacing:-0.01em">
            ${isFr ? 'Configurer mon espace →' : 'Set up my space →'}
          </a>
        </div>
      </td></tr>`
    : '';

  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">${headline}</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#22c55e22;color:#22c55e;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● ${isFr ? 'Paiement reçu' : 'Payment received'}</div>
      <div class="text-primary" style="font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:6px">${headline}</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a">${subline}</div>
    </td></tr>
    <tr><td style="padding:0 32px 24px">
      <table width="100%" cellpadding="0" cellspacing="0" class="panel" style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden">
        ${infoRow(orderLabel, label)}
        ${infoRow(qtyLabel, String(quantity))}
        ${infoRow(refLabel, `<span style="font-family:monospace">${shortRef}</span>`)}
        ${invoicePdfUrl ? infoRow(invoiceRow, `<a href="${invoicePdfUrl}" style="color:#E57A97;text-decoration:none">PDF ↓</a>`) : ''}
      </table>
    </td></tr>
    ${invoiceSection}
    ${setupSection}
    <tr><td style="padding:0 32px 28px">
      <div class="text-strong" style="font-size:13px;font-weight:600;color:#0f0f12;margin-bottom:12px">${nextStepsTitle}</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;line-height:1.7">
        <div style="margin-bottom:6px">1. ${step1}</div>
        <div style="margin-bottom:6px">2. ${step2}</div>
        <div>3. ${step3}</div>
      </div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:0;line-height:1.6">${footer}</p>
    </td></tr>`),
  });
}

// ─── Order shipped ────────────────────────────────────────────────────────────

export async function sendOrderShipped(opts: {
  to: string;
  pack: string;
  quantity: number;
  orderId: string;
  trackingNumber?: string | null;
  locale?: string;
  onboardingUrl?: string | null;
  /** The customer has no account yet: the plaque does nothing until they set one up. */
  setupRequired?: boolean;
}): Promise<void> {
  if (!resend) throw new Error('RESEND_API_KEY is not set');

  const { to, pack, quantity, orderId, locale = 'fr', onboardingUrl, setupRequired = false } = opts;
  const trackingNumber = normalizeTrackingNumber(opts.trackingNumber);
  const trackingUrl = trackingNumber ? laPosteTrackingUrl(trackingNumber) : null;
  const isFr = locale === 'fr';
  const shortRef = orderId.slice(0, 8).toUpperCase();
  const label = packLabel(pack, locale);

  const subject = isFr
    ? `Vos plaques Digitip sont parties`
    : `Your Digitip order has shipped · ${label}`;

  const headline = isFr ? 'Commande expédiée' : 'Order shipped';
  const subline = isFr
    ? (quantity > 1 ? 'Vos plaques sont en route.' : 'Votre plaque est en route.')
    : (quantity > 1 ? 'Your plaques are on their way.' : 'Your plaque is on its way.');
  const trackingTitle = isFr ? 'Numéro de suivi' : 'Tracking number';
  const noTracking = isFr ? 'Non communiqué' : 'Not provided';
  const estDelivery = isFr ? 'Délai estimé' : 'Estimated delivery';
  const estDays = isFr ? '3 à 5 jours ouvrés en France, 4 à 7 ailleurs en Europe' : '3–5 working days in France, 4–7 elsewhere in Europe';
  const refLabel = isFr ? 'Référence' : 'Reference';
  const orderLabel = isFr ? 'Pack' : 'Pack';
  const footer = isFr
    ? 'Une question ? Répondez à cet e-mail, ou écrivez à contact@digitip.app.'
    : 'Questions? Reply to this email or write to contact@digitip.app.';

  const trackingSection = trackingUrl
    ? `<tr><td style="padding:0 32px 24px">
        <a href="${trackingUrl}" class="neutral-btn" style="display:inline-block;padding:12px 22px;background:#0f0f12;color:#ffffff;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none">
          ${isFr ? 'Suivre mon colis sur La Poste →' : 'Track my parcel on La Poste →'}
        </a>
      </td></tr>`
    : '';

  // A customer without an account gets a plaque that collects nothing, so the
  // setup call is the point of the email for them, not an optional extra.
  const onboardingSection = onboardingUrl
    ? `<tr><td style="padding:0 32px 24px">
        <div class="highlight" style="background:#fde7ee;border:1px solid #f4c2d2;border-radius:12px;padding:20px 24px">
          <div class="text-strong" style="font-size:14px;font-weight:700;color:#0f0f12;margin-bottom:8px">
            ${setupRequired
              ? (isFr ? 'Il reste à créer votre compte' : 'Your account still needs setting up')
              : (isFr ? 'Votre espace Digitip' : 'Your Digitip space')}
          </div>
          <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-bottom:16px;line-height:1.6">
            ${setupRequired
              ? (isFr
                ? 'Sans compte, la plaque ne peut pas recevoir de pourboire. Ça prend 5 minutes : faites-le maintenant, et elle marchera dès que vous la recevrez.'
                : 'Without an account the plaque can\'t take tips. It takes 5 minutes: do it now and it\'ll work the moment it arrives.')
              : (isFr
                ? 'Votre plaque sera reliée à votre établissement, et vous verrez les pourboires arriver dans votre tableau de bord.'
                : 'Your plaque will be linked to your venue. You will follow the tips it collects from your dashboard.')}
          </div>
          <a href="${onboardingUrl}" class="neutral-btn" style="display:inline-block;padding:10px 20px;background:#0f0f12;color:#ffffff;font-size:13px;font-weight:600;border-radius:8px;text-decoration:none">
            ${setupRequired
              ? (isFr ? 'Activer mon compte →' : 'Activate my account →')
              : (isFr ? 'Ouvrir mon tableau de bord →' : 'Open my dashboard →')}
          </a>
        </div>
      </td></tr>`
    : '';

  // Resend reports a rejected send in the result, not by throwing. Surface it
  // so the admin action can tell the admin the customer was not notified.
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">${headline}</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#3b82f622;color:#60a5fa;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● ${isFr ? 'En transit' : 'In transit'}</div>
      <div class="text-primary" style="font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:6px">${headline}</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a">${subline}</div>
    </td></tr>
    <tr><td style="padding:0 32px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" class="panel" style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden">
        ${infoRow(orderLabel, label)}
        ${infoRow(isFr ? 'Quantité' : 'Quantity', String(quantity))}
        ${infoRow(refLabel, `<span style="font-family:monospace">${shortRef}</span>`)}
        ${infoRow(trackingTitle, trackingUrl
          ? `<a href="${trackingUrl}" class="text-strong" style="font-family:monospace;color:#0f0f12;text-decoration:underline">${escapeHtml(trackingNumber!)}</a>`
          : noTracking)}
        ${infoRow(estDelivery, estDays)}
      </table>
    </td></tr>
    ${trackingSection}
    ${onboardingSection}
    <tr><td style="padding:0 32px 32px">
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:0;line-height:1.6">${footer}</p>
    </td></tr>`),
  });
  if (error) throw new Error(`Shipping email not sent: ${error.message}`);
}

// ─── Payment failed (tipper) ──────────────────────────────────────────────────

export async function sendPaymentFailed(opts: {
  to: string;
  amount: number;
  currency: string;
  /** Null for a team tip. */
  staffName: string | null;
  establishmentName: string;
  locale: 'fr' | 'en';
}): Promise<void> {
  if (!resend) return;

  const { to, amount, currency, staffName, establishmentName, locale } = opts;
  const fr = locale === 'fr';
  const formatted = tipperMoney(amount, currency, locale);
  const recipient = tipRecipient(locale, staffName, establishmentName);

  await resend.emails.send({
    from: FROM,
    to,
    subject: fr ? `Votre pourboire n\u2019est pas passé · ${formatted}` : `Your tip did not go through · ${formatted}`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">${fr ? 'Paiement refusé' : 'Payment declined'}</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#ef444422;color:#f87171;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● ${fr ? 'Non débité' : 'Not charged'}</div>
      <div class="text-primary" style="font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:10px">${fr ? 'Le paiement n\u2019est pas passé' : 'The payment did not go through'}</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a">${fr
        ? `Votre pourboire de <strong class="text-strong" style="color:#0f0f12">${formatted}</strong> pour ${recipient} n\u2019a pas abouti.`
        : `Your tip of <strong class="text-strong" style="color:#0f0f12">${formatted}</strong> for ${recipient} was not completed.`}</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p class="text-secondary" style="font-size:13px;color:#5a5a6a;margin:0;line-height:1.6">${fr
        ? 'Votre carte n\u2019a pas été débitée. Pour réessayer, scannez de nouveau la plaque ou rouvrez la page du pourboire.'
        : 'Your card was not charged. To try again, scan the plaque again or reopen the tip page.'}</p>
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:16px 0 0;line-height:1.6">${fr ? 'Une question\u00a0? Écrivez à contact@digitip.app.' : 'Questions? Write to contact@digitip.app.'}</p>
    </td></tr>`, locale),
  });
}

// ─── Tip refunded (tipper) ────────────────────────────────────────────────────

export async function sendTipRefunded(opts: {
  to: string;
  amount: number;
  currency: string;
  /** Null for a team tip. */
  staffName: string | null;
  establishmentName: string;
  locale: 'fr' | 'en';
}): Promise<void> {
  if (!resend) return;

  const { to, amount, currency, staffName, establishmentName, locale } = opts;
  const fr = locale === 'fr';
  const formatted = tipperMoney(amount, currency, locale);
  const recipient = tipRecipient(locale, staffName, establishmentName);

  await resend.emails.send({
    from: FROM,
    to,
    subject: fr ? `Votre pourboire a été remboursé · ${formatted}` : `Your tip has been refunded · ${formatted}`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">${fr ? 'Remboursement' : 'Refund'}</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#f59e0b22;color:#fbbf24;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● ${fr ? 'Remboursé' : 'Refunded'}</div>
      <div class="text-primary" style="font-size:40px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:4px">${formatted}</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a">${fr ? `Votre pourboire pour ${recipient} a été remboursé.` : `Your tip for ${recipient} has been refunded.`}</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p class="text-secondary" style="font-size:13px;color:#5a5a6a;margin:0;line-height:1.6">${fr
        ? 'La somme revient sur la carte utilisée, en général sous 5 à 10 jours ouvrés selon votre banque.'
        : 'The money goes back to the card you used, usually within 5 to 10 business days depending on your bank.'}</p>
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:16px 0 0;line-height:1.6">${fr ? 'Une question\u00a0? Écrivez à contact@digitip.app.' : 'Questions? Write to contact@digitip.app.'}</p>
    </td></tr>`, locale),
  });
}

// ─── Ambassador recruitment — applicant confirmation ──────────────────────────

export async function sendAmbassadorApplicationConfirmation(opts: {
  to: string;
  firstName: string;
}): Promise<void> {
  if (!resend) return;

  const { to, firstName } = opts;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Candidature ambassadeur reçue · Digitip`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Programme ambassadeur</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#22c55e22;color:#22c55e;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● Candidature reçue</div>
      <div class="text-primary" style="font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:10px">Merci ${firstName} !</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a">On a bien reçu ta candidature au programme ambassadeur Digitip.</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p class="text-secondary" style="font-size:13px;color:#5a5a6a;margin:0;line-height:1.7">On la regarde et on revient vers toi rapidement. En attendant, n'hésite pas à répondre à cet email si tu as des questions.</p>
    </td></tr>`),
  });
}

// ─── Ambassador recruitment — internal admin alert ────────────────────────────

export async function sendAmbassadorApplicationAdmin(opts: {
  to: string[];
  firstName: string;
  lastName: string;
  city: string;
  phone: string;
  email: string;
  siret: string | null;
  notes?: string | null;
}): Promise<void> {
  const { to, firstName, lastName, city, phone, email, siret, notes } = opts;
  if (!resend || to.length === 0) return;

  await resend.emails.send({
    from: FROM,
    to,
    replyTo: email,
    subject: `Nouvelle candidature ambassadeur · ${firstName} ${lastName}`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip Admin</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Nouvelle candidature ambassadeur</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div class="text-primary" style="font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:4px">${firstName} ${lastName}</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a">${city}</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <table width="100%" cellpadding="0" cellspacing="0" class="panel" style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden">
        ${infoRow('Email', `<a href="mailto:${email}" style="color:#E57A97;text-decoration:none">${email}</a>`)}
        ${infoRow('Téléphone', phone)}
        ${infoRow('Ville', city)}
        ${infoRow('SIRET', siret
          ? `<span style="font-family:monospace">${siret}</span>`
          : '<span style="color:#9ca3af">Non renseigné, à fournir avant paiement</span>')}
        ${notes ? infoRow('Notes', notes) : ''}
      </table>
    </td></tr>`),
  });
}

// ─── Commercial Pros — contract invitation (admin → commercial) ─────────────

export async function sendCommercialContractInvitation(opts: {
  to: string;
  firstName: string;
  contractTitle: string;
  dashboardUrl: string;
}): Promise<void> {
  if (!resend) return;
  const { to, firstName, contractTitle, dashboardUrl } = opts;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Contrat d'apporteur d'affaires à signer · ${contractTitle}`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Programme Commerciaux Pros · Contrat à signer</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:8px">Bonjour ${firstName},</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.65">Votre contrat d'apporteur d'affaires est prêt. Vous pouvez le lire en entier et le signer électronique depuis votre espace commercial sécurisé par code PIN. Aucune impression ni envoi postal n'est requis.</div>
    </td></tr>
    <tr><td style="padding:0 32px 28px">
      <p style="margin:0"><a href="${dashboardUrl}" style="display:inline-block;padding:13px 24px;background:#E57A97;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Consulter &amp; signer le contrat →</a></p>
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:18px 0 0;line-height:1.6">La signature électronique simple a, par accord entre les Parties, la même valeur juridique qu'une signature manuscrite (eIDAS, articles 1366 et 1367 du Code civil). Une copie horodatée du contrat signé vous sera transmise par email après signature.</p>
    </td></tr>`),
  });
}

// ─── Commercial Pros — signed contract copy (commercial + admin) ────────────

export async function sendSignedCommercialContractCopy(opts: {
  to: string;
  firstName: string;
  contractTitle: string;
  signedAt: string;
  contentHash: string;
  downloadUrl: string;
}): Promise<void> {
  if (!resend) return;
  const { to, firstName, contractTitle, signedAt, contentHash, downloadUrl } = opts;
  const shortHash = contentHash.slice(0, 16);

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Contrat signé · ${contractTitle}`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Programme Commerciaux Pros · Contrat signé</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#22c55e22;color:#22c55e;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● Signé électroniquement</div>
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:8px">Bonjour ${firstName}, votre contrat est signé ✓</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">${contractTitle}</div>
    </td></tr>
    <tr><td style="padding:0 32px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" class="panel" style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden">
        ${infoRow('Signé le', new Date(signedAt).toLocaleString('fr-FR'))}
        ${infoRow('Empreinte SHA-256', `<span style="font-family:monospace">${shortHash}…</span>`)}
      </table>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p style="margin:0"><a href="${downloadUrl}" class="outline-btn" style="display:inline-block;padding:11px 20px;background:#f9fafb;color:#0f0f12;text-decoration:none;border-radius:8px;font-weight:700;border:1px solid #e5e7eb">Télécharger / imprimer →</a></p>
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:18px 0 0;line-height:1.6">Conservez cet email comme preuve. Le contenu intégral du contrat reste consultable et téléchargeable depuis votre espace commercial. Toute modification ultérieure est techniquement impossible (immutabilité garantie en base).</p>
    </td></tr>`),
  });
}

// ─── Commercial Pros — application confirmation (candidate side) ─────────────

const LEGAL_FORM_LABELS: Record<string, string> = {
  sarl: 'SARL',
  sas: 'SAS',
  sasu: 'SASU',
  ei: 'Entreprise individuelle',
  auto_entrepreneur: 'Auto-entrepreneur',
  eurl: 'EURL',
  sa: 'SA',
  autre: 'Autre',
};

const VRP_STATUS_LABELS: Record<string, string> = {
  vrp_exclusif: 'VRP exclusif',
  vrp_multicarte: 'VRP multicarte',
  agent_commercial: 'Agent commercial',
  independant: 'Commercial indépendant',
  autre: 'Autre',
};

export async function sendCommercialApplicationConfirmation(opts: {
  to: string;
  firstName: string;
}): Promise<void> {
  if (!resend) return;
  const { to, firstName } = opts;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Candidature commerciale reçue · Digitip Partenaires`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Programme Commerciaux Pros</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#22c55e22;color:#22c55e;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● Dossier reçu</div>
      <div class="text-primary" style="font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:10px">Bonjour ${firstName},</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.65">On a bien reçu votre candidature au programme partenaire Digitip. On l'étudie et on revient vers vous sous 48 h ouvrées pour, le cas échéant, la signature du contrat d'apporteur d'affaires et l'activation de votre code commercial.</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p class="text-secondary" style="font-size:13px;color:#5a5a6a;margin:0;line-height:1.7">Une question urgente ? Répondez directement à cet e-mail, il arrive chez nous.</p>
    </td></tr>`),
  });
}

export async function sendCommercialApplicationAdmin(opts: {
  to: string[];
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  sector: string | null;
  companyName: string;
  legalForm: string;
  vatNumber: string | null;
  siret: string;
  vrpStatus: string;
  notes?: string | null;
}): Promise<void> {
  const {
    to, firstName, lastName, email, phone, city, sector,
    companyName, legalForm, vatNumber, siret, vrpStatus, notes,
  } = opts;
  if (!resend || to.length === 0) return;

  const legalLabel = LEGAL_FORM_LABELS[legalForm] ?? legalForm;
  const vrpLabel = VRP_STATUS_LABELS[vrpStatus] ?? vrpStatus;

  await resend.emails.send({
    from: FROM,
    to,
    replyTo: email,
    subject: `Nouvelle candidature COMMERCIAL PRO · ${firstName} ${lastName} (${companyName})`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip Admin</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Nouvelle candidature Commerciaux Pros</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div class="text-primary" style="font-size:24px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:4px">${firstName} ${lastName}</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a">${companyName} · ${city}${sector ? ` · ${sector}` : ''}</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <table width="100%" cellpadding="0" cellspacing="0" class="panel" style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden">
        ${infoRow('Email', `<a href="mailto:${email}" style="color:#E57A97;text-decoration:none">${email}</a>`)}
        ${infoRow('Téléphone', phone)}
        ${infoRow('Statut commercial', vrpLabel)}
        ${infoRow('Forme juridique', legalLabel)}
        ${infoRow('SIRET', `<span style="font-family:monospace">${siret}</span>`)}
        ${infoRow('N° TVA', vatNumber
          ? `<span style="font-family:monospace">${vatNumber}</span>`
          : '<span style="color:#9ca3af">Non renseigné, franchise probable</span>')}
        ${sector ? infoRow('Secteur géographique', sector) : ''}
        ${notes ? infoRow('Notes', notes) : ''}
      </table>
    </td></tr>`),
  });
}

// ─── Ambassador banking — setup confirmation ──────────────────────────────────

export async function sendAmbassadorBankingConfirmation(opts: {
  to: string;
  firstName: string;
}): Promise<void> {
  if (!resend) return;

  const { to, firstName } = opts;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Compte bancaire configuré · Digitip Ambassadeur`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Programme ambassadeur</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#22c55e22;color:#22c55e;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● Compte configuré</div>
      <div class="text-primary" style="font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:10px">Tout est prêt, ${firstName} !</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a">Ton compte bancaire est bien enregistré chez Stripe. Tes commissions seront virées sur cet IBAN.</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p class="text-secondary" style="font-size:13px;color:#5a5a6a;margin:0;line-height:1.7">On lance les virements à la main, après validation, et tu reçois un e-mail à chaque paiement.</p>
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:16px 0 0;line-height:1.6">Questions ? Réponds à cet email ou écris à contact@digitip.app.</p>
    </td></tr>`),
  });
}

// ─── Admin — ambassador payout (withdrawal) notification ─────────────────────

export async function sendAmbassadorPayoutAdmin(opts: {
  to: string[];
  ambassadorName: string;
  amountCents: number;
  status: 'paid' | 'failed';
}): Promise<void> {
  const { to, ambassadorName, amountCents, status } = opts;
  if (!resend || to.length === 0) return;

  const amount = (amountCents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 });
  const paid = status === 'paid';
  const badge = paid
    ? '<div style="display:inline-block;background:#22c55e22;color:#22c55e;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● Virement effectué</div>'
    : '<div style="display:inline-block;background:#ef444422;color:#ef4444;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● Virement échoué, à reprendre</div>';

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Virement ambassadeur · ${ambassadorName} (${amount} €)`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip Admin</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Demande de virement ambassadeur</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      ${badge}
      <div class="text-primary" style="font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:4px">${ambassadorName}</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a">a déclenché un virement de <strong>${amount} €</strong>.</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <table width="100%" cellpadding="0" cellspacing="0" class="panel" style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden">
        ${infoRow('Montant', `<strong>${amount} €</strong>`)}
        ${infoRow('Statut', paid ? 'Versé sur le compte Stripe de l\'ambassadeur' : 'Échec, à reprendre depuis le dashboard admin')}
      </table>
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:16px 0 0;line-height:1.6">Le solde ne contient que la commission de base et les bonus que tu as validés.</p>
    </td></tr>`),
  });
}

// ─── Admin — new SmartTag order alert ─────────────────────────────────────────

export async function sendAdminNewOrder(opts: {
  to: string[];
  customerName: string;
  customerEmail?: string | null;
  pack: string;
  quantity: number;
  orderId: string;
  promoCode?: string | null;
  locale: string;
}): Promise<void> {
  if (!resend) throw new Error('RESEND_API_KEY is not set');
  if (opts.to.length === 0) throw new Error('no admin recipient');

  const { to, customerName, customerEmail, pack, quantity, orderId, promoCode, locale } = opts;
  const shortRef = orderId.slice(0, 8).toUpperCase();
  const label = packLabel(pack, locale);

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    ...(customerEmail ? { replyTo: customerEmail } : {}),
    subject: `Nouvelle commande · ${label} · ${customerName}`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip Admin</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Nouvelle commande SmartTag</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div class="text-primary" style="font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:4px">${customerName}</div>
      ${customerEmail ? `<div class="text-secondary" style="font-size:14px;color:#5a5a6a">${customerEmail}</div>` : ''}
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <table width="100%" cellpadding="0" cellspacing="0" class="panel" style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden">
        ${infoRow('Pack', label)}
        ${infoRow('Quantité', String(quantity))}
        ${infoRow('Référence', `<span style="font-family:monospace">${shortRef}</span>`)}
        ${promoCode ? infoRow('Code promo', promoCode) : ''}
      </table>
    </td></tr>`),
  });
  if (error) throw new Error(`Admin order alert not sent: ${error.message}`);
}

// ─── Order delivered ──────────────────────────────────────────────────────────

export async function sendOrderDelivered(opts: {
  to: string;
  pack: string;
  quantity: number;
  orderId: string;
  dashboardUrl?: string;
  locale?: string;
}): Promise<void> {
  if (!resend) return;

  const { to, pack, quantity, orderId, dashboardUrl, locale = 'fr' } = opts;
  const isFr = locale === 'fr';
  const shortRef = orderId.slice(0, 8).toUpperCase();
  const label = packLabel(pack, locale);

  const subject = isFr
    ? `Vos plaques Digitip sont arrivées`
    : `Your Digitip plaques have arrived`;

  const headline = isFr ? 'Livraison confirmée' : 'Delivery confirmed';
  const subline = isFr
    ? 'Le colis est livré. Il ne reste qu\'à poser les plaques.'
    : "The parcel has been delivered. All that's left is to put the plaques up.";
  const ctaLabel = isFr ? 'Aller au tableau de bord' : 'Go to the dashboard';
  const step1 = isFr
    ? 'Posez une plaque sur le comptoir ou sur une table, là où le client la voit.'
    : 'Put a plaque on the counter or a table, where customers can see it.';
  const step2 = isFr
    ? 'Le client approche son téléphone, et le pourboire passe en quelques secondes.'
    : 'Customers hold up their phone and the tip goes through in seconds.';
  const step3 = isFr
    ? 'Vous voyez chaque pourboire arriver dans votre tableau de bord.'
    : 'You see every tip arrive in your dashboard.';
  const nextTitle = isFr ? 'Pour démarrer' : 'Getting started';
  const footer = isFr
    ? 'Une question ? Répondez à cet e-mail, ou écrivez à contact@digitip.app.'
    : 'Questions? Reply to this email or write to contact@digitip.app.';

  const ctaSection = dashboardUrl
    ? `<tr><td style="padding:0 32px 24px">
        <a href="${dashboardUrl}" class="neutral-btn" style="display:inline-block;padding:11px 22px;background:#0f0f12;color:#ffffff;font-size:13px;font-weight:600;border-radius:8px;text-decoration:none">
          ${ctaLabel} →
        </a>
      </td></tr>`
    : '';

  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">${headline}</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#22c55e22;color:#22c55e;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● ${isFr ? 'Livré' : 'Delivered'}</div>
      <div class="text-primary" style="font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:6px">${headline}</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a">${subline}</div>
    </td></tr>
    <tr><td style="padding:0 32px 24px">
      <table width="100%" cellpadding="0" cellspacing="0" class="panel" style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden">
        ${infoRow(isFr ? 'Pack livré' : 'Delivered pack', label)}
        ${infoRow(isFr ? 'Quantité' : 'Quantity', String(quantity))}
        ${infoRow(isFr ? 'Référence' : 'Reference', `<span style="font-family:monospace">${shortRef}</span>`)}
      </table>
    </td></tr>
    ${ctaSection}
    <tr><td style="padding:0 32px 28px">
      <div class="text-strong" style="font-size:13px;font-weight:600;color:#0f0f12;margin-bottom:12px">${nextTitle}</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;line-height:1.7">
        <div style="margin-bottom:6px">1. ${step1}</div>
        <div style="margin-bottom:6px">2. ${step2}</div>
        <div>3. ${step3}</div>
      </div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:0;line-height:1.6">${footer}</p>
    </td></tr>`),
  });
}

// ─── Order canceled ───────────────────────────────────────────────────────────

export async function sendOrderCanceled(opts: {
  to: string;
  pack: string;
  quantity: number;
  orderId: string;
  reason?: string | null;
  locale?: string;
}): Promise<void> {
  if (!resend) return;

  const { to, pack, quantity, orderId, reason, locale = 'fr' } = opts;
  const isFr = locale === 'fr';
  const shortRef = orderId.slice(0, 8).toUpperCase();
  const label = packLabel(pack, locale);

  const subject = isFr
    ? `Votre commande Digitip est annulée`
    : `Your Digitip order has been canceled · ${label}`;
  const headline = isFr ? 'Commande annulée' : 'Order canceled';
  const subline = isFr
    ? 'On vous rembourse la totalité, sur le moyen de paiement utilisé. Comptez 5 à 10 jours ouvrés.'
    : 'The amount paid will be fully refunded to your original payment method within 5–10 business days.';
  const reasonLabel = isFr ? 'Motif' : 'Reason';
  const orderLabel = isFr ? 'Pack' : 'Pack';
  const qtyLabel = isFr ? 'Quantité' : 'Quantity';
  const refLabel = isFr ? 'Référence' : 'Reference';
  const footer = isFr
    ? 'Si c\'est une erreur, répondez à cet e-mail et on regarde tout de suite.'
    : 'Made a mistake? Reply to this email, we’ll take a look.';

  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">${headline}</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#ef444422;color:#f87171;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● ${headline}</div>
      <div class="text-primary" style="font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:6px">${headline}</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">${subline}</div>
    </td></tr>
    <tr><td style="padding:0 32px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" class="panel" style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden">
        ${infoRow(orderLabel, label)}
        ${infoRow(qtyLabel, String(quantity))}
        ${infoRow(refLabel, `<span style="font-family:monospace">${shortRef}</span>`)}
        ${reason ? infoRow(reasonLabel, escapeHtml(reason)) : ''}
      </table>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:0;line-height:1.6">${footer}</p>
    </td></tr>`),
  });
}

// ─── Custom order note (admin → customer — free-form) ──────────────────────────

export async function sendOrderCustomNote(opts: {
  to: string;
  orderId: string;
  subject: string;
  bodyText: string;
  locale?: string;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<void> {
  if (!resend) return;

  const { to, orderId, subject, bodyText, locale = 'fr', attachments = [] } = opts;
  const isFr = locale === 'fr';
  const shortRef = orderId.slice(0, 8).toUpperCase();
  const refLabel = isFr ? 'Référence commande' : 'Order reference';
  const signature = isFr
    ? 'L’équipe Digitip · contact@digitip.app'
    : 'The Digitip team · contact@digitip.app';

  const safeBody = escapeHtml(bodyText).replace(/\n/g, '<br>');

  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">${escapeHtml(subject)}</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div class="text-body" style="font-size:14px;color:#3f3f4a;line-height:1.7">${safeBody}</div>
    </td></tr>
    <tr><td style="padding:0 32px 18px">
      <table width="100%" cellpadding="0" cellspacing="0" class="panel" style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden">
        ${infoRow(refLabel, `<span style="font-family:monospace">${shortRef}</span>`)}
      </table>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:0;line-height:1.6">${signature}</p>
    </td></tr>`),
    ...(attachments.length ? { attachments } : {}),
  });
}

/** La Poste / Colissimo numbers are printed with spaces; the tracker wants them bare. */
export function normalizeTrackingNumber(raw: string | null | undefined): string | null {
  const n = (raw ?? '').replace(/[\s-]+/g, '').toUpperCase();
  return n || null;
}

export function laPosteTrackingUrl(trackingNumber: string): string {
  return `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(trackingNumber)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Ambassador — templated email sent by super admin ─────────────────────────
// `bodyHtml` is the rendered HTML body (placeholders already substituted by
// the caller via renderTemplate). It is wrapped in the Digitip themed layout.

export async function sendAmbassadorTemplatedEmail(opts: {
  to: string;
  subject: string;
  bodyHtml: string;
  replyTo?: string;
}): Promise<{ id: string | null }> {
  if (!resend) return { id: null };
  const { to, subject, bodyHtml, replyTo } = opts;

  const html = themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Programme ambassadeur</div>
    </td></tr>
    <tr><td class="text-body" style="padding:28px 32px 16px;color:#3f3f4a;font-size:14px;line-height:1.6">
      ${bodyHtml}
    </td></tr>`);

  const result = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    ...(replyTo ? { replyTo } : {}),
  });
  return { id: result.data?.id ?? null };
}

// ─── Ambassador — contract invitation (admin → ambassador) ────────────────────

export async function sendAmbassadorContractInvitation(opts: {
  to: string;
  firstName: string;
  contractTitle: string;
  dashboardUrl: string;
}): Promise<void> {
  if (!resend) return;
  const { to, firstName, contractTitle, dashboardUrl } = opts;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Contrat à signer · ${contractTitle}`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Contrat ambassadeur</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:8px">${firstName}, un contrat t'attend</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Tu peux le lire et le signer en ligne, depuis ton espace protégé par ton code PIN. Rien à imprimer.</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p><a href="${dashboardUrl}" style="display:inline-block;padding:12px 22px;background:#E57A97;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Lire &amp; signer le contrat →</a></p>
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:18px 0 0;line-height:1.6">Pour ta protection, la signature s'effectue après lecture intégrale et acceptation explicite. Une copie te sera envoyée par email après signature.</p>
    </td></tr>`),
  });
}

// ─── Ambassador — signed contract copy (both parties) ─────────────────────────

export async function sendSignedContractCopy(opts: {
  to: string;
  firstName: string;
  contractTitle: string;
  signedAt: string;
  contentHash: string;
  downloadUrl: string;
}): Promise<void> {
  if (!resend) return;
  const { to, firstName, contractTitle, signedAt, contentHash, downloadUrl } = opts;
  const shortHash = contentHash.slice(0, 16);

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Contrat signé · ${contractTitle}`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Contrat signé</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#22c55e22;color:#22c55e;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● Signé</div>
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:8px">${firstName}, ton contrat est signé ✓</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">${contractTitle}</div>
    </td></tr>
    <tr><td style="padding:0 32px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" class="panel" style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden">
        ${infoRow('Signé le', new Date(signedAt).toLocaleString('fr-FR'))}
        ${infoRow('Empreinte SHA-256', `<span style="font-family:monospace">${shortHash}…</span>`)}
      </table>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p><a href="${downloadUrl}" class="outline-btn" style="display:inline-block;padding:10px 18px;background:#f9fafb;color:#0f0f12;text-decoration:none;border-radius:8px;font-weight:600;border:1px solid #e5e7eb">Télécharger / imprimer →</a></p>
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:18px 0 0;line-height:1.6">Garde cet e-mail comme preuve. Le contenu intégral du contrat reste accessible depuis ton dashboard et ne peut plus être modifié.</p>
    </td></tr>`),
  });
}

// ─── Ambassador application — reminder cron ──────────────────────────────────

export async function sendAmbassadorApplicationReminder(opts: {
  to: string;
  firstName: string;
  step: 1 | 2;
}): Promise<void> {
  if (!resend) return;
  const { to, firstName, step } = opts;
  const subject = step === 1
    ? `${firstName}, ta candidature ambassadeur Digitip nous attend`
    : `Dernière relance, ta candidature ambassadeur expire bientôt`;
  const headline = step === 1
    ? `On a vu ta candidature, ${firstName}`
    : `Dernière chance, ${firstName}`;
  const body = step === 1
    ? `Ton dossier est en cours d'examen. Pour accélérer, assure-toi que ton SIRET et ton RIB sont à jour. Tu n'as pas encore de SIRET ? <a href="https://autoentrepreneur.urssaf.fr" style="color:#E57A97">Crée-le gratuitement ici</a> (10 min, c'est instantané).`
    : `Si on n'a pas de nouvelles d'ici quelques jours, on archivera ta candidature. Si ça t'intéresse toujours, réponds à cet e-mail : quelqu'un te rappelle dans la journée.`;

  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Programme ambassadeur</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div class="text-primary" style="font-size:24px;font-weight:800;color:#0f0f12;margin-bottom:10px">${headline}</div>
      <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6;margin:0">${body}</p>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:0">Une question ? Réponds simplement à ce mail.</p>
    </td></tr>`),
  });
}

// ─── Referral — welcome to candidate who signed up via parrain ──────────────

export async function sendReferralWelcomeToCandidate(opts: {
  to: string;
  firstName: string;
  parrainName: string;
}): Promise<void> {
  if (!resend) return;
  const { to, firstName, parrainName } = opts;
  await resend.emails.send({
    from: FROM,
    to,
    subject: `${parrainName} t'a recommandé(e) · Bienvenue chez Digitip`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Recommandé par ${parrainName}</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#22c55e22;color:#22c55e;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● Candidature reçue</div>
      <div class="text-primary" style="font-size:24px;font-weight:800;color:#0f0f12;margin-bottom:10px">Salut ${firstName} !</div>
      <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6;margin:0">Ta candidature au programme ambassadeur Digitip vient d'arriver via la recommandation de <strong class="text-strong" style="color:#0f0f12">${parrainName}</strong>. On l'examine et on revient vers toi rapidement.</p>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p class="text-secondary" style="font-size:13px;color:#5a5a6a;margin:0;line-height:1.7">Pas de SIRET ? C'est gratuit et instantané : <a href="https://autoentrepreneur.urssaf.fr" style="color:#E57A97">autoentrepreneur.urssaf.fr</a></p>
    </td></tr>`),
  });
}

// ─── Referral — ambassador emails a buddy from their dashboard ───────────────

export async function sendReferralEmailFromAmbassador(opts: {
  to: string;
  parrainName: string;
  referralCode: string;
}): Promise<void> {
  if (!resend) return;
  const { to, parrainName, referralCode } = opts;
  const link = `${APP_URL}/devenir-ambassadeur?ref=${encodeURIComponent(referralCode)}`;
  await resend.emails.send({
    from: FROM_AMBASSADOR,
    to,
    subject: `${parrainName} t'invite à devenir ambassadeur Digitip`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Invitation perso</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div class="text-primary" style="font-size:24px;font-weight:800;color:#0f0f12;margin-bottom:10px">${parrainName} pense à toi</div>
      <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6;margin:0 0 16px">${parrainName} fait partie du programme ambassadeur Digitip : proposer nos plaques de pourboire aux restos et commerces, pour 35 à 45 € par vente. ${parrainName} pense que ça pourrait te plaire.</p>
      <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6;margin:0">Pas d'engagement, pas de stock à avancer, juste un SIRET (auto-entrepreneur) et l'envie de prospecter.</p>
    </td></tr>
    <tr><td style="padding:8px 32px 32px">
      <p><a href="${link}" style="display:inline-block;padding:12px 22px;background:#E57A97;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">Découvrir le programme →</a></p>
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:16px 0 0">Tu reçois ce mail parce que ${parrainName} t'a explicitement invité(e). Pour ne pas être recontacté(e), réponds simplement "stop".</p>
    </td></tr>`),
  });
}

// ─── Referral — validated, notify the parrain ────────────────────────────────

export async function sendReferralValidatedToParrain(
  service: SupabaseClient<Database>,
  parrainId: string,
  filleulName: string,
  amountCents: number,
): Promise<void> {
  if (!resend) return;
  const { data: parrain } = await service
    .from('ambassadors')
    .select('email, name')
    .eq('id', parrainId)
    .maybeSingle();
  if (!parrain?.email) return;

  const euros = (amountCents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0 });
  await resend.emails.send({
    from: FROM,
    to: parrain.email,
    subject: `Parrainage validé : +${euros}€ pour toi`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Parrainage validé</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="font-size:28px;font-weight:800;color:#22c55e;margin-bottom:10px">+${euros}€</div>
      <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6;margin:0">Ton filleul <strong class="text-strong" style="color:#0f0f12">${filleulName}</strong> vient de réaliser sa 2ᵉ vente. Ton bonus de parrainage est crédité sur ton solde et payable lors de ta prochaine demande de virement.</p>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p class="text-secondary" style="font-size:13px;color:#5a5a6a;margin:0;line-height:1.7">Continue d'inviter des amis : à 5 filleuls validés, tu touches 100 € de plus, et 250 € à 10.</p>
    </td></tr>`),
  });
}

// ─── Cold email B2B sequence ────────────────────────────────────────────────

function coldEmailFooter(unsubscribeUrl: string): string {
  return `<tr><td class="divider-strong text-muted" style="padding:24px 32px;border-top:1px solid #e5e7eb;font-size:11px;color:#9898a8;line-height:1.6">
    Vous recevez cet email car votre SIRET figure dans la base publique SIRENE de l'INSEE avec un code NAF compatible avec une activité commerciale. Conformément au RGPD et à notre intérêt légitime de recrutement B2B, vous pouvez vous opposer à tout traitement futur :
    <a href="${unsubscribeUrl}" style="color:#E57A97">se désinscrire</a> · Digitip · privacy@digitip.app
  </td></tr>`;
}

export async function sendColdEmailStep(opts: {
  to: string;
  firstName: string | null;
  city: string | null;
  step: 1 | 2 | 3;
  unsubscribeUrl: string;
  landingUrl: string;
}): Promise<{ ok: boolean; id?: string }> {
  if (!resend) return { ok: false };
  const { to, firstName, city, step, unsubscribeUrl, landingUrl } = opts;
  const greet = firstName ? `Salut ${firstName}` : 'Salut';
  const cityFragment = city ? ` à ${city}` : '';

  const variants: Record<1 | 2 | 3, { subject: string; body: string }> = {
    1: {
      subject: `${firstName ? firstName + ', ' : ''}une idée pour ton activité`,
      body: `<p class="text-primary" style="font-size:14px;color:#0f0f12;line-height:1.6">${greet},</p>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">J'ai trouvé ton SIRET dans la base SIRENE, avec une activité commerciale${cityFragment}. On lance un programme d'ambassadeurs chez Digitip : tu proposes nos plaques de pourboire sans contact aux restos et commerces du coin, et tu touches <strong class="text-strong" style="color:#0f0f12">35 à 45 € par vente</strong>. Pas de stock, rien à avancer.</p>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Si ça t'intéresse, tout est expliqué ici :</p>
        <p><a href="${landingUrl}" style="display:inline-block;padding:10px 18px;background:#E57A97;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Voir le programme →</a></p>`,
    },
    2: {
      subject: `${firstName ? firstName + ', ' : ''}combien ça peut rapporter`,
      body: `<p class="text-primary" style="font-size:14px;color:#0f0f12;line-height:1.6">${greet},</p>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Je reviens vers toi après mon premier mail. Pour te donner un ordre d'idée : à 35 € la vente, <strong class="text-strong" style="color:#0f0f12">10 commerces équipés</strong> dans ton quartier, ça fait 350 €. La plupart se font en un passage, avec la plaque en main.</p>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Si tu veux essayer, le SIRET que tu as déjà suffit :</p>
        <p><a href="${landingUrl}" style="display:inline-block;padding:10px 18px;background:#E57A97;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Postuler en 2 min →</a></p>`,
    },
    3: {
      subject: `Dernier mail`,
      body: `<p class="text-primary" style="font-size:14px;color:#0f0f12;line-height:1.6">${greet},</p>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">C'est mon dernier mail, promis. Si ça ne t'intéresse pas, aucun souci : le lien pour te désinscrire est en bas.</p>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Si tu hésites encore, voilà le lien :</p>
        <p><a href="${landingUrl}" class="outline-btn" style="display:inline-block;padding:10px 18px;background:#f9fafb;color:#0f0f12;text-decoration:none;border-radius:8px;font-weight:600;border:1px solid #e5e7eb">Découvrir Digitip Ambassadeur</a></p>`,
    },
  };

  const v = variants[step];
  const result = await resend.emails.send({
    from: FROM_AMBASSADOR,
    to,
    subject: v.subject,
    html: themedLayout(`
    <tr><td style="padding:28px 32px 20px">
      ${v.body}
    </td></tr>
    ${coldEmailFooter(unsubscribeUrl)}`),
  });
  return { ok: !result.error, id: result.data?.id };
}

// ─── Commercial Pros cold email B2B sequence (sent via Brevo) ──────────────

function coldEmailFooterCommercial(unsubscribeUrl: string): string {
  // B2B-tone unsub footer, references intérêt légitime RGPD article 6§1f and
  // gives the postal address required by Loi Informatique & Libertés. Plain
  // text styling to match the sobriety of the rest of the commercial mails.
  return `<tr><td class="divider-strong text-muted" style="padding:24px 32px;border-top:1px solid #e5e7eb;font-size:11px;color:#9898a8;line-height:1.6">
    Vous recevez ce message à titre professionnel car votre activité figure dans la base publique SIRENE (INSEE) sur un code APE en lien avec une activité de prospection commerciale. Traitement fondé sur notre intérêt légitime de recrutement B2B (art. 6§1 f) du RGPD).
    <br/>Pour vous opposer à tout traitement futur : <a href="${unsubscribeUrl}" style="color:#E57A97">se désinscrire en un clic</a>.
    <br/>YUZU LABS · SIREN 994&nbsp;879&nbsp;013 · 11 rue de Lorraine, 68490 Petit-Landau, France · privacy@digitip.app
  </td></tr>`;
}

/**
 * Sends a single cold-email step to a commercial pro prospect via Brevo.
 *
 * Brevo is used (not Resend) so the sender reputation of the partner-recruitment
 * domain (partenaires.digitip.app) stays fully isolated from digitip.app
 * transactional traffic. A reputational hit on this channel can never spill
 * over to ambassador / customer / contract emails.
 */
export async function sendCommercialColdEmailStep(opts: {
  to: string;
  firstName: string | null;
  companyName: string | null;
  city: string | null;
  step: 1 | 2 | 3;
  unsubscribeUrl: string;
  landingUrl: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { to, firstName, companyName, city, step, unsubscribeUrl, landingUrl } = opts;
  const { brevoSendTransactionalEmail, BREVO_COMMERCIAL_SENDER } = await import('@/lib/brevo/client');

  const greet = firstName ? `Bonjour ${firstName}` : 'Bonjour';
  const companyMention = companyName ? ` (${companyName})` : '';
  const cityFragment = city ? ` à ${city}` : '';

  const variants: Record<1 | 2 | 3, { subject: string; body: string }> = {
    1: {
      subject: firstName
        ? `${firstName}, un partenariat à étudier, apport d'affaires B2B`
        : `Un partenariat à étudier, apport d'affaires B2B`,
      body: `<p class="text-primary" style="font-size:14px;color:#0f0f12;line-height:1.6">${greet},</p>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Je suis Raphaël Meyer, fondateur de Digitip. On fait une plaque qui permet de laisser un pourboire par carte, pour les commerces de proximité : restaurants, bars, cafés, hôtels, salons, instituts. Votre activité${companyMention}${cityFragment} m'a fait penser que vous pourriez nous présenter à des commerçants, en apporteur d'affaires.</p>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Tout est cadré : un vrai contrat d'apporteur d'affaires, une facturation entre professionnels, des paiements par Stripe, sans exclusivité ni quota. Côté commerçant, la décision se prend en un ou deux rendez-vous : depuis que plus personne n'a de monnaie, le pourboire se perd, et la plaque règle ça.</p>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Si ça vous intéresse, la candidature prend 2 minutes :</p>
        <p><a href="${landingUrl}" style="display:inline-block;padding:11px 20px;background:#0f0f12;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Découvrir le programme partenaire →</a></p>
        <p class="text-secondary" style="font-size:13px;color:#5a5a6a;line-height:1.6;margin-top:18px">Cordialement,<br/>Raphaël Meyer · Fondateur Digitip</p>`,
    },
    2: {
      subject: firstName
        ? `${firstName}, complément d'information sur Digitip`
        : `Complément d'information sur Digitip`,
      body: `<p class="text-primary" style="font-size:14px;color:#0f0f12;line-height:1.6">${greet},</p>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Je reviens vers vous après mon premier message, avec quelques précisions :</p>
        <ul style="font-size:14px;color:#5a5a6a;line-height:1.7;margin:8px 0 14px;padding-left:22px">
          <li>Une commission fixe par vente, dont je vous envoie le détail si vous me répondez</li>
          <li>Pas de stock à avancer, rien à investir</li>
          <li>Paiement par Stripe dès 30&nbsp;€ de solde, avec un contrat signé</li>
          <li>Votre propre code commercial, et un tableau de bord pour suivre vos ventes</li>
        </ul>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Pour en parler, répondez simplement à ce mail, ou candidatez en 2 minutes ici :</p>
        <p><a href="${landingUrl}" style="display:inline-block;padding:11px 20px;background:#0f0f12;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Programme partenaire Digitip →</a></p>
        <p class="text-secondary" style="font-size:13px;color:#5a5a6a;line-height:1.6;margin-top:18px">Cordialement,<br/>Raphaël Meyer · Fondateur Digitip</p>`,
    },
    3: {
      subject: firstName
        ? `${firstName}, dernier message`
        : `Dernier message`,
      body: `<p class="text-primary" style="font-size:14px;color:#0f0f12;line-height:1.6">${greet},</p>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">C'est mon dernier message sur le sujet. Si ça ne correspond pas à votre activité, aucun souci : le lien de désinscription est en bas de ce mail, et je ne vous écrirai plus.</p>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Si vous voulez en savoir plus, voici le lien une dernière fois :</p>
        <p><a href="${landingUrl}" style="display:inline-block;padding:10px 18px;background:#f9fafb;color:#0f0f12;text-decoration:none;border-radius:8px;font-weight:600;border:1px solid #e5e7eb">Programme partenaire Digitip</a></p>
        <p class="text-secondary" style="font-size:13px;color:#5a5a6a;line-height:1.6;margin-top:18px">Bien cordialement,<br/>Raphaël Meyer · Fondateur Digitip</p>`,
    },
  };

  const v = variants[step];

  // List-Unsubscribe + List-Unsubscribe-Post are required by Gmail/Outlook
  // bulk-sender rules (Feb 2024) for senders going beyond ~100/day.
  const result = await brevoSendTransactionalEmail({
    sender: { email: BREVO_COMMERCIAL_SENDER.email, name: BREVO_COMMERCIAL_SENDER.name },
    to: [{ email: to, name: firstName ?? undefined }],
    replyTo: { email: BREVO_COMMERCIAL_SENDER.email, name: BREVO_COMMERCIAL_SENDER.name },
    subject: v.subject,
    htmlContent: themedLayout(`
    <tr><td style="padding:28px 32px 20px">
      ${v.body}
    </td></tr>
    ${coldEmailFooterCommercial(unsubscribeUrl)}`),
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, id: result.messageId };
}

// ─── Staff invite — admin invites a colleague to join an establishment ───────

export async function sendStaffInviteEmail(opts: {
  to: string;
  fullName: string;
  establishmentName: string;
  inviteUrl: string;
  locale?: string;
}): Promise<{ ok: boolean }> {
  if (!resend) return { ok: false };
  const { to, fullName, establishmentName, inviteUrl, locale = 'fr' } = opts;
  const isFr = locale === 'fr';

  const subject = isFr
    ? `Vous êtes invité(e) à rejoindre ${establishmentName} sur Digitip`
    : `You're invited to join ${establishmentName} on Digitip`;

  const heading = isFr ? 'Bienvenue dans l\'équipe' : 'Welcome to the team';
  const intro = isFr
    ? `<strong class="text-strong" style="color:#0f0f12">${establishmentName}</strong> vous invite à rejoindre Digitip pour recevoir vos pourboires directement sur votre compte bancaire.`
    : `<strong class="text-strong" style="color:#0f0f12">${establishmentName}</strong> is inviting you to join Digitip and receive tips straight into your bank account.`;
  const ctaLabel = isFr ? 'Créer mon compte' : 'Create my account';
  const helper = isFr
    ? `Ce lien vous emmène directement à l'onboarding avec votre email pré-rempli (${to}). Aucun mot de passe : nous vous enverrons un code à 6 chiffres pour confirmer votre adresse.`
    : `This link takes you straight to onboarding with your email pre-filled (${to}). No password: we will send you a 6 digit code to confirm your address.`;
  const greeting = isFr ? `Bonjour ${fullName},` : `Hi ${fullName},`;
  const footer = isFr
    ? 'Si vous n\'attendiez pas cette invitation, vous pouvez ignorer ce message.'
    : 'If you weren\'t expecting this invitation, you can safely ignore this message.';

  const result = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">${isFr ? 'Invitation équipe' : 'Team invite'}</div>
    </td></tr>
    <tr><td style="padding:28px 32px 12px">
      <div class="text-primary" style="font-size:24px;font-weight:800;color:#0f0f12;margin-bottom:10px">${heading}</div>
      <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6;margin:0 0 8px">${greeting}</p>
      <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6;margin:0">${intro}</p>
    </td></tr>
    <tr><td style="padding:8px 32px 8px">
      <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 22px;background:#E57A97;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">${ctaLabel} →</a></p>
    </td></tr>
    <tr><td style="padding:8px 32px 32px">
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:0 0 16px;line-height:1.6">${helper}</p>
      <p class="text-muted" style="font-size:11px;color:#9898a8;margin:0;line-height:1.6">${footer}</p>
    </td></tr>`),
  });
  return { ok: !result.error };
}

// ─── Lifecycle / automated emails ─────────────────────────────────────────────
// Personalized onboarding, activation and retention emails (FR), consistent
// with the cold-email / ambassador communication families. Each function
// returns the Resend message id (null when email is disabled) and THROWS on a
// send error so the lifecycle engine (lib/email/lifecycle.ts) records a 'failed'
// log row.

const LIFECYCLE_TONE: Record<'green' | 'pink' | 'blue' | 'amber', string> = {
  green: '#22c55e', pink: '#E57A97', blue: '#60a5fa', amber: '#f59e0b',
};

function lifecycleFooter(unsubscribeUrl: string | null | undefined): string {
  if (!unsubscribeUrl) return '';
  return `<tr><td class="divider-strong text-muted" style="padding:20px 32px;border-top:1px solid #e5e7eb;font-size:11px;color:#9898a8;line-height:1.6">
    Vous recevez ces conseils pour tirer le meilleur de Digitip. Vous pouvez
    <a href="${unsubscribeUrl}" style="color:#E57A97">ne plus recevoir ces emails</a>. · Digitip · contact@digitip.app
  </td></tr>`;
}

function lifecycleBody(opts: {
  badge: string;
  tone: 'green' | 'pink' | 'blue' | 'amber';
  title: string;
  intro: string;
  bullets?: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  note?: string;
  unsubscribeUrl?: string | null;
}): string {
  const tone = LIFECYCLE_TONE[opts.tone];
  const bullets = opts.bullets && opts.bullets.length
    ? `<tr><td style="padding:6px 32px 2px">
        <table width="100%" cellpadding="0" cellspacing="0" class="panel" style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb">
          <tr><td style="padding:14px 18px">
            <div class="text-secondary" style="font-size:13.5px;color:#5a5a6a;line-height:1.85">
              ${opts.bullets.map((b) => `<div>${b}</div>`).join('')}
            </div>
          </td></tr>
        </table></td></tr>`
    : '';
  const cta = opts.ctaLabel && opts.ctaUrl
    ? `<tr><td style="padding:18px 32px 6px">
        <a href="${opts.ctaUrl}" style="display:inline-block;padding:13px 26px;background:#E57A97;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px">${opts.ctaLabel}</a>
      </td></tr>`
    : '';
  const note = opts.note
    ? `<tr><td style="padding:14px 32px 30px"><p class="text-muted" style="font-size:12px;color:#9898a8;margin:0;line-height:1.6">${opts.note}</p></td></tr>`
    : `<tr><td style="padding:0 0 14px"></td></tr>`;
  return `
    <tr><td class="divider" style="padding:30px 32px 20px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
    </td></tr>
    <tr><td style="padding:26px 32px 0">
      <div style="display:inline-block;background:${tone}22;color:${tone};font-size:12px;font-weight:700;padding:4px 11px;border-radius:20px;margin-bottom:14px">● ${opts.badge}</div>
      <div class="text-primary" style="font-size:23px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;line-height:1.32">${opts.title}</div>
    </td></tr>
    <tr><td style="padding:14px 32px 8px">
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.7">${opts.intro}</div>
    </td></tr>
    ${bullets}
    ${cta}
    ${note}
    ${lifecycleFooter(opts.unsubscribeUrl)}`;
}

async function lifecycleSend(to: string, subject: string, inner: string): Promise<{ id: string | null }> {
  // Must throw, not return quietly.
  //
  // The lifecycle engine writes a `pending` row, calls this, and marks the row
  // `sent` on success or `failed` on throw. Returning { id: null } here made it
  // record a send that never happened, and because lifecycle_email_log has a
  // partial unique index on dedup_key WHERE status IN ('pending','sent'), that
  // row then blocked the same email to the same recipient forever, including
  // after the API key was finally configured. `failed` rows are outside the
  // index, so throwing keeps the send retryable.
  if (!resend) {
    throw new Error(
      'RESEND_API_KEY is not configured, refusing to record a lifecycle email as sent.'
    );
  }
  const result = await resend.emails.send({ from: FROM, to, subject, html: themedLayout(inner) });
  if (result.error) throw new Error(result.error.message || 'Resend send failed');
  return { id: result.data?.id ?? null };
}

function money(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** Group admin, onboarding not completed (J+2 = step 1, J+5 = step 2). */
export async function sendGroupOnboardingNudge(opts: {
  to: string; firstName: string; setupUrl: string; step: 1 | 2; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, setupUrl, step, unsubscribeUrl } = opts;
  if (step === 1) {
    return lifecycleSend(to, `${firstName}, il reste 2 minutes pour finir votre espace Digitip`,
      lifecycleBody({
        badge: 'Configuration', tone: 'pink',
        title: `${firstName}, votre espace Digitip n'est pas encore créé`,
        intro: `Votre commande est bien passée. Il ne reste qu'à créer votre espace, ça prend <strong class="text-strong" style="color:#0f0f12">moins de 2 minutes</strong> : le nom de l'établissement, votre équipe, et c'est prêt.`,
        ctaLabel: 'Configurer mon espace →', ctaUrl: setupUrl,
        note: 'Une question ? Répondez simplement à cet e-mail.',
        unsubscribeUrl,
      }));
  }
  return lifecycleSend(to, `${firstName}, vos plaques ne peuvent pas encore recevoir de pourboire`,
    lifecycleBody({
      badge: 'À finir', tone: 'amber',
      title: `${firstName}, votre espace n'est toujours pas configuré`,
      intro: `Tant qu'il ne l'est pas, <strong class="text-strong" style="color:#0f0f12">vos clients ne peuvent pas laisser de pourboire</strong> sur vos plaques. Ça prend 2 minutes.`,
      ctaLabel: 'Configurer mon espace →', ctaUrl: setupUrl,
      note: 'Bloqué quelque part ? Répondez à cet e-mail, on vous aide.',
      unsubscribeUrl,
    }));
}

/**
 * Sent on request from the scan of a plaque that is not activated yet: the
 * link opens the setup wizard from the first step. Transactional (the owner
 * asked for it), so no unsubscribe link.
 */
export async function sendPlaqueActivationLink(opts: {
  to: string; firstName: string; setupUrl: string;
}): Promise<{ id: string | null }> {
  const { to, firstName, setupUrl } = opts;
  return lifecycleSend(to, `${firstName}, voici le lien pour activer votre plaque`,
    lifecycleBody({
      badge: 'Activation', tone: 'pink',
      title: `${firstName}, activez votre plaque Digitip`,
      intro: `Vous venez de scanner votre plaque. Cliquez sur le bouton pour configurer votre établissement : ça prend <strong class="text-strong" style="color:#0f0f12">2 minutes</strong>, et vos clients pourront ensuite laisser des pourboires.`,
      ctaLabel: 'Activer ma plaque →', ctaUrl: setupUrl,
      note: 'Le lien marche pendant 7 jours. Si vous n\'avez rien demandé, ignorez cet e-mail.',
    }));
}

/** Group admin, hardware delivered, no tip yet: place the tag. */
export async function sendTagDeliveredPlaceNudge(opts: {
  to: string; firstName: string; establishmentName: string; dashboardUrl: string; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, dashboardUrl, unsubscribeUrl } = opts;
  return lifecycleSend(to, `${firstName}, vos plaques sont arrivées`,
    lifecycleBody({
      badge: 'Livré', tone: 'green',
      title: `${firstName}, vos plaques sont livrées`,
      intro: `Les plaques de <strong class="text-strong" style="color:#0f0f12">${escapeHtml(establishmentName)}</strong> sont arrivées. Le mieux, c'est d'en poser une <strong class="text-strong" style="color:#0f0f12">aujourd'hui</strong>, là où le client la voit :`,
      bullets: [
        'Sur le comptoir ou près de la caisse',
        'Scannez-la une fois avec votre téléphone pour vérifier qu\'elle marche',
        'Dites à l\'équipe de la montrer aux clients',
      ],
      ctaLabel: 'Voir mon tableau de bord →', ctaUrl: dashboardUrl,
      note: 'Une plaque posée le jour de la livraison reçoit bien plus de pourboires la première semaine.',
      unsubscribeUrl,
    }));
}

/** Group admin, onboarded but team is empty: invite staff. */
export async function sendInviteTeamNudge(opts: {
  to: string; firstName: string; establishmentName: string; inviteUrl: string; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, inviteUrl, unsubscribeUrl } = opts;
  return lifecycleSend(to, `${firstName}, votre équipe n'est pas encore sur Digitip`,
    lifecycleBody({
      badge: 'Votre équipe', tone: 'pink',
      title: `${firstName}, ajoutez votre équipe`,
      intro: `Personne n'est encore ajouté chez <strong class="text-strong" style="color:#0f0f12">${escapeHtml(establishmentName)}</strong>. Une fois dans l'équipe, chacun apparaît sur la page de pourboire, et le client peut choisir à qui laisser le sien. Ça motive.`,
      ctaLabel: 'Ajouter mon équipe →', ctaUrl: inviteUrl,
      note: 'Le plus rapide : envoyez le lien d\'équipe par SMS, chacun s\'inscrit en 2 minutes.',
      unsubscribeUrl,
    }));
}

/**
 * Group admin, some staff profiles have no email, so they can never be paid.
 *
 * Addressed to the admin rather than the staff member on purpose: a profile
 * with user_id NULL has no address and no account, so no staff-audience email
 * can reach it. Recurring, because the situation persists until the admin acts
 * and it silently caps the establishment's tip volume for as long as it does.
 */
export async function sendStaffMissingEmailNudge(opts: {
  to: string; firstName: string; establishmentName: string; count: number;
  staffUrl: string; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, count, staffUrl, unsubscribeUrl } = opts;
  const people = count === 1 ? 'une personne' : `${count} personnes`;
  const verb = count === 1 ? 'ne peut' : 'ne peuvent';
  return lifecycleSend(to, `${firstName}, ${people} de votre équipe ${verb} pas être payée`,
    lifecycleBody({
      badge: 'Équipe', tone: 'amber',
      title: `${people} ${verb} pas recevoir de pourboires`,
      intro: `Chez <strong class="text-strong" style="color:#0f0f12">${escapeHtml(establishmentName)}</strong>, ${people} ${count === 1 ? 'a été ajoutée' : 'ont été ajoutées'} sans adresse e-mail. Sans e-mail, on ne peut pas envoyer d'invitation, donc pas de compte, et les pourboires qui leur sont destinés ne peuvent pas leur être attribués.`,
      ctaLabel: 'Ajouter leur e-mail →', ctaUrl: staffUrl,
      note: 'Dès que l\'adresse est ajoutée, l\'invitation part toute seule.',
      unsubscribeUrl,
    }));
}

/** Group admin, live for a while, still zero succeeded tips. */
export async function sendActivationNudge(opts: {
  to: string; firstName: string; establishmentName: string; dashboardUrl: string; daysSince: number; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, dashboardUrl, daysSince, unsubscribeUrl } = opts;
  return lifecycleSend(to, `${firstName}, toujours aucun pourboire chez ${establishmentName}`,
    lifecycleBody({
      badge: 'Démarrage', tone: 'amber',
      title: `${firstName}, votre plaque n'a encore rien reçu`,
      intro: `<strong class="text-strong" style="color:#0f0f12">${escapeHtml(establishmentName)}</strong> est prêt depuis ${daysSince} jours, mais aucun pourboire n'est passé. En général, c'est l'une de ces raisons :`,
      bullets: [
        'La plaque est rangée ou cachée : mettez-la sur le comptoir, bien en vue',
        'L\'équipe n\'en parle pas : un simple « vous pouvez laisser un pourboire ici » suffit',
        'Elle n\'a jamais été testée : scannez-la pour voir si elle répond',
      ],
      ctaLabel: 'Voir mon tableau de bord →', ctaUrl: dashboardUrl,
      note: 'Toujours bloqué ? Répondez à cet e-mail et on regarde avec vous.',
      unsubscribeUrl,
    }));
}

/** Staff, invitation not yet claimed (J+3 = step 1, J+7 = step 2). */
export async function sendStaffInviteReminder(opts: {
  to: string; firstName: string; establishmentName: string; joinUrl: string; step: 1 | 2; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, joinUrl, step, unsubscribeUrl } = opts;
  const subject = step === 1
    ? `${firstName}, ${establishmentName} vous invite dans son équipe`
    : `${firstName}, votre compte Digitip n'est pas encore activé`;
  return lifecycleSend(to, subject,
    lifecycleBody({
      badge: 'Invitation', tone: 'pink',
      title: `${firstName}, activez votre compte Digitip`,
      intro: `<strong class="text-strong" style="color:#0f0f12">${escapeHtml(establishmentName)}</strong> vous invite à rejoindre son équipe sur Digitip. Activez votre compte pour apparaître sur la page de pourboire : vos clients pourront vous en laisser un à votre nom, et vous le verrez arriver.`,
      ctaLabel: 'Activer mon compte →', ctaUrl: joinUrl,
      note: step === 2
        ? 'Tant que votre compte n\'est pas activé, les clients ne peuvent pas vous choisir.'
        : 'Ça prend une minute. Votre établissement vous reverse ensuite vos pourboires avec la paie.',
      unsubscribeUrl,
    }));
}

/** Staff, account claimed but Stripe banking not started (J+1 / J+3 / J+7). */
export async function sendStaffBankingNudge(opts: {
  to: string; firstName: string; bankingUrl: string; step: 1 | 2 | 3; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, bankingUrl, step, unsubscribeUrl } = opts;
  const subject = step === 3
    ? `${firstName}, vos pourboires sont en attente`
    : `${firstName}, reliez votre compte pour recevoir vos pourboires`;
  return lifecycleSend(to, subject,
    lifecycleBody({
      badge: 'Compte bancaire', tone: step === 3 ? 'amber' : 'blue',
      title: `${firstName}, une dernière étape : votre RIB`,
      intro: `Vos pourboires ne peuvent pas vous être versés tant que votre compte bancaire n'est pas relié. C'est <strong class="text-strong" style="color:#0f0f12">2 minutes</strong>, sécurisé par Stripe, et vous n'avez plus jamais à y revenir.`,
      ctaLabel: 'Relier mon compte →', ctaUrl: bankingUrl,
      note: step === 3
        ? 'Chaque pourboire reçu reste en attente tant que votre RIB n\'est pas renseigné.'
        : 'Vos coordonnées bancaires sont gérées par Stripe, Digitip n\'y a jamais accès.',
      unsubscribeUrl,
    }));
}

/** Staff, tips captured but HELD because identity/banking isn't set up yet.
 *  Escalates J+7 (1) / J+30 (2) / J+60 (3); step 3 warns before the 90-day
 *  auto-refund. `amount` is a pre-formatted currency string. */
export async function sendUnclaimedTipsReminder(opts: {
  to: string; firstName: string; amount: string; bankingUrl: string; step: 1 | 2 | 3; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, amount, bankingUrl, step, unsubscribeUrl } = opts;
  const subject = step === 3
    ? `${firstName}, vos ${amount} de pourboires expirent bientôt`
    : `${firstName}, vous avez ${amount} de pourboires à récupérer`;
  return lifecycleSend(to, subject,
    lifecycleBody({
      badge: 'Pourboires en attente', tone: step === 1 ? 'pink' : 'amber',
      title: step === 3
        ? `${firstName}, dernière étape avant expiration`
        : `${firstName}, vos pourboires vous attendent`,
      intro: step === 3
        ? `Vous avez <strong class="text-strong" style="color:#0f0f12">${escapeHtml(amount)}</strong> de pourboires en attente. Sans vérification d'identité, ils seront <strong class="text-strong" style="color:#0f0f12">remboursés au client après 90 jours</strong>. Récupérez-les maintenant, 2 minutes, sécurisé par Stripe.`
        : `Vous avez déjà <strong class="text-strong" style="color:#0f0f12">${escapeHtml(amount)}</strong> de pourboires sur Digitip. Pour les recevoir sur votre compte, confirmez votre identité, 2 minutes, sécurisé par Stripe, à faire une seule fois.`,
      ctaLabel: 'Récupérer mes pourboires →', ctaUrl: bankingUrl,
      note: step === 3
        ? 'Après 90 jours, les pourboires non réclamés sont automatiquement remboursés au client.'
        : 'Vos coordonnées bancaires sont gérées par Stripe, Digitip n\'y a jamais accès.',
      unsubscribeUrl,
    }));
}

/** Staff, Stripe banking just completed (transactional). */
export async function sendStaffBankingComplete(opts: {
  to: string; firstName: string;
}): Promise<{ id: string | null }> {
  const { to, firstName } = opts;
  return lifecycleSend(to, `${firstName}, votre compte est prêt`,
    lifecycleBody({
      badge: 'Compte activé', tone: 'green',
      title: `${firstName}, c'est bon, votre compte est prêt`,
      intro: `Votre compte bancaire est relié et vérifié. Les pourboires qu'on vous laisse sur la plaque <strong class="text-strong" style="color:#0f0f12">vous seront versés sur ce compte</strong>. Il ne reste qu'à en parler à vos clients.`,
      note: 'Le pourboire est encaissé par Digitip via Stripe, puis versé sur votre compte.',
    }));
}

/** Group admin, establishment received its very first tip. */
export async function sendFirstTipCelebration(opts: {
  to: string; firstName: string; amount: number; currency: string; establishmentName: string; dashboardUrl: string; unsubscribeUrl?: string | null;
  /** Set when this tip just started the cardless Pro trial. */
  proTrial?: { hasReviewLink: boolean } | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, amount, currency, establishmentName, dashboardUrl, unsubscribeUrl, proTrial } = opts;
  // The trial is said here because this is the one email certain to be read
  // the day it starts. Without it, the first a manager hears of Pro is the
  // email saying it ends in three days.
  const trialBullets = proTrial
    ? [
        '🎁 Au passage, on vous offre Digitip Pro pendant 30 jours, sans carte. Après chaque pourboire, vos clients peuvent maintenant laisser un avis Google et un petit mot au serveur.',
        ...(proTrial.hasReviewLink
          ? []
          : ['⭐ Pour que le bouton d\'avis s\'affiche, reliez votre fiche Google dans Établissements.']),
      ]
    : [];
  return lifecycleSend(to, `${establishmentName} a reçu son premier pourboire`,
    lifecycleBody({
      badge: 'Premier pourboire', tone: 'green',
      title: `${firstName}, premier pourboire reçu chez ${escapeHtml(establishmentName)}`,
      intro: `Un client vient de laisser <strong class="text-strong" style="color:#0f0f12">${money(amount, currency)}</strong> avec votre plaque. Ça marche ! Pour que ça continue :`,
      bullets: [
        'Mettez une plaque à chaque poste ou près de chaque caisse',
        'Demandez à l\'équipe d\'en parler au moment de payer',
        ...trialBullets,
      ],
      ctaLabel: 'Voir mes pourboires →', ctaUrl: dashboardUrl,
      unsubscribeUrl,
    }));
}

/** Staff, cumulative earnings crossed a milestone (€100 / €500). */
export async function sendEarningsMilestone(opts: {
  to: string; firstName: string; milestoneAmount: number; currency: string; dashboardUrl: string; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, milestoneAmount, currency, dashboardUrl, unsubscribeUrl } = opts;
  return lifecycleSend(to, `${firstName}, vous avez dépassé ${money(milestoneAmount, currency)} de pourboires`,
    lifecycleBody({
      badge: 'Palier atteint', tone: 'green',
      title: `${firstName}, déjà ${money(milestoneAmount, currency)} de pourboires`,
      intro: `Vos pourboires Digitip viennent de passer <strong class="text-strong" style="color:#0f0f12">${money(milestoneAmount, currency)}</strong> au total. Bravo, et continuez à montrer la plaque à vos clients.`,
      ctaLabel: 'Voir mon total →', ctaUrl: dashboardUrl,
      unsubscribeUrl,
    }));
}

/** Group admin, establishment was active then went quiet (recurring). */
export async function sendReEngagementEmail(opts: {
  to: string; firstName: string; establishmentName: string; daysQuiet: number; dashboardUrl: string; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, daysQuiet, dashboardUrl, unsubscribeUrl } = opts;
  return lifecycleSend(to, `${firstName}, ${daysQuiet} jours sans pourboire chez ${establishmentName}`,
    lifecycleBody({
      badge: 'Calme plat', tone: 'amber',
      title: `${firstName}, plus de pourboire depuis ${daysQuiet} jours`,
      intro: `Chez <strong class="text-strong" style="color:#0f0f12">${escapeHtml(establishmentName)}</strong>, rien n'est passé depuis ${daysQuiet} jours. Le plus souvent, c'est que la plaque n'est plus en vue. Quelques vérifications :`,
      bullets: [
        'La plaque est-elle toujours à sa place, bien visible ?',
        'L\'équipe en parle-t-elle encore aux clients ?',
        'Scannez-la pour voir si elle répond toujours',
      ],
      ctaLabel: 'Voir mon tableau de bord →', ctaUrl: dashboardUrl,
      note: 'Si quelque chose cloche, répondez à cet e-mail et on regarde avec vous.',
      unsubscribeUrl,
    }));
}

/** Group admin, weekly recap of tips collected (recurring, Mondays). */
export async function sendWeeklyTipRecap(opts: {
  to: string; firstName: string; establishmentName: string; weekTotal: number; tipCount: number; currency: string; dashboardUrl: string; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, weekTotal, tipCount, currency, dashboardUrl, unsubscribeUrl } = opts;
  return lifecycleSend(to, `${establishmentName} : ${money(weekTotal, currency)} de pourboires cette semaine`,
    lifecycleBody({
      badge: 'Récap de la semaine', tone: 'green',
      title: `${firstName}, ${money(weekTotal, currency)} de pourboires cette semaine`,
      intro: `Cette semaine, les clients de <strong class="text-strong" style="color:#0f0f12">${escapeHtml(establishmentName)}</strong> ont laissé <strong class="text-strong" style="color:#0f0f12">${tipCount} pourboire${tipCount > 1 ? 's' : ''}</strong>, pour <strong class="text-strong" style="color:#0f0f12">${money(weekTotal, currency)}</strong> en tout.`,
      ctaLabel: 'Voir le détail →', ctaUrl: dashboardUrl,
      unsubscribeUrl,
    }));
}

/**
 * Group admin, three days before the Pro trial converts (transactional).
 *
 * The one email a trial owes its customer. It leads with what the trial
 * actually produced, because that is the only argument that survives contact
 * with a manager deciding whether to keep paying, and it says the price and
 * the date plainly: a subscription that starts charging without warning is how
 * a trial turns into a chargeback and a bad review.
 */
export async function sendTrialEndingSoon(opts: {
  to: string; firstName: string; establishmentName: string; daysLeft: number;
  priceLabel: string | null; tipCount: number; clickCount: number;
  billingUrl: string;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, daysLeft, priceLabel, tipCount, clickCount, billingUrl } = opts;
  const days = `${daysLeft} jour${daysLeft > 1 ? 's' : ''}`;

  // What the trial did, or an honest admission that it has nothing to show.
  // A month with no clicks is a reason to keep the plaque visible, not a
  // reason to write a sentence that implies otherwise.
  const evidence = tipCount > 0
    ? `Pendant votre essai, <strong class="text-strong" style="color:#0f0f12">${clickCount} client${clickCount > 1 ? 's' : ''} sur ${tipCount}</strong> ${clickCount > 1 ? 'ont' : 'a'} ouvert votre fiche Google après leur pourboire.`
    : `Aucun pourboire n'est passé pendant votre essai, donc on n'a pas encore pu vous montrer ce que donne le bouton d'avis chez vous.`;

  return lifecycleSend(to, `${firstName}, votre essai Digitip Pro se termine dans ${days}`,
    lifecycleBody({
      badge: 'Fin d\'essai', tone: 'amber',
      title: `${firstName}, votre essai se termine dans ${days}`,
      intro: `${evidence} À la fin de l'essai${priceLabel ? `, l'abonnement de ${escapeHtml(establishmentName)} passe à <strong class="text-strong" style="color:#0f0f12">${escapeHtml(priceLabel)} HT par mois</strong>` : `, l'abonnement de ${escapeHtml(establishmentName)} démarre`}. Si vous ne voulez pas continuer, résiliez avant : vous ne paierez rien.`,
      ctaLabel: 'Gérer mon abonnement →', ctaUrl: billingUrl,
      note: 'Vos pourboires continuent d\'arriver quoi qu\'il arrive, ils ne dépendent pas de l\'abonnement.',
    }));
}

/**
 * Group admin, three days before the cardless Pro trial ends.
 *
 * The mirror of sendTrialEndingSoon, with the opposite reassurance: no card
 * is on file, so the risk is not a surprise charge but Pro switching off
 * unnoticed. It leads with what the trial did, in the same figures as the
 * dashboard, and says plainly that doing nothing costs nothing.
 */
export async function sendFreeTrialEndingSoon(opts: {
  to: string; firstName: string; establishmentName: string; daysLeft: number; endDate: string;
  priceLabel: string | null; tipCount: number; clickCount: number; complimentCount: number;
  billingUrl: string;
}): Promise<{ id: string | null }> {
  const {
    to, firstName, establishmentName, daysLeft, endDate, priceLabel, tipCount, clickCount,
    complimentCount, billingUrl,
  } = opts;
  const days = `${daysLeft} jour${daysLeft > 1 ? 's' : ''}`;
  const s = (n: number) => (n > 1 ? 's' : '');
  const bullets = tipCount > 0
    ? [
        `${clickCount} client${s(clickCount)} sur ${tipCount} ${clickCount > 1 ? 'ont' : 'a'} ouvert votre fiche Google après leur pourboire`,
        `${complimentCount} petit${s(complimentCount)} mot${s(complimentCount)} pour l'équipe`,
      ]
    : [];
  return lifecycleSend(to, `${firstName}, votre essai Digitip Pro se termine dans ${days}`,
    lifecycleBody({
      badge: 'Fin d\'essai', tone: 'amber',
      title: `${firstName}, votre essai Pro se termine le ${escapeHtml(endDate)}`,
      intro: tipCount > 0
        ? `Depuis le début de l'essai, chez ${escapeHtml(establishmentName)} :`
        : `Aucun pourboire n'est passé pendant l'essai, donc on n'a rien à vous montrer pour l'instant.`,
      bullets,
      ctaLabel: 'Continuer avec Pro →', ctaUrl: billingUrl,
      note: `Vous n'avez pas donné de carte, donc si vous ne faites rien, Pro s'arrête simplement le ${escapeHtml(endDate)} et vous ne payez rien.${priceLabel ? ` Pour continuer, c'est ${escapeHtml(priceLabel)} HT par mois, sans engagement.` : ''} Vos pourboires et vos relevés ne changent pas.`,
    }));
}

/** Staff, a Stripe payout failed (transactional). */
export async function sendPayoutFailedAlert(opts: {
  to: string; firstName: string; bankingUrl: string;
}): Promise<{ id: string | null }> {
  const { to, firstName, bankingUrl } = opts;
  return lifecycleSend(to, `${firstName}, un virement de vos pourboires n'est pas passé`,
    lifecycleBody({
      badge: 'À vérifier', tone: 'amber',
      title: `${firstName}, un virement n'est pas passé`,
      intro: `Un virement de vos pourboires a été refusé par la banque. Presque toujours, c'est un RIB faux ou qui n'est plus valable. Vérifiez vos coordonnées bancaires pour que les virements reprennent.`,
      ctaLabel: 'Vérifier mon RIB →', ctaUrl: bankingUrl,
      note: 'L\'argent n\'est pas perdu : il sera versé dès que votre compte sera à jour.',
    }));
}

// ─── Monthly payroll statement (every plan since 00088) ───────────────────────

/**
 * The monthly statement, delivered rather than downloaded. An export the
 * manager has to remember to run every month is still a chore; one that lands
 * in their accountant's inbox on its own is not.
 */
export async function sendMonthlyStatement(opts: {
  to: string[];
  establishmentName: string;
  monthLabel: string;
  staffCount: number;
  totalFormatted: string;
  summaryCsv: string;
  journalCsv: string;
  month: string;
  locale: 'fr' | 'en';
}): Promise<void> {
  if (!resend) return;
  const { to, establishmentName, monthLabel, staffCount, totalFormatted, month, locale } = opts;

  const fr = locale === 'fr';
  const subject = fr
    ? `Relevé des pourboires de ${monthLabel}, ${establishmentName}`
    : `Tip statement for ${monthLabel}, ${establishmentName}`;

  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">${fr ? 'Relevé mensuel' : 'Monthly statement'}</div>
    </td></tr>
    <tr><td style="padding:28px 32px">
      <div class="text-primary" style="font-size:18px;font-weight:700;color:#0f0f12;margin-bottom:10px">${establishmentName}, ${monthLabel}</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">
        ${fr
          ? `Ce mois-ci, <strong class="text-strong" style="color:#0f0f12">${totalFormatted}</strong> de pourboires pour ${staffCount} ${staffCount > 1 ? 'personnes' : 'personne'}.`
          : `<strong class="text-strong" style="color:#0f0f12">${totalFormatted}</strong> in tips to distribute across ${staffCount} ${staffCount > 1 ? 'people' : 'person'} this month.`}
      </div>
    </td></tr>
    <tr><td style="padding:0 32px 28px">
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;line-height:1.6">
        ${fr
          ? 'Il y a deux fichiers joints. Le premier donne le total par personne, pour la paie. Le second liste chaque pourboire, pour le rapprocher du relevé bancaire.'
          : 'Two files are attached: the per-employee summary for payroll, and the detailed journal of every tip for bank reconciliation.'}
      </div>
    </td></tr>`),
    attachments: [
      {
        filename: `releve-pourboires-${month}.csv`,
        content: Buffer.from(opts.summaryCsv, 'utf8').toString('base64'),
      },
      {
        filename: `journal-pourboires-${month}.csv`,
        content: Buffer.from(opts.journalCsv, 'utf8').toString('base64'),
      },
    ],
  });
}
