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
  siret: string;
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
        ${infoRow('SIRET', `<span style="font-family:monospace">${siret}</span>`)}
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
      <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6;margin:0 0 16px">${parrainName} fait partie du programme ambassadeur Digitip — placer des SmartTags NFC chez des restos et toucher 25 à 35 € par vente. ${parrainName} pense que tu pourrais cartonner.</p>
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
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Je tombe sur ton SIRET dans la base SIRENE — tu es enregistré(e) en activité commerciale${cityFragment}. On lance un programme ambassadeur Digitip : tu places des SmartTags NFC (pourboires sans contact) dans les restos, et tu touches <strong class="text-strong" style="color:#0f0f12">25 à 35€ par vente</strong>. Pas de stock, pas d'avance.</p>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Si ça te dit d'en savoir plus, jette un œil :</p>
        <p><a href="${landingUrl}" style="display:inline-block;padding:10px 18px;background:#E57A97;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Voir le programme →</a></p>`,
    },
    2: {
      subject: `${firstName ? firstName + ', ' : ''}exemple concret — un amba a fait 12 ventes en 3 sem`,
      body: `<p class="text-primary" style="font-size:14px;color:#0f0f12;line-height:1.6">${greet},</p>
        <p class="text-secondary" style="font-size:14px;color:#5a5a6a;line-height:1.6">Petit suivi sur mon mail précédent. Concrètement : un de nos ambassadeurs Lyon (BTS NDRC en alternance) vient de faire <strong class="text-strong" style="color:#0f0f12">12 ventes en 3 semaines</strong>, soit ~360€ en plus de sa formation. Il bosse ~5h/semaine.</p>
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
