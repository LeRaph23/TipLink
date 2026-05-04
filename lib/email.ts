import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = 'Digitip <receipts@digitip.app>';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function darkLayout(content: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e5e5e5">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:40px auto;background:#141414;border-radius:16px;border:1px solid #222;overflow:hidden">
    ${content}
    <tr><td style="padding:16px 32px;border-top:1px solid #1e1e1e;text-align:center">
      <span style="font-size:11px;color:#444">© Digitip · Cashless tips via NFC</span>
    </td></tr>
  </table>
</body>
</html>`;
}

function infoRow(label: string, value: string) {
  return `<tr style="border-bottom:1px solid #222">
    <td style="padding:12px 16px;font-size:12px;color:#666">${label}</td>
    <td style="padding:12px 16px;font-size:12px;color:#aaa;text-align:right">${value}</td>
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
    html: darkLayout(`
    <tr><td style="padding:32px 32px 24px;border-bottom:1px solid #1e1e1e">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#fff">Digitip</div>
      <div style="font-size:13px;color:#666;margin-top:2px">Tip receipt</div>
    </td></tr>
    <tr><td style="padding:28px 32px">
      <div style="font-size:40px;font-weight:800;letter-spacing:-0.04em;color:#fff;margin-bottom:4px">${formatted}</div>
      <div style="font-size:14px;color:#888">Tip sent to <strong style="color:#ccc">${staffName}</strong> at ${establishmentName}</div>
    </td></tr>
    <tr><td style="padding:0 32px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:10px;border:1px solid #222;overflow:hidden">
        ${infoRow('Status', '<span style="color:#22c55e;font-weight:600">● Succeeded</span>')}
        ${infoRow('Reference', `<span style="font-family:monospace">${shortRef}</span>`)}
        ${infoRow('Processor', 'Stripe ✓')}
      </table>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p style="font-size:12px;color:#444;margin:0;line-height:1.6">
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
  locale?: string;
}): Promise<void> {
  if (!resend) return;

  const { to, pack, quantity, orderId, invoicePdfUrl, locale = 'fr' } = opts;
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
        <a href="${invoicePdfUrl}" style="display:inline-block;padding:10px 20px;background:#fff;color:#000;font-size:13px;font-weight:600;border-radius:8px;text-decoration:none">
          ↓ ${invoiceLabel}
        </a>
      </td></tr>`
    : '';

  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: darkLayout(`
    <tr><td style="padding:32px 32px 24px;border-bottom:1px solid #1e1e1e">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#fff">Digitip</div>
      <div style="font-size:13px;color:#666;margin-top:2px">${headline}</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#22c55e22;color:#22c55e;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● ${isFr ? 'Paiement reçu' : 'Payment received'}</div>
      <div style="font-size:26px;font-weight:800;letter-spacing:-0.03em;color:#fff;margin-bottom:6px">${headline}</div>
      <div style="font-size:14px;color:#888">${subline}</div>
    </td></tr>
    <tr><td style="padding:0 32px 24px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:10px;border:1px solid #222;overflow:hidden">
        ${infoRow(orderLabel, label)}
        ${infoRow(qtyLabel, String(quantity))}
        ${infoRow(refLabel, `<span style="font-family:monospace">${shortRef}</span>`)}
        ${invoicePdfUrl ? infoRow(invoiceRow, `<a href="${invoicePdfUrl}" style="color:#60a5fa;text-decoration:none">PDF ↓</a>`) : ''}
      </table>
    </td></tr>
    ${invoiceSection}
    <tr><td style="padding:0 32px 28px">
      <div style="font-size:13px;font-weight:600;color:#ccc;margin-bottom:12px">${nextStepsTitle}</div>
      <div style="font-size:13px;color:#888;line-height:1.7">
        <div style="margin-bottom:6px">① ${step1}</div>
        <div style="margin-bottom:6px">② ${step2}</div>
        <div>③ ${step3}</div>
      </div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p style="font-size:12px;color:#444;margin:0;line-height:1.6">${footer}</p>
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
}): Promise<void> {
  if (!resend) return;

  const { to, pack, quantity, orderId, trackingNumber, locale = 'fr' } = opts;
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

  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: darkLayout(`
    <tr><td style="padding:32px 32px 24px;border-bottom:1px solid #1e1e1e">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#fff">Digitip</div>
      <div style="font-size:13px;color:#666;margin-top:2px">${headline}</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#3b82f622;color:#60a5fa;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● ${isFr ? 'En transit' : 'In transit'}</div>
      <div style="font-size:26px;font-weight:800;letter-spacing:-0.03em;color:#fff;margin-bottom:6px">${headline}</div>
      <div style="font-size:14px;color:#888">${subline}</div>
    </td></tr>
    <tr><td style="padding:0 32px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:10px;border:1px solid #222;overflow:hidden">
        ${infoRow(orderLabel, label)}
        ${infoRow(isFr ? 'Quantité' : 'Quantity', String(quantity))}
        ${infoRow(refLabel, `<span style="font-family:monospace">${shortRef}</span>`)}
        ${infoRow(trackingTitle, trackingNumber
          ? `<span style="font-family:monospace;color:#ccc">${trackingNumber}</span>`
          : noTracking)}
        ${infoRow(estDelivery, estDays)}
      </table>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p style="font-size:12px;color:#444;margin:0;line-height:1.6">${footer}</p>
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
        <a href="${dashboardUrl}" style="display:inline-block;padding:11px 22px;background:#fff;color:#000;font-size:13px;font-weight:600;border-radius:8px;text-decoration:none">
          ${ctaLabel} →
        </a>
      </td></tr>`
    : '';

  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: darkLayout(`
    <tr><td style="padding:32px 32px 24px;border-bottom:1px solid #1e1e1e">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#fff">Digitip</div>
      <div style="font-size:13px;color:#666;margin-top:2px">${headline}</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#22c55e22;color:#22c55e;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● ${isFr ? 'Livré' : 'Delivered'}</div>
      <div style="font-size:26px;font-weight:800;letter-spacing:-0.03em;color:#fff;margin-bottom:6px">${headline} 🎉</div>
      <div style="font-size:14px;color:#888">${subline}</div>
    </td></tr>
    <tr><td style="padding:0 32px 24px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:10px;border:1px solid #222;overflow:hidden">
        ${infoRow(isFr ? 'Pack livré' : 'Delivered pack', label)}
        ${infoRow(isFr ? 'Quantité' : 'Quantity', String(quantity))}
        ${infoRow(isFr ? 'Référence' : 'Reference', `<span style="font-family:monospace">${shortRef}</span>`)}
      </table>
    </td></tr>
    ${ctaSection}
    <tr><td style="padding:0 32px 28px">
      <div style="font-size:13px;font-weight:600;color:#ccc;margin-bottom:12px">${nextTitle}</div>
      <div style="font-size:13px;color:#888;line-height:1.7">
        <div style="margin-bottom:6px">① ${step1}</div>
        <div style="margin-bottom:6px">② ${step2}</div>
        <div>③ ${step3}</div>
      </div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p style="font-size:12px;color:#444;margin:0;line-height:1.6">${footer}</p>
    </td></tr>`),
  });
}
