import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = 'Digitip <noreply@digitip.app>';

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
        <a href="${invoicePdfUrl}" style="display:inline-block;padding:10px 20px;background:#fff;color:#000;font-size:13px;font-weight:600;border-radius:8px;text-decoration:none">
          ↓ ${invoiceLabel}
        </a>
      </td></tr>`
    : '';

  const setupSection = setupUrl
    ? `<tr><td style="padding:0 32px 28px">
        <div style="background:#1a1a2e;border:1px solid #3b3b6e;border-radius:12px;padding:20px 24px">
          <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:6px">
            ${isFr ? '🎉 Configurez votre salon maintenant' : '🎉 Set up your salon now'}
          </div>
          <div style="font-size:13px;color:#888;margin-bottom:16px;line-height:1.5">
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
    ${setupSection}
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
        <div style="background:#1a1a2e;border:1px solid #3b3b6e;border-radius:12px;padding:20px 24px">
          <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:8px">
            ${isFr ? 'Vous voulez prendre de l\'avance ?' : 'Want a head start?'}
          </div>
          <div style="font-size:13px;color:#888;margin-bottom:16px;line-height:1.6">
            ${isFr
              ? 'Vous pouvez configurer votre espace Digitip maintenant — ou attendre la réception de vos SmartTags et simplement scanner l\'un des QR codes. Les deux fonctionnent parfaitement.'
              : 'You can set up your Digitip space now — or wait until your SmartTags arrive and simply scan one of the QR codes. Both work perfectly.'}
          </div>
          <a href="${onboardingUrl}" style="display:inline-block;padding:10px 20px;background:#fff;color:#000;font-size:13px;font-weight:600;border-radius:8px;text-decoration:none">
            ${isFr ? 'Configurer maintenant (optionnel) →' : 'Set up now (optional) →'}
          </a>
        </div>
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
    ${onboardingSection}
    <tr><td style="padding:0 32px 32px">
      <p style="font-size:12px;color:#444;margin:0;line-height:1.6">${footer}</p>
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
    html: darkLayout(`
    <tr><td style="padding:32px 32px 24px;border-bottom:1px solid #1e1e1e">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#fff">Digitip</div>
      <div style="font-size:13px;color:#666;margin-top:2px">Payment issue</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#ef444422;color:#f87171;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● Payment failed</div>
      <div style="font-size:26px;font-weight:800;letter-spacing:-0.03em;color:#fff;margin-bottom:10px">We couldn't process your tip</div>
      <div style="font-size:14px;color:#888">Your tip of <strong style="color:#ccc">${formatted}</strong> to <strong style="color:#ccc">${staffName}</strong>${establishmentName ? ` at ${establishmentName}` : ''} was not completed.</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p style="font-size:13px;color:#888;margin:0;line-height:1.6">No charge was made to your card. If you'd like to try again, simply scan the NFC tag or visit the tip page again.</p>
      <p style="font-size:12px;color:#444;margin:16px 0 0;line-height:1.6">Questions? Reply to this email or write to support@digitip.app.</p>
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
    ? `Your tip to <strong style="color:#ccc">${staffName}</strong>${establishmentName ? ` at ${establishmentName}` : ''} has been refunded.`
    : 'Your tip has been refunded.';

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your tip has been refunded — ${formatted}`,
    html: darkLayout(`
    <tr><td style="padding:32px 32px 24px;border-bottom:1px solid #1e1e1e">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#fff">Digitip</div>
      <div style="font-size:13px;color:#666;margin-top:2px">Refund confirmation</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#f59e0b22;color:#fbbf24;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● Refunded</div>
      <div style="font-size:40px;font-weight:800;letter-spacing:-0.04em;color:#fff;margin-bottom:4px">${formatted}</div>
      <div style="font-size:14px;color:#888">${contextLine}</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p style="font-size:13px;color:#888;margin:0;line-height:1.6">The refunded amount will appear on your original payment method within 5–10 business days, depending on your bank.</p>
      <p style="font-size:12px;color:#444;margin:16px 0 0;line-height:1.6">Questions? Reply to this email or write to support@digitip.app.</p>
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
    html: darkLayout(`
    <tr><td style="padding:32px 32px 24px;border-bottom:1px solid #1e1e1e">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#fff">Digitip</div>
      <div style="font-size:13px;color:#666;margin-top:2px">Programme ambassadeur</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#22c55e22;color:#22c55e;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● Candidature reçue</div>
      <div style="font-size:26px;font-weight:800;letter-spacing:-0.03em;color:#fff;margin-bottom:10px">Merci ${firstName} !</div>
      <div style="font-size:14px;color:#888">Ta candidature au programme ambassadeur Digitip a bien été reçue.</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p style="font-size:13px;color:#888;margin:0;line-height:1.7">Notre équipe l'examine et revient vers toi très prochainement. En attendant, n'hésite pas à répondre à cet email si tu as des questions.</p>
    </td></tr>`),
  });
}

// ─── Ambassador recruitment — internal admin alert ────────────────────────────

export async function sendAmbassadorApplicationAdmin(opts: {
  firstName: string;
  lastName: string;
  city: string;
  phone: string;
  email: string;
  siret: string;
  notes?: string | null;
}): Promise<void> {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!resend || !adminEmail) return;

  const { firstName, lastName, city, phone, email, siret, notes } = opts;

  await resend.emails.send({
    from: FROM,
    to: adminEmail,
    replyTo: email,
    subject: `Nouvelle candidature ambassadeur — ${firstName} ${lastName}`,
    html: darkLayout(`
    <tr><td style="padding:32px 32px 24px;border-bottom:1px solid #1e1e1e">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#fff">Digitip Admin</div>
      <div style="font-size:13px;color:#666;margin-top:2px">Nouvelle candidature ambassadeur</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="font-size:26px;font-weight:800;letter-spacing:-0.03em;color:#fff;margin-bottom:4px">${firstName} ${lastName}</div>
      <div style="font-size:14px;color:#888">${city}</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:10px;border:1px solid #222;overflow:hidden">
        ${infoRow('Email', `<a href="mailto:${email}" style="color:#60a5fa;text-decoration:none">${email}</a>`)}
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
    html: darkLayout(`
    <tr><td style="padding:32px 32px 24px;border-bottom:1px solid #1e1e1e">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#fff">Digitip</div>
      <div style="font-size:13px;color:#666;margin-top:2px">Programme ambassadeur</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#22c55e22;color:#22c55e;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● Compte configuré</div>
      <div style="font-size:26px;font-weight:800;letter-spacing:-0.03em;color:#fff;margin-bottom:10px">Tout est prêt, ${firstName} !</div>
      <div style="font-size:14px;color:#888">Ton compte bancaire Stripe a bien été enregistré. Tu recevras tes commissions directement sur ton IBAN lors de chaque virement.</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p style="font-size:13px;color:#888;margin:0;line-height:1.7">Les virements sont déclenchés manuellement par notre équipe après validation. Tu seras notifié par email à chaque paiement.</p>
      <p style="font-size:12px;color:#444;margin:16px 0 0;line-height:1.6">Questions ? Réponds à cet email ou écris à support@digitip.app.</p>
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
    html: darkLayout(`
    <tr><td style="padding:32px 32px 24px;border-bottom:1px solid #1e1e1e">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#fff">Digitip Admin</div>
      <div style="font-size:13px;color:#666;margin-top:2px">Nouvelle commande SmartTag</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="font-size:26px;font-weight:800;letter-spacing:-0.03em;color:#fff;margin-bottom:4px">${customerName}</div>
      ${customerEmail ? `<div style="font-size:14px;color:#888">${customerEmail}</div>` : ''}
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:10px;border:1px solid #222;overflow:hidden">
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

// ─── Ambassador — templated email sent by super admin ─────────────────────────
// `bodyHtml` is the rendered HTML body (placeholders already substituted by
// the caller via renderTemplate). It is wrapped in the Digitip dark layout.

export async function sendAmbassadorTemplatedEmail(opts: {
  to: string;
  subject: string;
  bodyHtml: string;
  replyTo?: string;
}): Promise<{ id: string | null }> {
  if (!resend) return { id: null };
  const { to, subject, bodyHtml, replyTo } = opts;

  const html = darkLayout(`
    <tr><td style="padding:32px 32px 24px;border-bottom:1px solid #1e1e1e">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#fff">Digitip</div>
      <div style="font-size:13px;color:#666;margin-top:2px">Programme ambassadeur</div>
    </td></tr>
    <tr><td style="padding:28px 32px 16px;color:#ddd;font-size:14px;line-height:1.6">
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
    html: darkLayout(`
    <tr><td style="padding:32px 32px 24px;border-bottom:1px solid #1e1e1e">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#fff">Digitip</div>
      <div style="font-size:13px;color:#666;margin-top:2px">Contrat ambassadeur</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#fff;margin-bottom:8px">${firstName}, un contrat t'attend</div>
      <div style="font-size:14px;color:#888;line-height:1.6">Tu peux le lire et le signer en ligne, depuis ton dashboard sécurisé par PIN. Aucune impression ni signature manuscrite requise.</div>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p><a href="${dashboardUrl}" style="display:inline-block;padding:12px 22px;background:#22c55e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Lire &amp; signer le contrat →</a></p>
      <p style="font-size:12px;color:#444;margin:18px 0 0;line-height:1.6">Pour ta protection, la signature s'effectue après lecture intégrale et acceptation explicite. Une copie te sera envoyée par email après signature.</p>
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
    html: darkLayout(`
    <tr><td style="padding:32px 32px 24px;border-bottom:1px solid #1e1e1e">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#fff">Digitip</div>
      <div style="font-size:13px;color:#666;margin-top:2px">Contrat signé</div>
    </td></tr>
    <tr><td style="padding:28px 32px 20px">
      <div style="display:inline-block;background:#22c55e22;color:#22c55e;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-bottom:14px">● Signé</div>
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#fff;margin-bottom:8px">${firstName}, ton contrat est signé ✓</div>
      <div style="font-size:14px;color:#888;line-height:1.6">${contractTitle}</div>
    </td></tr>
    <tr><td style="padding:0 32px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:10px;border:1px solid #222;overflow:hidden">
        ${infoRow('Signé le', new Date(signedAt).toLocaleString('fr-FR'))}
        ${infoRow('Empreinte SHA-256', `<span style="font-family:monospace">${shortHash}…</span>`)}
      </table>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p><a href="${downloadUrl}" style="display:inline-block;padding:10px 18px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;border:1px solid #333">Télécharger / imprimer →</a></p>
      <p style="font-size:12px;color:#444;margin:18px 0 0;line-height:1.6">Conserve cet email comme preuve. Le contenu intégral du contrat reste accessible depuis ton dashboard et ne peut plus être modifié.</p>
    </td></tr>`),
  });
}
