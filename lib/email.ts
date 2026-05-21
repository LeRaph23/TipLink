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

function themedLayout(content: string) {
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
      <span class="text-muted" style="font-size:11px;color:#9898a8">© Digitip · Cashless tips via NFC</span>
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
    solo: { fr: 'Solo (1 SmartTag)', en: 'Solo (1 SmartTag)' },
    duo:  { fr: 'Duo (2 SmartTags)',  en: 'Duo (2 SmartTags)' },
  };
  return names[pack]?.[locale] ?? pack.toUpperCase();
}

// ─── Tip receipt ──────────────────────────────────────────────────────────────

export async function sendTipReceipt(opts: {
  to: string;
  amount: number;
  currency: string;
  staffName: string;
  establishmentName: string;
  transactionId: string;
}): Promise<void> {
  if (!resend) return;

  const { to, amount, currency, staffName, establishmentName, transactionId } = opts;
  const fmt = new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2 });
  const formatted = fmt.format(amount / 100);
  const shortRef = transactionId.slice(0, 8).toUpperCase();

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your tip receipt — ${formatted}`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Tip receipt</div>
    </td></tr>
    <tr><td style="padding:28px 32px">
      <div class="text-primary" style="font-size:40px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:4px">${formatted}</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a">Tip sent to <strong class="text-strong" style="color:#0f0f12">${staffName}</strong> at ${establishmentName}</div>
    </td></tr>
    <tr><td style="padding:0 32px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" class="panel" style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden">
        ${infoRow('Status', '<span style="color:#22c55e;font-weight:600">● Succeeded</span>')}
        ${infoRow('Reference', `<span style="font-family:monospace">${shortRef}</span>`)}
        ${infoRow('Processor', 'Stripe ✓')}
      </table>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:0;line-height:1.6">
        Your payment went directly to ${staffName}'s bank account via Stripe Connect. Digitip never holds your funds.
      </p>
    </td></tr>`),
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
    ? `Votre commande Digitip est confirmée — ${label}`
    : `Your Digitip order is confirmed — ${label}`;

  const headline = isFr ? 'Commande confirmée' : 'Order confirmed';
  const subline = isFr
    ? 'Vos SmartTags sont en cours de programmation.'
    : 'Your SmartTags are being programmed.';
  const nextStepsTitle = isFr ? 'Prochaines étapes' : "What's next";
  const step1 = isFr
    ? 'Nous programmons vos SmartTags à la main (1–2 jours ouvrés).'
    : 'We hand-program your SmartTags (1–2 business days).';
  const step2 = isFr
    ? "Vous recevrez un email avec le numéro de suivi dès l'expédition."
    : "You'll receive a shipping email with your tracking number.";
  const step3 = isFr
    ? 'Posez votre plaque, scannez et commencez à encaisser des pourboires.'
    : 'Place your tag, scan it, and start collecting tips.';
  const invoiceLabel = isFr ? 'Télécharger la facture PDF' : 'Download invoice PDF';
  const orderLabel = isFr ? 'Pack commandé' : 'Pack ordered';
  const qtyLabel = isFr ? 'Quantité' : 'Quantity';
  const refLabel = isFr ? 'Référence' : 'Reference';
  const invoiceRow = isFr ? 'Facture' : 'Invoice';
  const footer = isFr
    ? 'Questions ? Répondez à cet email ou écrivez à support@digitip.app.'
    : 'Questions? Reply to this email or write to support@digitip.app.';

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
            ${isFr ? '🎉 Configurez votre salon maintenant' : '🎉 Set up your salon now'}
          </div>
          <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-bottom:16px;line-height:1.5">
            ${isFr
              ? 'Créez votre espace Digitip en 2 minutes : nom du salon, votre équipe, et vous êtes prêts à encaisser des pourboires.'
              : 'Set up your Digitip space in 2 minutes: salon name, your team, and you\'re ready to collect tips.'}
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
        <div style="margin-bottom:6px">① ${step1}</div>
        <div style="margin-bottom:6px">② ${step2}</div>
        <div>③ ${step3}</div>
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
}): Promise<void> {
  if (!resend) return;

  const { to, pack, quantity, orderId, trackingNumber, locale = 'fr', onboardingUrl } = opts;
  const isFr = locale === 'fr';
  const shortRef = orderId.slice(0, 8).toUpperCase();
  const label = packLabel(pack, locale);

  const subject = isFr
    ? `Votre commande Digitip a été expédiée — ${label}`
    : `Your Digitip order has shipped — ${label}`;

  const headline = isFr ? 'Commande expédiée' : 'Order shipped';
  const subline = isFr
    ? 'Vos SmartTags sont en route !'
    : 'Your SmartTags are on their way!';
  const trackingTitle = isFr ? 'Numéro de suivi' : 'Tracking number';
  const noTracking = isFr ? 'Sera communiqué par transporteur' : 'Provided by carrier';
  const estDelivery = isFr ? 'Délai estimé' : 'Estimated delivery';
  const estDays = isFr ? '3 à 5 jours ouvrés en Europe' : '3–5 business days in Europe';
  const refLabel = isFr ? 'Référence' : 'Reference';
  const orderLabel = isFr ? 'Pack' : 'Pack';
  const footer = isFr
    ? 'Questions ? Répondez à cet email ou écrivez à support@digitip.app.'
    : 'Questions? Reply to this email or write to support@digitip.app.';

  const onboardingSection = onboardingUrl
    ? `<tr><td style="padding:0 32px 24px">
        <div class="highlight" style="background:#fde7ee;border:1px solid #f4c2d2;border-radius:12px;padding:20px 24px">
          <div class="text-strong" style="font-size:14px;font-weight:700;color:#0f0f12;margin-bottom:8px">
            ${isFr ? 'Vous voulez prendre de l\'avance ?' : 'Want a head start?'}
          </div>
          <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-bottom:16px;line-height:1.6">
            ${isFr
              ? 'Vous pouvez configurer votre espace Digitip maintenant — ou attendre la réception de vos SmartTags et simplement scanner l\'un des QR codes. Les deux fonctionnent parfaitement.'
              : 'You can set up your Digitip space now — or wait until your SmartTags arrive and simply scan one of the QR codes. Both work perfectly.'}
          </div>
          <a href="${onboardingUrl}" class="neutral-btn" style="display:inline-block;padding:10px 20px;background:#0f0f12;color:#ffffff;font-size:13px;font-weight:600;border-radius:8px;text-decoration:none">
            ${isFr ? 'Configurer maintenant (optionnel) →' : 'Set up now (optional) →'}
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
      <div style="display:inline-block;background:#3b82f622;color:#60a5fa;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● ${isFr ? 'En transit' : 'In transit'}</div>
      <div class="text-primary" style="font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:6px">${headline}</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a">${subline}</div>
    </td></tr>
    <tr><td style="padding:0 32px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" class="panel" style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden">
        ${infoRow(orderLabel, label)}
        ${infoRow(isFr ? 'Quantité' : 'Quantity', String(quantity))}
        ${infoRow(refLabel, `<span style="font-family:monospace">${shortRef}</span>`)}
        ${infoRow(trackingTitle, trackingNumber
          ? `<span class="text-strong" style="font-family:monospace;color:#0f0f12">${trackingNumber}</span>`
          : noTracking)}
        ${infoRow(estDelivery, estDays)}
      </table>
    </td></tr>
    ${onboardingSection}
    <tr><td style="padding:0 32px 32px">
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:0;line-height:1.6">${footer}</p>
    </td></tr>`),
  });
}

// ─── Payment failed (tipper) ──────────────────────────────────────────────────

export async function sendPaymentFailed(opts: {
  to: string;
  amount: number;
  currency: string;
  staffName: string;
  establishmentName: string;
}): Promise<void> {
  if (!resend) return;

  const { to, amount, currency, staffName, establishmentName } = opts;
  const fmt = new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2 });
  const formatted = fmt.format(amount / 100);

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your tip payment did not go through — ${formatted}`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Payment issue</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#ef444422;color:#f87171;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● Payment failed</div>
      <div class="text-primary" style="font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:10px">We couldn't process your tip</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a">Your tip of <strong class="text-strong" style="color:#0f0f12">${formatted}</strong> to <strong class="text-strong" style="color:#0f0f12">${staffName}</strong>${establishmentName ? ` at ${establishmentName}` : ''} was not completed.</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p class="text-secondary" style="font-size:13px;color:#5a5a6a;margin:0;line-height:1.6">No charge was made to your card. If you'd like to try again, simply scan the NFC tag or visit the tip page again.</p>
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:16px 0 0;line-height:1.6">Questions? Reply to this email or write to support@digitip.app.</p>
    </td></tr>`),
  });
}

// ─── Tip refunded (tipper) ────────────────────────────────────────────────────

export async function sendTipRefunded(opts: {
  to: string;
  amount: number;
  currency: string;
  staffName?: string;
  establishmentName?: string;
}): Promise<void> {
  if (!resend) return;

  const { to, amount, currency, staffName, establishmentName } = opts;
  const fmt = new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2 });
  const formatted = fmt.format(amount / 100);
  const contextLine = staffName
    ? `Your tip to <strong class="text-strong" style="color:#0f0f12">${staffName}</strong>${establishmentName ? ` at ${establishmentName}` : ''} has been refunded.`
    : 'Your tip has been refunded.';

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your tip has been refunded — ${formatted}`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Refund confirmation</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#f59e0b22;color:#fbbf24;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● Refunded</div>
      <div class="text-primary" style="font-size:40px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:4px">${formatted}</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a">${contextLine}</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p class="text-secondary" style="font-size:13px;color:#5a5a6a;margin:0;line-height:1.6">The refunded amount will appear on your original payment method within 5–10 business days, depending on your bank.</p>
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:16px 0 0;line-height:1.6">Questions? Reply to this email or write to support@digitip.app.</p>
    </td></tr>`),
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
    subject: `Candidature ambassadeur reçue — Digitip`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Programme ambassadeur</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#22c55e22;color:#22c55e;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● Candidature reçue</div>
      <div class="text-primary" style="font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:10px">Merci ${firstName} !</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a">Ta candidature au programme ambassadeur Digitip a bien été reçue.</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p class="text-secondary" style="font-size:13px;color:#5a5a6a;margin:0;line-height:1.7">Notre équipe l'examine et revient vers toi très prochainement. En attendant, n'hésite pas à répondre à cet email si tu as des questions.</p>
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
    subject: `Nouvelle candidature ambassadeur — ${firstName} ${lastName}`,
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
          : '<span style="color:#9ca3af">Non renseigné — à fournir avant paiement</span>')}
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
    subject: `Compte bancaire configuré — Digitip Ambassadeur`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Programme ambassadeur</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#22c55e22;color:#22c55e;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● Compte configuré</div>
      <div class="text-primary" style="font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:10px">Tout est prêt, ${firstName} !</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a">Ton compte bancaire Stripe a bien été enregistré. Tu recevras tes commissions directement sur ton IBAN lors de chaque virement.</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p class="text-secondary" style="font-size:13px;color:#5a5a6a;margin:0;line-height:1.7">Les virements sont déclenchés manuellement par notre équipe après validation. Tu seras notifié par email à chaque paiement.</p>
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:16px 0 0;line-height:1.6">Questions ? Réponds à cet email ou écris à support@digitip.app.</p>
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
    : '<div style="display:inline-block;background:#ef444422;color:#ef4444;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● Virement échoué — à reprendre</div>';

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Virement ambassadeur — ${ambassadorName} (${amount} €)`,
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
        ${infoRow('Statut', paid ? 'Versé sur le compte Stripe de l\'ambassadeur' : 'Échec — à reprendre depuis le dashboard admin')}
      </table>
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:16px 0 0;line-height:1.6">Le solde ne contient que la commission de base et les bonus que tu as validés.</p>
    </td></tr>`),
  });
}

// ─── Admin — new SmartTag order alert ─────────────────────────────────────────

export async function sendAdminNewOrder(opts: {
  customerName: string;
  customerEmail?: string | null;
  pack: string;
  quantity: number;
  orderId: string;
  promoCode?: string | null;
  locale: string;
}): Promise<void> {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!resend || !adminEmail) return;

  const { customerName, customerEmail, pack, quantity, orderId, promoCode, locale } = opts;
  const shortRef = orderId.slice(0, 8).toUpperCase();
  const label = packLabel(pack, locale);

  await resend.emails.send({
    from: FROM,
    to: adminEmail,
    ...(customerEmail ? { replyTo: customerEmail } : {}),
    subject: `Nouvelle commande — ${label} · ${customerName}`,
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
    ? `Vos SmartTags Digitip sont arrivés 🎉`
    : `Your Digitip SmartTags have arrived 🎉`;

  const headline = isFr ? 'Livraison confirmée' : 'Delivery confirmed';
  const subline = isFr
    ? 'Vos SmartTags sont entre vos mains. Il ne reste plus qu\'à les poser !'
    : "Your SmartTags are in your hands. Time to start collecting tips!";
  const ctaLabel = isFr ? 'Accéder au dashboard' : 'Go to dashboard';
  const step1 = isFr
    ? 'Posez votre SmartTag sur votre comptoir ou table.'
    : 'Place your SmartTag on your counter or table.';
  const step2 = isFr
    ? 'Vos clients approchent leur téléphone — le pourboire est reçu en 3 secondes.'
    : 'Customers tap their phone — the tip arrives in 3 seconds.';
  const step3 = isFr
    ? 'Suivez vos pourboires en temps réel depuis votre dashboard.'
    : 'Track your tips in real time from your dashboard.';
  const nextTitle = isFr ? 'Prêt à démarrer' : 'Ready to go';
  const footer = isFr
    ? 'Questions ? Répondez à cet email ou écrivez à support@digitip.app.'
    : 'Questions? Reply to this email or write to support@digitip.app.';

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
      <div class="text-primary" style="font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:6px">${headline} 🎉</div>
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
        <div style="margin-bottom:6px">① ${step1}</div>
        <div style="margin-bottom:6px">② ${step2}</div>
        <div>③ ${step3}</div>
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
    ? `Votre commande Digitip a été annulée — ${label}`
    : `Your Digitip order has been canceled — ${label}`;
  const headline = isFr ? 'Commande annulée' : 'Order canceled';
  const subline = isFr
    ? 'Le montant payé vous sera intégralement remboursé sur le moyen de paiement utilisé sous 5 à 10 jours ouvrés.'
    : 'The amount paid will be fully refunded to your original payment method within 5–10 business days.';
  const reasonLabel = isFr ? 'Motif' : 'Reason';
  const orderLabel = isFr ? 'Pack' : 'Pack';
  const qtyLabel = isFr ? 'Quantité' : 'Quantity';
  const refLabel = isFr ? 'Référence' : 'Reference';
  const footer = isFr
    ? 'Une erreur ? Répondez à cet email, nous regardons rapidement.'
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

// ─── Custom order note (admin → customer, free-form) ──────────────────────────

export async function sendOrderCustomNote(opts: {
  to: string;
  orderId: string;
  subject: string;
  bodyText: string;
  locale?: string;
}): Promise<void> {
  if (!resend) return;

  const { to, orderId, subject, bodyText, locale = 'fr' } = opts;
  const isFr = locale === 'fr';
  const shortRef = orderId.slice(0, 8).toUpperCase();
  const refLabel = isFr ? 'Référence commande' : 'Order reference';
  const signature = isFr
    ? 'L’équipe Digitip · support@digitip.app'
    : 'The Digitip team · support@digitip.app';

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
  });
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
    subject: `Contrat à signer — ${contractTitle}`,
    html: themedLayout(`
    <tr><td class="divider" style="padding:32px 32px 24px;border-bottom:1px solid #f1f2f4">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12">Digitip</div>
      <div class="text-secondary" style="font-size:13px;color:#5a5a6a;margin-top:2px">Contrat ambassadeur</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div class="text-primary" style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f0f12;margin-bottom:8px">${firstName}, un contrat t'attend</div>
      <div class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Tu peux le lire et le signer en ligne, depuis ton dashboard sécurisé par PIN. Aucune impression ni signature manuscrite requise.</div>
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
    subject: `Contrat signé — ${contractTitle}`,
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
      <p class="text-muted" style="font-size:12px;color:#9898a8;margin:18px 0 0;line-height:1.6">Conserve cet email comme preuve. Le contenu intégral du contrat reste accessible depuis ton dashboard et ne peut plus être modifié.</p>
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
    : `Dernière relance — ta candidature ambassadeur expire bientôt`;
  const headline = step === 1
    ? `On a vu ta candidature, ${firstName} 👀`
    : `Dernière chance, ${firstName} ⏳`;
  const body = step === 1
    ? `Ton dossier est en cours d'examen. Pour accélérer, assure-toi que ton SIRET et ton RIB sont à jour. Tu n'as pas encore de SIRET ? <a href="https://autoentrepreneur.urssaf.fr" style="color:#E57A97">Crée-le gratuitement ici</a> (10 min, c'est instantané).`
    : `Sans nouvelle de ta part dans les prochains jours, on devra archiver ta candidature. Si tu es toujours motivé(e), réponds à cet email — un humain te recontactera dans la journée.`;

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
    subject: `${parrainName} t'a recommandé(e) — Bienvenue chez Digitip`,
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
      <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6;margin:0 0 16px">${parrainName} fait partie du programme ambassadeur Digitip — placer des SmartTags NFC chez des restos et toucher 35 à 45 € par vente. ${parrainName} pense que tu pourrais cartonner.</p>
      <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6;margin:0">Pas d'engagement, pas de stock à avancer — juste un SIRET (auto-entrepreneur) et l'envie de prospecter.</p>
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
    subject: `🎉 Parrainage validé : +${euros}€ pour toi`,
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
      <p class="text-secondary" style="font-size:13px;color:#5a5a6a;margin:0;line-height:1.7">Continue à inviter des potes — 5 filleuls validés = +100€ supplémentaires. 10 filleuls = +250€.</p>
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
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Je tombe sur ton SIRET dans la base SIRENE — tu es enregistré(e) en activité commerciale${cityFragment}. On lance un programme ambassadeur Digitip : tu places des SmartTags NFC (pourboires sans contact) dans les restos, et tu touches <strong class="text-strong" style="color:#0f0f12">35 à 45€ par vente</strong>. Pas de stock, pas d'avance.</p>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Si ça te dit d'en savoir plus, jette un œil :</p>
        <p><a href="${landingUrl}" style="display:inline-block;padding:10px 18px;background:#E57A97;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Voir le programme →</a></p>`,
    },
    2: {
      subject: `${firstName ? firstName + ', ' : ''}exemple concret — un amba a fait 12 ventes en 3 sem`,
      body: `<p class="text-primary" style="font-size:14px;color:#0f0f12;line-height:1.6">${greet},</p>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Petit suivi sur mon mail précédent. Concrètement : un de nos ambassadeurs à Lyon vient de faire <strong class="text-strong" style="color:#0f0f12">12 ventes en 3 semaines</strong>, soit ~360€ de commissions. Il bosse ~5h/semaine.</p>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Si tu veux essayer, le SIRET que tu as déjà suffit :</p>
        <p><a href="${landingUrl}" style="display:inline-block;padding:10px 18px;background:#E57A97;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Postuler en 2 min →</a></p>`,
    },
    3: {
      subject: `Dernier mail`,
      body: `<p class="text-primary" style="font-size:14px;color:#0f0f12;line-height:1.6">${greet},</p>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Je te promets, c'est mon dernier mail. Si le sujet ne t'intéresse pas, pas de souci — désinscris-toi en 1 clic en bas du mail.</p>
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
    ? `Ce lien vous emmène directement à l'onboarding avec votre email pré-rempli (${to}). Pas besoin de mot de passe — vous choisirez le vôtre à la fin.`
    : `This link takes you straight to onboarding with your email pre-filled (${to}). No password needed — you'll set one at the end.`;
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
    <a href="${unsubscribeUrl}" style="color:#E57A97">ne plus recevoir ces emails</a>. · Digitip · support@digitip.app
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
  if (!resend) return { id: null };
  const result = await resend.emails.send({ from: FROM, to, subject, html: themedLayout(inner) });
  if (result.error) throw new Error(result.error.message || 'Resend send failed');
  return { id: result.data?.id ?? null };
}

function money(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** Group admin — onboarding not completed (J+2 = step 1, J+5 = step 2). */
export async function sendGroupOnboardingNudge(opts: {
  to: string; firstName: string; setupUrl: string; step: 1 | 2; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, setupUrl, step, unsubscribeUrl } = opts;
  if (step === 1) {
    return lifecycleSend(to, `${firstName}, votre salon est à 2 minutes d'encaisser des pourboires`,
      lifecycleBody({
        badge: 'Configuration', tone: 'pink',
        title: `${firstName}, finalisez votre espace Digitip`,
        intro: `Votre commande est validée. Dernière étape : créer votre espace Digitip — <strong class="text-strong" style="color:#0f0f12">moins de 2 minutes</strong>.`,
        bullets: ['① Nommez votre salon', '② Ajoutez vos employés', '③ Posez le SmartTag et encaissez'],
        ctaLabel: 'Configurer mon espace →', ctaUrl: setupUrl,
        note: 'Une question ? Répondez à cet email.',
        unsubscribeUrl,
      }));
  }
  return lifecycleSend(to, `${firstName}, vos SmartTags sont prêts — mais pas encore actifs`,
    lifecycleBody({
      badge: 'À finaliser', tone: 'amber',
      title: `${firstName}, ne laissez pas filer vos pourboires`,
      intro: `Vos SmartTags sont prêts. Tant que votre espace n'est pas configuré, <strong class="text-strong" style="color:#0f0f12">aucun pourboire ne peut être encaissé</strong>.`,
      ctaLabel: 'Activer mon espace maintenant →', ctaUrl: setupUrl,
      note: 'La configuration prend 2 minutes.',
      unsubscribeUrl,
    }));
}

/** Group admin — hardware delivered, no tip yet: place the tag. */
export async function sendTagDeliveredPlaceNudge(opts: {
  to: string; firstName: string; establishmentName: string; dashboardUrl: string; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, dashboardUrl, unsubscribeUrl } = opts;
  return lifecycleSend(to, `${firstName}, vos SmartTags sont arrivés — posez-en un maintenant`,
    lifecycleBody({
      badge: 'Livré', tone: 'green',
      title: `${firstName}, sortez vos SmartTags de la boîte`,
      intro: `Vos SmartTags pour <strong class="text-strong" style="color:#0f0f12">${escapeHtml(establishmentName)}</strong> sont livrés. Le bon réflexe : en poser un <strong class="text-strong" style="color:#0f0f12">aujourd'hui</strong>, bien visible.`,
      bullets: [
        '① Posez le SmartTag sur le comptoir ou la caisse',
        '② Scannez-le une fois pour vérifier',
        '③ Dites à votre équipe d\'en parler à chaque client',
      ],
      ctaLabel: 'Voir mon tableau de bord →', ctaUrl: dashboardUrl,
      note: 'Les salons qui posent leur tag le jour de la livraison encaissent beaucoup plus dès la première semaine.',
      unsubscribeUrl,
    }));
}

/** Group admin — onboarded but team is empty: invite staff. */
export async function sendInviteTeamNudge(opts: {
  to: string; firstName: string; establishmentName: string; inviteUrl: string; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, inviteUrl, unsubscribeUrl } = opts;
  return lifecycleSend(to, `${firstName}, ajoutez votre équipe pour ne rien rater`,
    lifecycleBody({
      badge: 'Votre équipe', tone: 'pink',
      title: `${firstName}, vos employés peuvent recevoir leurs pourboires`,
      intro: `<strong class="text-strong" style="color:#0f0f12">${escapeHtml(establishmentName)}</strong> n'a pas encore d'équipe sur Digitip. Chaque employé ajouté peut recevoir ses pourboires directement sur son compte — et c'est un vrai argument pour les motiver.`,
      ctaLabel: 'Ajouter mon équipe →', ctaUrl: inviteUrl,
      note: 'Ça prend 30 secondes par personne : un nom, un email, c\'est tout.',
      unsubscribeUrl,
    }));
}

/** Group admin — live for a while, still zero succeeded tips. */
export async function sendActivationNudge(opts: {
  to: string; firstName: string; establishmentName: string; dashboardUrl: string; daysSince: number; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, dashboardUrl, daysSince, unsubscribeUrl } = opts;
  return lifecycleSend(to, `${firstName}, toujours 0 pourboire — réglons ça ensemble`,
    lifecycleBody({
      badge: 'Activation', tone: 'amber',
      title: `${firstName}, votre SmartTag n'a encore rien encaissé`,
      intro: `Cela fait ${daysSince} jours que <strong class="text-strong" style="color:#0f0f12">${escapeHtml(establishmentName)}</strong> est prêt, mais aucun pourboire n'est passé. Dans 9 cas sur 10, c'est une de ces 3 choses :`,
      bullets: [
        '① Le tag est rangé ou peu visible → mettez-le sur le comptoir, à hauteur des yeux',
        '② L\'équipe n\'en parle pas → un simple « vous pouvez laisser un pourboire ici » suffit',
        '③ Le tag n\'a jamais été testé → scannez-le pour vérifier qu\'il fonctionne',
      ],
      ctaLabel: 'Vérifier mon installation →', ctaUrl: dashboardUrl,
      note: 'Bloqué ? Répondez à cet email — on regarde votre cas avec vous, gratuitement.',
      unsubscribeUrl,
    }));
}

/** Staff — invitation not yet claimed (J+3 = step 1, J+7 = step 2). */
export async function sendStaffInviteReminder(opts: {
  to: string; firstName: string; establishmentName: string; joinUrl: string; step: 1 | 2; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, joinUrl, step, unsubscribeUrl } = opts;
  const subject = step === 1
    ? `${firstName}, ${establishmentName} vous attend sur Digitip`
    : `${firstName}, vos pourboires vous attendent toujours`;
  return lifecycleSend(to, subject,
    lifecycleBody({
      badge: 'Invitation', tone: 'pink',
      title: `${firstName}, activez votre compte Digitip`,
      intro: `<strong class="text-strong" style="color:#0f0f12">${escapeHtml(establishmentName)}</strong> vous a invité(e) à recevoir vos pourboires directement sur votre compte bancaire. Votre compte n'est pas encore activé — il suffit d'une minute.`,
      ctaLabel: 'Activer mon compte →', ctaUrl: joinUrl,
      note: step === 2
        ? 'Sans compte activé, vos pourboires ne peuvent pas vous être versés.'
        : 'Une minute suffit — vos pourboires arrivent ensuite directement sur votre compte.',
      unsubscribeUrl,
    }));
}

/** Staff — account claimed but Stripe banking not started (J+1 / J+3 / J+7). */
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
        : 'Vos coordonnées bancaires sont gérées par Stripe — Digitip n\'y a jamais accès.',
      unsubscribeUrl,
    }));
}

/** Staff — Stripe banking just completed (transactional). */
export async function sendStaffBankingComplete(opts: {
  to: string; firstName: string;
}): Promise<{ id: string | null }> {
  const { to, firstName } = opts;
  return lifecycleSend(to, `${firstName}, tout est prêt — vos pourboires arrivent`,
    lifecycleBody({
      badge: 'Compte activé', tone: 'green',
      title: `${firstName}, votre compte est prêt 🎉`,
      intro: `Votre compte bancaire est relié et vérifié. À partir de maintenant, chaque pourboire laissé sur votre SmartTag <strong class="text-strong" style="color:#0f0f12">arrive directement sur votre compte</strong>. Il ne reste plus qu'à en parler à vos clients !`,
      note: 'Digitip ne conserve jamais vos fonds — tout passe directement par Stripe.',
    }));
}

/** Group admin — establishment received its very first tip. */
export async function sendFirstTipCelebration(opts: {
  to: string; firstName: string; amount: number; currency: string; establishmentName: string; dashboardUrl: string; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, amount, currency, establishmentName, dashboardUrl, unsubscribeUrl } = opts;
  return lifecycleSend(to, `🎉 Premier pourboire encaissé chez ${establishmentName} !`,
    lifecycleBody({
      badge: 'Premier pourboire', tone: 'green',
      title: `${firstName}, ${escapeHtml(establishmentName)} vient d'encaisser son 1er pourboire !`,
      intro: `Un client vient de laisser <strong class="text-strong" style="color:#0f0f12">${money(amount, currency)}</strong> via votre SmartTag. C'est la preuve que ça marche — maintenant, le but est d'en faire une habitude.`,
      bullets: [
        '→ Posez un SmartTag à chaque poste / chaque caisse',
        '→ Demandez à l\'équipe de le mentionner à chaque encaissement',
      ],
      ctaLabel: 'Voir mes pourboires →', ctaUrl: dashboardUrl,
      unsubscribeUrl,
    }));
}

/** Staff — cumulative earnings crossed a milestone (€100 / €500). */
export async function sendEarningsMilestone(opts: {
  to: string; firstName: string; milestoneAmount: number; currency: string; dashboardUrl: string; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, milestoneAmount, currency, dashboardUrl, unsubscribeUrl } = opts;
  return lifecycleSend(to, `${firstName}, vous avez dépassé ${money(milestoneAmount, currency)} de pourboires 🏆`,
    lifecycleBody({
      badge: 'Palier atteint', tone: 'green',
      title: `${firstName}, ${money(milestoneAmount, currency)} de pourboires — bravo !`,
      intro: `Vos pourboires Digitip viennent de dépasser <strong class="text-strong" style="color:#0f0f12">${money(milestoneAmount, currency)}</strong> au total. Continuez à proposer le SmartTag à vos clients — le prochain palier arrive vite.`,
      ctaLabel: 'Voir mon total →', ctaUrl: dashboardUrl,
      unsubscribeUrl,
    }));
}

/** Group admin — establishment was active then went quiet (recurring). */
export async function sendReEngagementEmail(opts: {
  to: string; firstName: string; establishmentName: string; daysQuiet: number; dashboardUrl: string; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, daysQuiet, dashboardUrl, unsubscribeUrl } = opts;
  return lifecycleSend(to, `${firstName}, ${daysQuiet} jours sans pourboire chez ${establishmentName}`,
    lifecycleBody({
      badge: 'Reprise', tone: 'amber',
      title: `${firstName}, ça fait calme du côté de ${escapeHtml(establishmentName)}`,
      intro: `Aucun pourboire n'est passé depuis <strong class="text-strong" style="color:#0f0f12">${daysQuiet} jours</strong>. Ça arrive — et ça se règle vite. La cause la plus fréquente : le SmartTag a disparu de la vue.`,
      bullets: [
        '① Le tag est-il toujours bien en place et visible ?',
        '② L\'équipe le propose-t-elle encore aux clients ?',
        '③ Un test rapide : scannez-le pour vérifier qu\'il répond',
      ],
      ctaLabel: 'Reprendre la main →', ctaUrl: dashboardUrl,
      note: 'On peut regarder votre cas ensemble — répondez simplement à cet email.',
      unsubscribeUrl,
    }));
}

/** Group admin — weekly recap of tips collected (recurring, Mondays). */
export async function sendWeeklyTipRecap(opts: {
  to: string; firstName: string; establishmentName: string; weekTotal: number; tipCount: number; currency: string; dashboardUrl: string; unsubscribeUrl?: string | null;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, weekTotal, tipCount, currency, dashboardUrl, unsubscribeUrl } = opts;
  return lifecycleSend(to, `${establishmentName} : ${money(weekTotal, currency)} de pourboires cette semaine`,
    lifecycleBody({
      badge: 'Récap de la semaine', tone: 'green',
      title: `${firstName}, ${escapeHtml(establishmentName)} a encaissé ${money(weekTotal, currency)} 🎉`,
      intro: `Cette semaine, vos clients ont laissé <strong class="text-strong" style="color:#0f0f12">${tipCount} pourboire${tipCount > 1 ? 's' : ''}</strong> via Digitip, pour un total de <strong class="text-strong" style="color:#0f0f12">${money(weekTotal, currency)}</strong>. Bel élan — gardez le SmartTag bien visible pour faire encore mieux.`,
      ctaLabel: 'Voir le détail →', ctaUrl: dashboardUrl,
      unsubscribeUrl,
    }));
}

/** Staff — a Stripe payout failed (transactional). */
export async function sendPayoutFailedAlert(opts: {
  to: string; firstName: string; bankingUrl: string;
}): Promise<{ id: string | null }> {
  const { to, firstName, bankingUrl } = opts;
  return lifecycleSend(to, `${firstName}, action requise — un virement a échoué`,
    lifecycleBody({
      badge: 'Action requise', tone: 'amber',
      title: `${firstName}, un virement de vos pourboires a échoué`,
      intro: `Un virement de vos pourboires n'a pas pu aboutir. C'est presque toujours un RIB incorrect ou expiré. Vérifiez vos coordonnées bancaires pour débloquer vos paiements.`,
      ctaLabel: 'Vérifier mon RIB →', ctaUrl: bankingUrl,
      note: 'Vos pourboires restent en sécurité — ils seront versés dès que votre compte sera à jour.',
    }));
}
