import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { COMMISSION_BY_PACK, REFERRAL_REWARDS, REFERRAL_VALIDATION_MIN_SALES } from '@/lib/ambassador-tiers';

// Every email Digitip sends goes through this file.
//
// One layout, one way of writing. Each email says what happened, what (if
// anything) the reader has to do, and stops. No badges, no emoji in body
// copy, no first name stuffed into the subject line: an email that looks like
// a notification gets read as one, and a subject that greets by name is what
// spam looks like.
//
// Facts in these emails are the product's facts, checked against the code:
// tips are paid to the establishment's account, which passes them on with
// the salary; nothing is ever paid to an employee's own bank account.

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = 'Digitip <noreply@digitip.app>';
const FROM_AMBASSADOR = process.env.RESEND_FROM_AMBASSADOR_OUTREACH ?? 'Digitip <ambassadeur@digitip.app>';
// noreply@ has no mailbox. Every email that says "reply to this email" needs
// the reply to land somewhere a person reads.
const REPLY_TO = 'Digitip <contact@digitip.app>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://digitip.app';

type Lang = 'fr' | 'en';

/** 'fr' unless the value clearly says English. French venues, French default. */
export function emailLang(raw: string | null | undefined): Lang {
  return typeof raw === 'string' && raw.toLowerCase().startsWith('en') ? 'en' : 'fr';
}

/** The tipper's language, carried on the PaymentIntent as `metadata.locale`. */
export const tipperLocale = emailLang;

const pick = (lang: Lang, fr: string, en: string) => (lang === 'en' ? en : fr);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const esc = (s: string | null | undefined) => escapeHtml(s ?? '');

function money(cents: number, currency = 'EUR', lang: Lang = 'fr'): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** "Bonjour Clara," or "Bonjour," when there is no usable first name. */
function hello(lang: Lang, firstName?: string | null): string {
  const name = (firstName ?? '').trim();
  return lang === 'en'
    ? (name ? `Hello ${esc(name)},` : 'Hello,')
    : (name ? `Bonjour ${esc(name)},` : 'Bonjour,');
}

function helloTu(firstName?: string | null): string {
  const name = (firstName ?? '').trim();
  return name ? `Salut ${esc(name)},` : 'Salut,';
}

// ─── Layout ───────────────────────────────────────────────────────────────────
//
// Light by default (inline styles), dark through `prefers-color-scheme` and
// Outlook.com's `[data-ogsc]`. `!important` lets the media query override the
// inline defaults in the clients that support it.

const DARK = `
  .email-body{background:#0a0a0d!important;color:#f2f2f5!important}
  .card{background:#17171d!important;border-color:#2e2e38!important}
  .rule{border-color:#2e2e38!important}
  .panel{background:#1f1f27!important;border-color:#2e2e38!important}
  .row{border-color:#2e2e38!important}
  .t1{color:#f2f2f5!important}
  .t2{color:#c9c9d4!important}
  .t3{color:#8a8a99!important}
  .btn{background:#ffffff!important;color:#0f0f12!important}
`;

const THEME_STYLE = `
  :root{color-scheme:light dark;supported-color-schemes:light dark}
  body{margin:0;padding:0}
  a{color:#C2547A}
  @media (prefers-color-scheme: dark){${DARK}}
  ${DARK.trim().split('\n').map((l) => `[data-ogsc] ${l.trim()}`).join('\n  ')}
`;

const C = { t1: '#0f0f12', t2: '#3f3f4a', t3: '#7a7a88', rule: '#ececf0', panel: '#f7f7f9' };

type Block = string;

const block = {
  title: (s: string): Block =>
    `<h1 class="t1" style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:${C.t1}">${s}</h1>`,
  p: (s: string): Block =>
    `<p class="t2" style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${C.t2}">${s}</p>`,
  small: (s: string): Block =>
    `<p class="t3" style="margin:14px 0 0;font-size:13px;line-height:1.55;color:${C.t3}">${s}</p>`,
  strong: (s: string) => `<strong class="t1" style="color:${C.t1}">${s}</strong>`,
  link: (label: string, url: string) => `<a href="${url}" style="color:#C2547A">${label}</a>`,
  button: (label: string, url: string): Block =>
    `<table cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr><td>
      <a href="${url}" class="btn" style="display:inline-block;padding:12px 22px;background:#0f0f12;color:#ffffff;font-size:15px;font-weight:600;border-radius:8px;text-decoration:none">${label}</a>
    </td></tr></table>`,
  list: (items: string[], ordered = false): Block =>
    `<${ordered ? 'ol' : 'ul'} class="t2" style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.6;color:${C.t2}">
      ${items.map((i) => `<li style="margin:0 0 6px">${i}</li>`).join('')}
    </${ordered ? 'ol' : 'ul'}>`,
  details: (rows: Array<[string, string] | null | false>): Block => {
    const kept = rows.filter((r): r is [string, string] => Array.isArray(r));
    return `<table width="100%" cellpadding="0" cellspacing="0" class="panel" style="margin:4px 0 18px;background:${C.panel};border:1px solid ${C.rule};border-radius:8px">
      ${kept.map(([k, v], i) => `<tr><td class="row t3" style="padding:10px 14px;font-size:13px;color:${C.t3};${i ? `border-top:1px solid ${C.rule};` : ''}">${k}</td><td class="row t1" style="padding:10px 14px;font-size:14px;text-align:right;color:${C.t1};${i ? `border-top:1px solid ${C.rule};` : ''}">${v}</td></tr>`).join('')}
    </table>`;
  },
  mono: (s: string) => `<span style="font-family:ui-monospace,Menlo,monospace">${s}</span>`,
};

/**
 * The whole email. `preheader` is the line inbox previews show next to the
 * subject; without one they show the first words of the layout instead.
 * `footer` replaces the default sign-off line (for unsubscribe links and the
 * legal identification cold emails must carry).
 */
function layout(opts: { lang: Lang; preheader: string; body: Block[]; footer?: string }): string {
  const footer = opts.footer ?? pick(opts.lang,
    'Digitip · le pourboire par carte, sans contact · digitip.app',
    'Digitip · card tips, contactless · digitip.app');
  return `<!DOCTYPE html>
<html lang="${opts.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style>${THEME_STYLE}</style>
</head>
<body class="email-body" style="margin:0;padding:0;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.t1}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</div>
  <table width="100%" cellpadding="0" cellspacing="0" class="email-body" style="background:#f4f4f6"><tr><td align="center" style="padding:32px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" class="card" style="max-width:560px;background:#ffffff;border:1px solid ${C.rule};border-radius:12px">
      <tr><td style="padding:28px 32px 0">
        <div class="t1" style="font-size:18px;font-weight:800;letter-spacing:-0.02em;color:${C.t1}">Digitip</div>
      </td></tr>
      <tr><td style="padding:22px 32px 18px">
        ${opts.body.join('\n')}
      </td></tr>
      <tr><td class="rule t3" style="padding:16px 32px 22px;border-top:1px solid ${C.rule};font-size:12px;line-height:1.55;color:${C.t3}">${footer}</td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
}

/** Plain-text twin of the HTML. Spam filters and some readers want one. */
function toText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<div style="display:none[\s\S]*?<\/div>/i, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, url: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, '').trim();
      return text && text !== url ? `${text} (${url})` : url;
    })
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|h1|tr|li|ul|ol|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type Attachment = { filename: string; content: Buffer | string };

type Outgoing = {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  attachments?: Attachment[];
  headers?: Record<string, string>;
};

/**
 * Sends through Resend and returns the message id. Throws on a rejected send:
 * callers that must not fail (a webhook) catch it themselves, and callers that
 * record the outcome (the lifecycle engine) need to see it.
 */
async function deliver(m: Outgoing): Promise<{ id: string | null }> {
  if (!resend) {
    throw new Error('RESEND_API_KEY is not configured, refusing to report an email as sent.');
  }
  const result = await resend.emails.send({
    from: m.from ?? FROM,
    to: m.to,
    subject: m.subject,
    html: m.html,
    text: toText(m.html),
    replyTo: m.replyTo ?? REPLY_TO,
    ...(m.attachments?.length ? { attachments: m.attachments } : {}),
    ...(m.headers ? { headers: m.headers } : {}),
  });
  if (result.error) throw new Error(result.error.message || 'Resend send failed');
  return { id: result.data?.id ?? null };
}

/** For emails whose callers predate `deliver` and expect a silent no-op without a key. */
async function deliverQuietly(m: Outgoing): Promise<void> {
  if (!resend) return;
  await deliver(m);
}

const replyHint = (lang: Lang) => pick(lang,
  'Une question ? Répondez simplement à cet e-mail.',
  'Any question? Just reply to this email.');

function packLabel(pack: string, lang: Lang): string {
  const names: Record<string, [string, string]> = {
    solo: ['Solo (1 plaque)', 'Solo (1 plaque)'],
    duo: ['Duo (2 plaques)', 'Duo (2 plaques)'],
  };
  const n = names[pack];
  return n ? pick(lang, n[0], n[1]) : pack.toUpperCase();
}

const shortRef = (id: string) => id.slice(0, 8).toUpperCase();

/** "1er octobre", "7 octobre": French writes the first of the month as an ordinal. */
function frenchDay(iso: string): string {
  const d = new Date(iso);
  const day = Number(new Intl.DateTimeFormat('fr-FR', { day: 'numeric', timeZone: 'Europe/Paris' }).format(d));
  const month = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'Europe/Paris' }).format(d);
  return `${day === 1 ? '1er' : day} ${month}`;
}

/** "7 octobre 2026 à 12:00", Paris time. */
function signedLabel(iso: string): string {
  const d = new Date(iso);
  const year = new Intl.DateTimeFormat('fr-FR', { year: 'numeric', timeZone: 'Europe/Paris' }).format(d);
  const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(d);
  return `${frenchDay(iso)} ${year} à ${time}`;
}

// ═══ Tippers ═══════════════════════════════════════════════════════════════════
//
// The three emails a customer can get after tipping, in the language of the
// page they tipped from. They are not our users: no account, no marketing.

/** "Clara chez Le Comptoir", or "l'équipe chez Le Comptoir" for a team tip. */
function tipRecipient(lang: Lang, staffName: string | null, establishmentName: string): string {
  const est = esc(establishmentName);
  if (staffName) {
    const who = block.strong(esc(staffName.trim().split(/\s+/)[0] || staffName));
    if (!est) return who;
    return pick(lang, `${who} chez ${est}`, `${who} at ${est}`);
  }
  return est
    ? pick(lang, `l’équipe chez ${block.strong(est)}`, `the team at ${block.strong(est)}`)
    : pick(lang, 'l’équipe', 'the team');
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
  locale: Lang;
}): Promise<void> {
  const { to, amount, tipAmount, currency, staffName, establishmentName, transactionId, locale: lang } = opts;
  const total = money(amount, currency, lang);
  const fee = Math.max(0, amount - tipAmount);

  await deliverQuietly({
    to,
    subject: pick(lang, `Votre reçu : pourboire de ${money(tipAmount, currency, lang)}`, `Your receipt: ${money(tipAmount, currency, lang)} tip`),
    html: layout({
      lang,
      preheader: pick(lang, `${total} débités. Merci pour votre pourboire.`, `${total} charged. Thank you for your tip.`),
      body: [
        block.title(pick(lang, 'Merci pour votre pourboire', 'Thank you for your tip')),
        block.p(pick(lang,
          `Votre pourboire pour ${tipRecipient(lang, staffName, establishmentName)} est bien passé.`,
          `Your tip for ${tipRecipient(lang, staffName, establishmentName)} went through.`)),
        block.details([
          [pick(lang, 'Pourboire', 'Tip'), money(tipAmount, currency, lang)],
          fee > 0 && [pick(lang, 'Frais de service', 'Service fee'), money(fee, currency, lang)],
          [pick(lang, 'Total débité', 'Total charged'), block.strong(total)],
          [pick(lang, 'Référence', 'Reference'), block.mono(shortRef(transactionId))],
        ]),
        block.small(pick(lang,
          'Le paiement est traité par Stripe. Digitip encaisse le pourboire puis le verse à l’établissement, qui le remet à son équipe.',
          'The payment is processed by Stripe. Digitip collects the tip and pays it to the business, which passes it on to its team.')),
        block.small(replyHint(lang)),
      ],
    }),
  });
}

export async function sendPaymentFailed(opts: {
  to: string;
  amount: number;
  currency: string;
  /** Null for a team tip. */
  staffName: string | null;
  establishmentName: string;
  locale: Lang;
}): Promise<void> {
  const { to, amount, currency, staffName, establishmentName, locale: lang } = opts;
  const formatted = money(amount, currency, lang);

  await deliverQuietly({
    to,
    subject: pick(lang, 'Votre pourboire n’est pas passé', 'Your tip did not go through'),
    html: layout({
      lang,
      preheader: pick(lang, 'Rien n’a été débité sur votre carte.', 'Nothing was charged to your card.'),
      body: [
        block.title(pick(lang, 'Votre pourboire n’est pas passé', 'Your tip did not go through')),
        block.p(pick(lang,
          `Le paiement de ${block.strong(formatted)} pour ${tipRecipient(lang, staffName, establishmentName)} a été refusé. Rien n’a été débité sur votre carte.`,
          `The payment of ${block.strong(formatted)} for ${tipRecipient(lang, staffName, establishmentName)} was declined. Nothing was charged to your card.`)),
        block.p(pick(lang,
          'Pour réessayer, scannez de nouveau la plaque ou rouvrez la page du pourboire. Si le refus se répète, votre banque pourra vous dire pourquoi.',
          'To try again, scan the plaque again or reopen the tip page. If it keeps being declined, your bank can tell you why.')),
        block.small(replyHint(lang)),
      ],
    }),
  });
}

export async function sendTipRefunded(opts: {
  to: string;
  amount: number;
  currency: string;
  /** Null for a team tip. */
  staffName: string | null;
  establishmentName: string;
  locale: Lang;
}): Promise<void> {
  const { to, amount, currency, staffName, establishmentName, locale: lang } = opts;
  const formatted = money(amount, currency, lang);

  await deliverQuietly({
    to,
    subject: pick(lang, `Votre pourboire est remboursé (${formatted})`, `Your tip has been refunded (${formatted})`),
    html: layout({
      lang,
      preheader: pick(lang, 'Le remboursement arrive sous 5 à 10 jours ouvrés.', 'The refund arrives within 5 to 10 business days.'),
      body: [
        block.title(pick(lang, 'Votre pourboire est remboursé', 'Your tip has been refunded')),
        block.p(pick(lang,
          `Nous vous remboursons ${block.strong(formatted)} sur votre pourboire pour ${tipRecipient(lang, staffName, establishmentName)}.`,
          `We are refunding ${block.strong(formatted)} of your tip for ${tipRecipient(lang, staffName, establishmentName)}.`)),
        block.p(pick(lang,
          'La somme revient sur la carte utilisée, en général sous 5 à 10 jours ouvrés selon votre banque. Vous n’avez rien à faire.',
          'The money goes back to the card you used, usually within 5 to 10 business days depending on your bank. There is nothing you need to do.')),
        block.small(replyHint(lang)),
      ],
    }),
  });
}

// ═══ Plaque orders ═════════════════════════════════════════════════════════════

export async function sendOrderConfirmation(opts: {
  to: string;
  pack: string;
  quantity: number;
  orderId: string;
  invoicePdfUrl?: string | null;
  setupUrl?: string | null;
  locale?: string;
}): Promise<void> {
  const { to, pack, quantity, orderId, invoicePdfUrl, setupUrl } = opts;
  const lang = emailLang(opts.locale);
  const label = packLabel(pack, lang);

  await deliverQuietly({
    to,
    subject: pick(lang, `Commande confirmée : pack ${label}`, `Order confirmed: ${label} pack`),
    html: layout({
      lang,
      preheader: pick(lang, 'Vos plaques partent sous 3 jours ouvrés.', 'Your plaques ship within 3 working days.'),
      body: [
        block.title(pick(lang, 'Merci pour votre commande', 'Thank you for your order')),
        block.p(pick(lang,
          'Nous préparons vos plaques et les expédions sous 3 jours ouvrés. Dès qu’elles partent, vous recevez un e-mail avec le numéro de suivi.',
          'We are preparing your plaques and will ship them within 3 working days. As soon as they leave, you get an email with the tracking number.')),
        block.details([
          ['Pack', label],
          [pick(lang, 'Quantité', 'Quantity'), String(quantity)],
          [pick(lang, 'Référence', 'Reference'), block.mono(shortRef(orderId))],
          invoicePdfUrl ? [pick(lang, 'Facture', 'Invoice'), block.link(pick(lang, 'Télécharger (PDF)', 'Download (PDF)'), invoicePdfUrl)] : null,
        ]),
        ...(setupUrl
          ? [
              block.p(pick(lang,
                `${block.strong('Créez votre espace en attendant.')} Sans lui, la plaque ne peut pas recevoir de pourboires. Comptez quelques minutes : votre établissement, le compte qui recevra les pourboires, votre équipe. La plaque marchera dès son arrivée.`,
                `${block.strong('Set up your account while you wait.')} Without it, the plaque cannot take tips. It takes a few minutes: your business, the account that receives the tips, your team. The plaque will work the moment it arrives.`)),
              block.button(pick(lang, 'Créer mon espace', 'Set up my account'), setupUrl),
            ]
          : []),
        block.small(replyHint(lang)),
      ],
    }),
  });
}

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
  const { to, pack, quantity, orderId, onboardingUrl, setupRequired = false } = opts;
  const lang = emailLang(opts.locale);
  const trackingNumber = normalizeTrackingNumber(opts.trackingNumber);
  const trackingUrl = trackingNumber ? laPosteTrackingUrl(trackingNumber) : null;
  const plural = quantity > 1;

  // Thrown, not swallowed: the admin action reports to the admin whether the
  // customer was actually told.
  await deliver({
    to,
    subject: pick(lang, plural ? 'Vos plaques sont parties' : 'Votre plaque est partie', plural ? 'Your plaques have shipped' : 'Your plaque has shipped'),
    html: layout({
      lang,
      preheader: pick(lang, 'Livraison en 3 à 5 jours ouvrés en France.', 'Delivery in 3 to 5 working days in France.'),
      body: [
        block.title(pick(lang, plural ? 'Vos plaques sont parties' : 'Votre plaque est partie', plural ? 'Your plaques are on their way' : 'Your plaque is on its way')),
        block.p(pick(lang,
          'Le colis a été remis à La Poste. Comptez 3 à 5 jours ouvrés en France, 4 à 7 ailleurs en Europe.',
          'The parcel is with La Poste. Allow 3 to 5 working days in France, 4 to 7 elsewhere in Europe.')),
        block.details([
          ['Pack', packLabel(pack, lang)],
          [pick(lang, 'Quantité', 'Quantity'), String(quantity)],
          [pick(lang, 'Référence', 'Reference'), block.mono(shortRef(orderId))],
          [pick(lang, 'Suivi', 'Tracking'), trackingNumber ? block.mono(esc(trackingNumber)) : pick(lang, 'non communiqué', 'not provided')],
        ]),
        ...(trackingUrl ? [block.button(pick(lang, 'Suivre le colis', 'Track the parcel'), trackingUrl)] : []),
        ...(onboardingUrl && setupRequired
          ? [
              block.p(pick(lang,
                `${block.strong('Votre compte n’est pas encore créé.')} Sans lui, la plaque ne peut pas recevoir de pourboires. Créez-le maintenant, en quelques minutes, et elle marchera dès réception.`,
                `${block.strong('Your account is not set up yet.')} Without it, the plaque cannot take tips. Set it up now, it takes a few minutes, and the plaque will work as soon as it arrives.`)),
              block.button(pick(lang, 'Créer mon compte', 'Set up my account'), onboardingUrl),
            ]
          : onboardingUrl
            ? [block.small(pick(lang,
                `Vous suivrez les pourboires dans ${block.link('votre tableau de bord', onboardingUrl)}.`,
                `You will follow the tips in ${block.link('your dashboard', onboardingUrl)}.`))]
            : []),
        block.small(replyHint(lang)),
      ],
    }),
  });
}

export async function sendOrderDelivered(opts: {
  to: string;
  pack: string;
  quantity: number;
  orderId: string;
  dashboardUrl?: string;
  locale?: string;
}): Promise<void> {
  const { to, quantity, orderId, dashboardUrl } = opts;
  const lang = emailLang(opts.locale);
  const plural = quantity > 1;

  await deliverQuietly({
    to,
    subject: pick(lang, plural ? 'Vos plaques sont livrées' : 'Votre plaque est livrée', plural ? 'Your plaques have been delivered' : 'Your plaque has been delivered'),
    html: layout({
      lang,
      preheader: pick(lang, 'Trois gestes pour vos premiers pourboires.', 'Three steps to your first tips.'),
      body: [
        block.title(pick(lang, 'Le colis est arrivé', 'Your parcel has arrived')),
        block.p(pick(lang, 'Pour recevoir vos premiers pourboires :', 'To get your first tips:')),
        block.list([
          pick(lang,
            'Posez la plaque là où le client la voit au moment de payer : près de la caisse, ou sur les tables.',
            'Put the plaque where customers see it when they pay: by the till, or on the tables.'),
          pick(lang,
            'Testez-la : approchez votre téléphone, la page de pourboire doit s’ouvrir.',
            'Test it: hold your phone near it, the tip page should open.'),
          pick(lang,
            'Prévenez l’équipe. Une phrase suffit : « Si vous voulez laisser un pourboire, c’est ici. »',
            'Tell your team. One sentence is enough: “If you’d like to leave a tip, it’s here.”'),
        ], true),
        ...(dashboardUrl ? [block.button(pick(lang, 'Ouvrir mon tableau de bord', 'Open my dashboard'), dashboardUrl)] : []),
        block.small(`${pick(lang, 'Commande', 'Order')} ${block.mono(shortRef(orderId))}. ${replyHint(lang)}`),
      ],
    }),
  });
}

export async function sendOrderCanceled(opts: {
  to: string;
  pack: string;
  quantity: number;
  orderId: string;
  reason?: string | null;
  locale?: string;
}): Promise<void> {
  const { to, pack, quantity, orderId, reason } = opts;
  const lang = emailLang(opts.locale);

  await deliverQuietly({
    to,
    subject: pick(lang, 'Votre commande est annulée', 'Your order has been canceled'),
    html: layout({
      lang,
      preheader: pick(lang, 'Remboursement intégral sous 5 à 10 jours ouvrés.', 'Full refund within 5 to 10 business days.'),
      body: [
        block.title(pick(lang, 'Votre commande est annulée', 'Your order has been canceled')),
        block.p(pick(lang,
          'Nous vous remboursons la totalité sur le moyen de paiement utilisé. Comptez 5 à 10 jours ouvrés selon votre banque.',
          'We are refunding the full amount to the payment method you used. Allow 5 to 10 business days depending on your bank.')),
        block.details([
          ['Pack', packLabel(pack, lang)],
          [pick(lang, 'Quantité', 'Quantity'), String(quantity)],
          [pick(lang, 'Référence', 'Reference'), block.mono(shortRef(orderId))],
          reason ? [pick(lang, 'Motif', 'Reason'), esc(reason)] : null,
        ]),
        block.small(pick(lang,
          'Vous n’avez pas demandé cette annulation ? Répondez à cet e-mail, on regarde tout de suite.',
          'You did not ask for this? Reply to this email and we will look into it right away.')),
      ],
    }),
  });
}

/** Free-form message from the admin to a customer about their order. */
export async function sendOrderCustomNote(opts: {
  to: string;
  orderId: string;
  subject: string;
  bodyText: string;
  locale?: string;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<void> {
  const { to, orderId, subject, bodyText, attachments = [] } = opts;
  const lang = emailLang(opts.locale);
  const paragraphs = bodyText.split(/\n{2,}/).map((para) => block.p(esc(para).replace(/\n/g, '<br>')));

  await deliverQuietly({
    to,
    subject,
    attachments,
    html: layout({
      lang,
      preheader: bodyText.slice(0, 120),
      body: [
        ...paragraphs,
        block.small(`${pick(lang, 'Commande', 'Order')} ${block.mono(shortRef(orderId))}. ${pick(lang, 'L’équipe Digitip', 'The Digitip team')}`),
      ],
    }),
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

// ═══ Internal alerts (to the Digitip team, French) ═════════════════════════════

const adminFooter = 'Alerte interne Digitip';

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
  if (opts.to.length === 0) throw new Error('no admin recipient');
  const { to, customerName, customerEmail, pack, quantity, orderId, promoCode } = opts;

  await deliver({
    to,
    ...(customerEmail ? { replyTo: customerEmail } : {}),
    subject: `Nouvelle commande : ${packLabel(pack, 'fr')}, ${customerName}`,
    html: layout({
      lang: 'fr',
      preheader: `${customerName}, ${quantity} plaque(s)`,
      footer: adminFooter,
      body: [
        block.title(`Nouvelle commande de ${esc(customerName)}`),
        block.details([
          customerEmail ? ['E-mail', esc(customerEmail)] : null,
          ['Pack', packLabel(pack, 'fr')],
          ['Quantité', String(quantity)],
          ['Référence', block.mono(shortRef(orderId))],
          promoCode ? ['Code promo', esc(promoCode)] : null,
          ['Langue', esc(opts.locale)],
        ]),
        block.small('Répondre à cet e-mail écrit directement au client.'),
      ],
    }),
  });
}

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
  if (to.length === 0) return;
  const name = `${firstName} ${lastName}`;

  await deliverQuietly({
    to,
    replyTo: email,
    subject: `Candidature ambassadeur : ${name} (${city})`,
    html: layout({
      lang: 'fr',
      preheader: `${name}, ${city}`,
      footer: adminFooter,
      body: [
        block.title(`Candidature ambassadeur de ${esc(name)}`),
        block.details([
          ['E-mail', esc(email)],
          ['Téléphone', esc(phone)],
          ['Ville', esc(city)],
          ['SIRET', siret ? block.mono(esc(siret)) : 'pas encore, à fournir avant tout paiement'],
          notes ? ['Notes', esc(notes)] : null,
        ]),
        block.button('Voir les candidatures', `${APP_URL}/fr/dashboard/admin/ambassadeurs/recrutement`),
        block.small('Répondre à cet e-mail écrit directement au candidat.'),
      ],
    }),
  });
}

/**
 * Daily digest of ambassador applications nobody has answered yet.
 *
 * This used to be two reminders sent to the APPLICANT ("ta candidature nous
 * attend", then "dernière chance, on archive"), as if the delay were theirs.
 * A pending application is waiting on us, so the reminder goes to us.
 */
export async function sendPendingApplicationsDigest(opts: {
  to: string[];
  applications: Array<{ name: string; city: string | null; createdAt: string }>;
}): Promise<void> {
  const { to, applications } = opts;
  if (to.length === 0 || applications.length === 0) return;
  const n = applications.length;

  await deliverQuietly({
    to,
    subject: `${n} candidature${n > 1 ? 's' : ''} ambassadeur sans réponse`,
    html: layout({
      lang: 'fr',
      preheader: 'Les candidats attendent une réponse depuis plus de 2 jours.',
      footer: adminFooter,
      body: [
        block.title(`${n} candidature${n > 1 ? 's attendent' : ' attend'} une réponse`),
        block.p('On a promis une réponse sous 2 jours ouvrés. Ces candidatures sont toujours en attente :'),
        block.list(applications.map((a) =>
          `${esc(a.name)}${a.city ? `, ${esc(a.city)}` : ''} (reçue le ${frenchDay(a.createdAt)})`)),
        block.button('Répondre aux candidatures', `${APP_URL}/fr/dashboard/admin/ambassadeurs/recrutement`),
      ],
    }),
  });
}

export async function sendAmbassadorPayoutAdmin(opts: {
  to: string[];
  ambassadorName: string;
  amountCents: number;
  status: 'paid' | 'failed';
}): Promise<void> {
  const { to, ambassadorName, amountCents, status } = opts;
  if (to.length === 0) return;
  const amount = money(amountCents);
  const paid = status === 'paid';

  await deliverQuietly({
    to,
    subject: paid
      ? `Virement ambassadeur effectué : ${ambassadorName}, ${amount}`
      : `Virement ambassadeur ÉCHOUÉ : ${ambassadorName}, ${amount}`,
    html: layout({
      lang: 'fr',
      preheader: paid ? 'Versé sur son compte Stripe.' : 'À reprendre depuis l’admin.',
      footer: adminFooter,
      body: [
        block.title(paid ? `${esc(ambassadorName)} a retiré ${amount}` : `Le virement de ${esc(ambassadorName)} a échoué`),
        block.p(paid
          ? 'Le montant est versé sur son compte Stripe. Il ne comprend que la commission de base et les bonus validés.'
          : `La demande de ${amount} n’a pas abouti. Le solde n’a pas été débité : reprends le virement depuis l’admin.`),
      ],
    }),
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
  if (to.length === 0) return;
  const name = `${firstName} ${lastName}`;

  await deliverQuietly({
    to,
    replyTo: email,
    subject: `Candidature commercial pro : ${name} (${companyName})`,
    html: layout({
      lang: 'fr',
      preheader: `${companyName}, ${city}`,
      footer: adminFooter,
      body: [
        block.title(`Candidature commercial pro de ${esc(name)}`),
        block.details([
          ['Société', esc(companyName)],
          ['E-mail', esc(email)],
          ['Téléphone', esc(phone)],
          ['Ville', esc(city)],
          sector ? ['Secteur', esc(sector)] : null,
          ['Statut', esc(VRP_STATUS_LABELS[vrpStatus] ?? vrpStatus)],
          ['Forme juridique', esc(LEGAL_FORM_LABELS[legalForm] ?? legalForm)],
          ['SIRET', block.mono(esc(siret))],
          ['TVA', vatNumber ? block.mono(esc(vatNumber)) : 'non renseignée (franchise probable)'],
          notes ? ['Notes', esc(notes)] : null,
        ]),
        block.small('Répondre à cet e-mail écrit directement au candidat.'),
      ],
    }),
  });
}

const LEGAL_FORM_LABELS: Record<string, string> = {
  sarl: 'SARL', sas: 'SAS', sasu: 'SASU', ei: 'Entreprise individuelle',
  auto_entrepreneur: 'Auto-entrepreneur', eurl: 'EURL', sa: 'SA', autre: 'Autre',
};

const VRP_STATUS_LABELS: Record<string, string> = {
  vrp_exclusif: 'VRP exclusif', vrp_multicarte: 'VRP multicarte',
  agent_commercial: 'Agent commercial', independant: 'Commercial indépendant', autre: 'Autre',
};

// ═══ Ambassadors (French, "tu", as everywhere in the programme) ═══════════════

const euros = (cents: number) => `${Math.round(cents / 100)} €`;
const SOLO = euros(COMMISSION_BY_PACK.solo);
const DUO = euros(COMMISSION_BY_PACK.duo);

export async function sendAmbassadorApplicationConfirmation(opts: {
  to: string;
  firstName: string;
}): Promise<void> {
  await deliverQuietly({
    to: opts.to,
    subject: 'On a bien reçu ta candidature ambassadeur',
    html: layout({
      lang: 'fr',
      preheader: 'Réponse sous 2 jours ouvrés.',
      body: [
        block.p(helloTu(opts.firstName)),
        block.p('Merci pour ta candidature au programme ambassadeur Digitip. On la lit et on te répond par e-mail sous 2 jours ouvrés.'),
        block.p(`Pour être payé, il te faudra un SIRET. Si tu n’en as pas encore, la micro-entreprise se crée en ligne gratuitement sur ${block.link('autoentrepreneur.urssaf.fr', 'https://autoentrepreneur.urssaf.fr')}.`),
        block.small('Une question ? Réponds simplement à cet e-mail.'),
      ],
    }),
  });
}

export async function sendReferralWelcomeToCandidate(opts: {
  to: string;
  firstName: string;
  parrainName: string;
}): Promise<void> {
  const parrain = esc(opts.parrainName);
  await deliverQuietly({
    to: opts.to,
    subject: 'On a bien reçu ta candidature ambassadeur',
    html: layout({
      lang: 'fr',
      preheader: `Recommandé par ${opts.parrainName}. Réponse sous 2 jours ouvrés.`,
      body: [
        block.p(helloTu(opts.firstName)),
        block.p(`Merci pour ta candidature au programme ambassadeur Digitip, sur la recommandation de ${block.strong(parrain)}. On la lit et on te répond par e-mail sous 2 jours ouvrés.`),
        block.p(`Pour être payé, il te faudra un SIRET. Si tu n’en as pas encore, la micro-entreprise se crée en ligne gratuitement sur ${block.link('autoentrepreneur.urssaf.fr', 'https://autoentrepreneur.urssaf.fr')}.`),
        block.small('Une question ? Réponds simplement à cet e-mail.'),
      ],
    }),
  });
}

/** An ambassador invites someone they know, from their dashboard. */
export async function sendReferralEmailFromAmbassador(opts: {
  to: string;
  parrainName: string;
  referralCode: string;
}): Promise<void> {
  const parrain = esc(opts.parrainName);
  const link = `${APP_URL}/devenir-ambassadeur?ref=${encodeURIComponent(opts.referralCode)}`;
  await deliverQuietly({
    from: FROM_AMBASSADOR,
    to: opts.to,
    subject: `${opts.parrainName} t’invite à devenir ambassadeur Digitip`,
    html: layout({
      lang: 'fr',
      preheader: `${SOLO} à ${DUO} par commerce équipé.`,
      footer: `Tu reçois cet e-mail parce que ${parrain} a saisi ton adresse pour t’inviter. On ne t’écrira pas d’autre fois à ce sujet. Digitip · YUZU LABS SAS · contact@digitip.app`,
      body: [
        block.p('Salut,'),
        block.p(`${block.strong(parrain)} est ambassadeur Digitip et pense que ça pourrait te plaire.`),
        block.p(`Le principe : tu présentes nos plaques de pourboire par carte aux restaurants, cafés et salons autour de toi. Pour chaque commerce qui s’équipe avec ton code, tu touches ${block.strong(SOLO)} (pack Solo) ou ${block.strong(DUO)} (pack Duo). Pas de stock, rien à avancer, pas d’engagement. Il faut juste un SIRET pour être payé.`),
        block.button('Découvrir le programme', link),
      ],
    }),
  });
}

export async function sendReferralValidatedToParrain(
  service: SupabaseClient<Database>,
  parrainId: string,
  filleulName: string,
  amountCents: number,
): Promise<void> {
  const { data: parrain } = await service
    .from('ambassadors')
    .select('email, name')
    .eq('id', parrainId)
    .maybeSingle();
  if (!parrain?.email) return;
  const amount = euros(amountCents);

  await deliverQuietly({
    to: parrain.email,
    subject: `Parrainage validé : ${amount} de plus sur ton solde`,
    html: layout({
      lang: 'fr',
      preheader: `${filleulName} a fait sa ${REFERRAL_VALIDATION_MIN_SALES}e vente.`,
      body: [
        block.p(helloTu((parrain.name ?? '').split(' ')[0])),
        block.p(`${block.strong(esc(filleulName))}, que tu as parrainé, vient de faire sa ${REFERRAL_VALIDATION_MIN_SALES}e vente. Ton bonus de ${block.strong(amount)} est crédité sur ton solde : tu peux le retirer avec ta prochaine demande de virement.`),
        block.p(`Pour la suite : ${euros(REFERRAL_REWARDS.milestone_5)} de plus quand 5 de tes filleuls sont validés, et ${euros(REFERRAL_REWARDS.milestone_10)} à 10.`),
      ],
    }),
  });
}

export async function sendAmbassadorContractInvitation(opts: {
  to: string;
  firstName: string;
  contractTitle: string;
  dashboardUrl: string;
}): Promise<void> {
  const { to, firstName, contractTitle, dashboardUrl } = opts;
  await deliverQuietly({
    to,
    subject: `Ton contrat à signer : ${contractTitle}`,
    html: layout({
      lang: 'fr',
      preheader: 'À lire et signer en ligne, depuis ton espace.',
      body: [
        block.p(helloTu(firstName)),
        block.p(`Ton contrat ${block.strong(esc(contractTitle))} est prêt. Tu le lis et tu le signes en ligne, depuis ton espace ambassadeur (ton code PIN te sera demandé). Rien à imprimer.`),
        block.button('Lire et signer', dashboardUrl),
        block.small('Après la signature, tu reçois une copie par e-mail.'),
      ],
    }),
  });
}

export async function sendSignedContractCopy(opts: {
  to: string;
  firstName: string;
  contractTitle: string;
  signedAt: string;
  contentHash: string;
  downloadUrl: string;
}): Promise<void> {
  const { to, firstName, contractTitle, signedAt, contentHash, downloadUrl } = opts;
  await deliverQuietly({
    to,
    subject: `Contrat signé : ${contractTitle}`,
    html: layout({
      lang: 'fr',
      preheader: 'Ta copie du contrat signé.',
      body: [
        block.p(helloTu(firstName)),
        block.p(`Ton contrat ${block.strong(esc(contractTitle))} est signé. Garde cet e-mail : il prouve la signature et la version du texte.`),
        block.details([
          ['Signé le', signedLabel(signedAt)],
          ['Empreinte du texte (SHA-256)', block.mono(`${contentHash.slice(0, 16)}…`)],
        ]),
        block.button('Télécharger le contrat', downloadUrl),
        block.small('Le texte signé ne peut plus être modifié. Il reste consultable depuis ton espace.'),
      ],
    }),
  });
}

/**
 * A template the admin writes and sends from the dashboard. `bodyHtml` is
 * already rendered (placeholders substituted, values escaped).
 */
export async function sendAmbassadorTemplatedEmail(opts: {
  to: string;
  subject: string;
  bodyHtml: string;
  replyTo?: string;
}): Promise<{ id: string | null }> {
  if (!resend) return { id: null };
  return deliver({
    to: opts.to,
    subject: opts.subject,
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    html: layout({
      lang: 'fr',
      preheader: opts.subject,
      body: [`<div class="t2" style="font-size:15px;line-height:1.6;color:${C.t2}">${opts.bodyHtml}</div>`],
    }),
  });
}

// ═══ Commercial pros (French, "vous") ═════════════════════════════════════════

export async function sendCommercialApplicationConfirmation(opts: {
  to: string;
  firstName: string;
}): Promise<void> {
  await deliverQuietly({
    to: opts.to,
    subject: 'Votre candidature au programme partenaire Digitip',
    html: layout({
      lang: 'fr',
      preheader: 'Réponse sous 48 heures ouvrées.',
      body: [
        block.p(hello('fr', opts.firstName)),
        block.p('Merci pour votre candidature au programme partenaire Digitip. Nous l’étudions et vous répondons sous 48 heures ouvrées.'),
        block.p('Si elle est retenue, vous recevrez votre contrat d’apporteur d’affaires à signer en ligne, puis votre code commercial et l’accès à votre tableau de bord.'),
        block.small(replyHint('fr')),
      ],
    }),
  });
}

export async function sendCommercialContractInvitation(opts: {
  to: string;
  firstName: string;
  contractTitle: string;
  dashboardUrl: string;
}): Promise<void> {
  const { to, firstName, contractTitle, dashboardUrl } = opts;
  await deliverQuietly({
    to,
    subject: `Votre contrat d’apporteur d’affaires à signer : ${contractTitle}`,
    html: layout({
      lang: 'fr',
      preheader: 'À lire et signer en ligne, depuis votre espace.',
      body: [
        block.p(hello('fr', firstName)),
        block.p(`Votre contrat ${block.strong(esc(contractTitle))} est prêt. Vous pouvez le lire en entier et le signer en ligne, depuis votre espace commercial (votre code PIN vous sera demandé). Rien à imprimer ni à renvoyer.`),
        block.button('Lire et signer le contrat', dashboardUrl),
        block.small('La signature électronique vous engage comme une signature sur papier (article 1367 du Code civil). Vous recevrez une copie horodatée du contrat signé par e-mail.'),
      ],
    }),
  });
}

export async function sendSignedCommercialContractCopy(opts: {
  to: string;
  firstName: string;
  contractTitle: string;
  signedAt: string;
  contentHash: string;
  downloadUrl: string;
}): Promise<void> {
  const { to, firstName, contractTitle, signedAt, contentHash, downloadUrl } = opts;
  await deliverQuietly({
    to,
    subject: `Contrat signé : ${contractTitle}`,
    html: layout({
      lang: 'fr',
      preheader: 'Votre copie du contrat signé.',
      body: [
        block.p(hello('fr', firstName)),
        block.p(`Votre contrat ${block.strong(esc(contractTitle))} est signé. Conservez cet e-mail : il prouve la signature et la version du texte.`),
        block.details([
          ['Signé le', signedLabel(signedAt)],
          ['Empreinte du texte (SHA-256)', block.mono(`${contentHash.slice(0, 16)}…`)],
        ]),
        block.button('Télécharger le contrat', downloadUrl),
        block.small('Le texte signé ne peut plus être modifié. Il reste consultable depuis votre espace commercial.'),
      ],
    }),
  });
}

// ═══ Cold outreach ════════════════════════════════════════════════════════════
//
// Written to strangers, so "vous", short, honest about where the address
// came from, and with the sender's legal identity and a one-click opt-out in
// every message (LCEN art. 20, RGPD art. 21).

const SENDER_IDENTITY = 'YUZU LABS SAS (Digitip) · SIREN 994&nbsp;879&nbsp;013 · 11 rue de Lorraine, 68490 Petit-Landau · privacy@digitip.app';

function coldFooter(unsubscribeUrl: string): string {
  return `Vous recevez ce message à titre professionnel : votre entreprise figure dans le répertoire public SIRENE de l’INSEE. Base légale : notre intérêt légitime (RGPD, art. 6.1.f). ${block.link('Ne plus recevoir de message', unsubscribeUrl)}, en un clic.<br>${SENDER_IDENTITY}`;
}

/** Ambassador recruitment, three steps at least four days apart (lib/cold-email/dispatch.ts). */
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
  const where = city ? ` à ${esc(city)}` : '';
  const sign = block.p('Raphaël Meyer<br>Fondateur de Digitip');

  const steps: Record<1 | 2 | 3, { subject: string; preheader: string; body: Block[] }> = {
    1: {
      subject: 'Un complément de revenu en présentant Digitip aux commerces',
      preheader: `${SOLO} à ${DUO} par commerce équipé, sans stock ni engagement.`,
      body: [
        block.p(hello('fr', firstName)),
        block.p(`Je m’appelle Raphaël, je dirige Digitip. Nous fabriquons une plaque qui permet aux clients d’un restaurant, d’un café ou d’un salon de laisser un pourboire par carte, maintenant que plus personne n’a de monnaie.`),
        block.p(`Nous cherchons des ambassadeurs${where} pour la présenter aux commerces du quartier. Pour chaque commerce qui s’équipe avec votre code, vous touchez ${block.strong(SOLO)} (pack Solo) ou ${block.strong(DUO)} (pack Duo). Pas de stock, rien à avancer, aucun engagement : votre SIRET suffit.`),
        block.button('Voir comment ça marche', landingUrl),
        sign,
      ],
    },
    2: {
      subject: 'Ce que rapporte le programme ambassadeur Digitip',
      preheader: 'Un exemple chiffré, et comment se passe une vente.',
      body: [
        block.p(hello('fr', firstName)),
        block.p('Je vous ai écrit il y a quelques jours au sujet du programme ambassadeur Digitip. Un exemple concret :'),
        block.list([
          `10 commerces équipés en pack Solo, c’est ${block.strong(euros(COMMISSION_BY_PACK.solo * 10))} de commissions.`,
          'Une vente, c’est souvent une seule visite : vous montrez la plaque, le commerçant scanne, il voit tout de suite comment ça marche.',
          'Vous êtes payé par virement depuis votre tableau de bord, dès 30 € de solde.',
        ]),
        block.p('La candidature prend deux minutes :'),
        block.button('Candidater', landingUrl),
        sign,
      ],
    },
    3: {
      subject: 'Dernier message de ma part',
      preheader: 'Je ne vous écrirai plus à ce sujet.',
      body: [
        block.p(hello('fr', firstName)),
        block.p('C’est mon dernier message au sujet du programme ambassadeur : je ne vous écrirai plus ensuite. Si le sujet vous intéresse un jour, tout est expliqué ici :'),
        block.button('Le programme ambassadeur', landingUrl),
        sign,
      ],
    },
  };

  const s = steps[step];
  try {
    const { id } = await deliver({
      from: FROM_AMBASSADOR,
      to,
      replyTo: FROM_AMBASSADOR,
      subject: s.subject,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      html: layout({ lang: 'fr', preheader: s.preheader, body: s.body, footer: coldFooter(unsubscribeUrl) }),
    });
    return { ok: true, ...(id ? { id } : {}) };
  } catch {
    return { ok: false };
  }
}

/**
 * Business-introducer recruitment, sent through Brevo from
 * partenaires.digitip.app so a reputation hit on cold outreach can never
 * reach the transactional domain.
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
  const company = companyName ? ` chez ${esc(companyName)}` : '';
  const where = city ? `, à ${esc(city)}` : '';
  const sign = block.p('Bien cordialement,<br>Raphaël Meyer<br>Fondateur de Digitip');

  const steps: Record<1 | 2 | 3, { subject: string; preheader: string; body: Block[] }> = {
    1: {
      subject: 'Apport d’affaires : une offre simple pour vos clients commerçants',
      preheader: 'Une commission fixe par commerce équipé, sans exclusivité ni quota.',
      body: [
        block.p(hello('fr', firstName)),
        block.p(`Je suis Raphaël Meyer, fondateur de Digitip. Nous fabriquons une plaque qui permet de laisser un pourboire par carte dans les commerces de proximité : restaurants, bars, cafés, hôtels, salons de coiffure et instituts.`),
        block.p(`Votre activité${company}${where} vous met en contact avec ces commerçants. Je vous propose de nous les présenter, en apporteur d’affaires : une commission fixe par commerce équipé, un contrat en bonne et due forme, une facturation entre professionnels, sans exclusivité ni quota.`),
        block.p('Pour le commerçant, l’argument est simple : ses clients n’ont plus de monnaie, et le pourboire se perd. La plaque règle ça en quelques minutes d’installation.'),
        block.button('Découvrir le programme partenaire', landingUrl),
        sign,
      ],
    },
    2: {
      subject: 'Programme partenaire Digitip : les conditions',
      preheader: 'Commission, paiement, contrat : l’essentiel en quatre points.',
      body: [
        block.p(hello('fr', firstName)),
        block.p('Je reviens vers vous avec les conditions du programme partenaire :'),
        block.list([
          'une commission fixe par commerce équipé, dont je vous envoie le détail sur simple réponse ;',
          'aucun stock ni aucun investissement de votre part ;',
          'un paiement par virement dès 30 € de solde, dans le cadre d’un contrat signé ;',
          'votre code commercial et un tableau de bord pour suivre chaque vente.',
        ]),
        block.p('Pour en parler, répondez à ce message. Pour candidater directement, comptez deux minutes :'),
        block.button('Candidater', landingUrl),
        sign,
      ],
    },
    3: {
      subject: 'Dernier message au sujet du programme partenaire',
      preheader: 'Je ne vous écrirai plus à ce sujet.',
      body: [
        block.p(hello('fr', firstName)),
        block.p('C’est mon dernier message au sujet du programme partenaire Digitip : je ne vous écrirai plus ensuite. Si le sujet vous intéresse plus tard, vous trouverez tout ici :'),
        block.button('Le programme partenaire', landingUrl),
        sign,
      ],
    },
  };

  const s = steps[step];
  const result = await brevoSendTransactionalEmail({
    sender: { email: BREVO_COMMERCIAL_SENDER.email, name: BREVO_COMMERCIAL_SENDER.name },
    to: [{ email: to, name: firstName ?? undefined }],
    replyTo: { email: BREVO_COMMERCIAL_SENDER.email, name: BREVO_COMMERCIAL_SENDER.name },
    subject: s.subject,
    htmlContent: layout({ lang: 'fr', preheader: s.preheader, body: s.body, footer: coldFooter(unsubscribeUrl) }),
    // Required by Gmail and Outlook bulk-sender rules (Feb 2024).
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, id: result.messageId };
}

// ═══ Staff ════════════════════════════════════════════════════════════════════

export async function sendStaffInviteEmail(opts: {
  to: string;
  fullName: string;
  establishmentName: string;
  inviteUrl: string;
  locale?: string;
}): Promise<{ ok: boolean }> {
  if (!resend) return { ok: false };
  const { to, fullName, establishmentName, inviteUrl } = opts;
  const lang = emailLang(opts.locale);
  const est = esc(establishmentName);

  try {
    await deliver({
      to,
      subject: pick(lang, `${establishmentName} vous ajoute à son équipe sur Digitip`, `${establishmentName} added you to its team on Digitip`),
      html: layout({
        lang,
        preheader: pick(lang, 'Activez votre compte pour apparaître sur la page de pourboire.', 'Activate your account to appear on the tip page.'),
        body: [
          block.p(hello(lang, fullName.trim().split(/\s+/)[0])),
          block.p(pick(lang,
            `${block.strong(est)} reçoit les pourboires par carte avec Digitip et vous ajoute à son équipe. Activez votre compte : vous apparaîtrez sur la page de pourboire, les clients pourront vous choisir, et vous verrez ce que vous recevez.`,
            `${block.strong(est)} takes card tips with Digitip and has added you to its team. Activate your account: you will appear on the tip page, customers will be able to choose you, and you will see what you receive.`)),
          block.p(pick(lang,
            'Les pourboires sont versés à l’établissement, qui vous les reverse avec votre salaire.',
            'Tips are paid to the business, which passes yours on with your pay.')),
          block.button(pick(lang, 'Activer mon compte', 'Activate my account'), inviteUrl),
          block.small(pick(lang,
            `Pas de mot de passe : un code à 6 chiffres sera envoyé à ${esc(to)} pour confirmer l’adresse. Vous n’attendiez pas ce message ? Ignorez-le.`,
            `No password: a 6-digit code will be sent to ${esc(to)} to confirm the address. Not expecting this? Just ignore it.`)),
        ],
      }),
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ═══ Lifecycle (dispatched by lib/email/lifecycle.ts) ══════════════════════════
//
// Each returns the Resend id and THROWS on failure, so the engine records a
// `failed` row and the send stays retryable (a phantom `sent` row would block
// the email for good, see __tests__/lib/lifecycle-send-guard.test.ts).

function lifecycleFooter(lang: Lang, unsubscribeUrl: string | null | undefined): string | undefined {
  if (!unsubscribeUrl) return undefined;
  return pick(lang,
    `Vous recevez ces conseils parce que vous utilisez Digitip. ${block.link('Ne plus les recevoir', unsubscribeUrl)}. Les e-mails sur vos paiements et votre abonnement continuent d’arriver.`,
    `You get these tips because you use Digitip. ${block.link('Stop receiving them', unsubscribeUrl)}. Emails about your payments and subscription still arrive.`);
}

async function lifecycleSend(m: { to: string; subject: string; html: string }): Promise<{ id: string | null }> {
  return deliver(m);
}

/** Group admin, sign-up started but not finished (day 2, then day 6, then never again). */
export async function sendGroupOnboardingNudge(opts: {
  to: string; firstName: string; setupUrl: string; step: 1 | 2; unsubscribeUrl?: string | null; locale?: string;
}): Promise<{ id: string | null }> {
  const { to, firstName, setupUrl, step, unsubscribeUrl } = opts;
  const lang = emailLang(opts.locale);
  const first = step === 1;
  return lifecycleSend({
    to,
    subject: pick(lang,
      first ? 'Votre inscription Digitip n’est pas terminée' : 'Dernier rappel : votre inscription Digitip',
      first ? 'Your Digitip sign-up isn’t finished' : 'Last reminder: your Digitip sign-up'),
    html: layout({
      lang,
      preheader: pick(lang, 'Tant qu’elle ne l’est pas, la plaque ne peut pas recevoir de pourboires.', 'Until it is, the plaque cannot take tips.'),
      footer: lifecycleFooter(lang, unsubscribeUrl),
      body: [
        block.p(hello(lang, firstName)),
        block.p(pick(lang,
          first
            ? 'Vous avez commencé à créer votre espace Digitip sans le terminer. Il reste quelques minutes : votre établissement, le compte qui recevra les pourboires, votre équipe. Tant que ce n’est pas fait, vos clients ne peuvent pas laisser de pourboire.'
            : 'Votre espace Digitip n’est toujours pas terminé, et vos clients ne peuvent donc pas encore laisser de pourboire. C’est notre dernier rappel à ce sujet.',
          first
            ? 'You started setting up Digitip but didn’t finish. A few minutes are left: your business, the account that will receive the tips, your team. Until it’s done, your customers cannot leave a tip.'
            : 'Your Digitip account still isn’t finished, so your customers cannot leave tips yet. This is our last reminder about it.')),
        block.button(pick(lang, 'Terminer mon inscription', 'Finish signing up'), setupUrl),
        block.small(pick(lang,
          'Bloqué à une étape ? Répondez à cet e-mail en nous disant laquelle, on vous aide.',
          'Stuck on a step? Reply and tell us which one, we will help.')),
      ],
    }),
  });
}

/** Requested from the scan of a plaque that is not activated yet (transactional). */
export async function sendPlaqueActivationLink(opts: {
  to: string; firstName: string; setupUrl: string; locale?: string;
}): Promise<{ id: string | null }> {
  const { to, firstName, setupUrl } = opts;
  const lang = emailLang(opts.locale);
  return lifecycleSend({
    to,
    subject: pick(lang, 'Le lien pour activer votre plaque', 'Your link to activate your plaque'),
    html: layout({
      lang,
      preheader: pick(lang, 'Valable 7 jours.', 'Valid for 7 days.'),
      body: [
        block.p(hello(lang, firstName)),
        block.p(pick(lang,
          'Vous avez demandé à activer votre plaque Digitip. Le bouton ouvre l’inscription : comptez quelques minutes, et la plaque reçoit des pourboires dès qu’elle est terminée.',
          'You asked to activate your Digitip plaque. The button opens the sign-up: it takes a few minutes, and the plaque takes tips as soon as it is done.')),
        block.button(pick(lang, 'Activer ma plaque', 'Activate my plaque'), setupUrl),
        block.small(pick(lang,
          'Le lien est valable 7 jours. Vous n’avez rien demandé ? Ignorez cet e-mail.',
          'The link is valid for 7 days. Didn’t ask for this? Ignore this email.')),
      ],
    }),
  });
}

/**
 * Group admin: nobody has joined the team yet, so the tip page has no one to
 * tip and turns customers away. Sent once, three days after sign-up.
 */
export async function sendInviteTeamNudge(opts: {
  to: string; firstName: string; establishmentName: string; inviteUrl: string; unsubscribeUrl?: string | null; locale?: string;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, inviteUrl, unsubscribeUrl } = opts;
  const lang = emailLang(opts.locale);
  const est = esc(establishmentName);
  return lifecycleSend({
    to,
    subject: pick(lang, 'Votre page de pourboire n’affiche encore personne', 'Nobody is on your tip page yet'),
    html: layout({
      lang,
      preheader: pick(lang, 'Sans équipe, les clients ne peuvent pas laisser de pourboire.', 'Without a team, customers cannot leave a tip.'),
      footer: lifecycleFooter(lang, unsubscribeUrl),
      body: [
        block.p(hello(lang, firstName)),
        block.p(pick(lang,
          `Chez ${block.strong(est)}, personne n’a encore rejoint l’équipe sur Digitip. Or la page de pourboire a besoin d’au moins une personne : sans équipe, un client qui scanne la plaque ne peut rien laisser.`,
          `Nobody has joined the ${block.strong(est)} team on Digitip yet. The tip page needs at least one person: without a team, a customer who scans the plaque cannot leave anything.`)),
        block.p(pick(lang,
          'Le plus rapide : envoyez le lien d’équipe par SMS ou WhatsApp, chacun s’inscrit depuis son téléphone. Vous travaillez seul ? Ajoutez-vous vous-même.',
          'The quickest way: send the team link by text or WhatsApp, everyone signs up from their phone. Working alone? Add yourself.')),
        block.button(pick(lang, 'Ajouter mon équipe', 'Add my team'), inviteUrl),
      ],
    }),
  });
}

/**
 * Group admin: some staff were added without an email and never joined, so
 * they are not on the tip page. At most twice, a month apart.
 */
export async function sendStaffMissingEmailNudge(opts: {
  to: string; firstName: string; establishmentName: string; count: number;
  staffUrl: string; unsubscribeUrl?: string | null; locale?: string;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, count, staffUrl, unsubscribeUrl } = opts;
  const lang = emailLang(opts.locale);
  const est = esc(establishmentName);
  const one = count === 1;
  return lifecycleSend({
    to,
    subject: pick(lang,
      one ? 'Une personne de votre équipe n’a pas encore rejoint Digitip' : `${count} personnes de votre équipe n’ont pas encore rejoint Digitip`,
      one ? 'One person on your team hasn’t joined Digitip yet' : `${count} people on your team haven’t joined Digitip yet`),
    html: layout({
      lang,
      preheader: pick(lang, 'Tant qu’elles ne l’ont pas fait, les clients ne peuvent pas les choisir.', 'Until they do, customers cannot choose them.'),
      footer: lifecycleFooter(lang, unsubscribeUrl),
      body: [
        block.p(hello(lang, firstName)),
        block.p(pick(lang,
          `Chez ${block.strong(est)}, ${one ? 'une personne a été ajoutée' : `${count} personnes ont été ajoutées`} sans adresse e-mail et ${one ? 'n’a' : 'n’ont'} pas encore rejoint l’équipe. Tant que ce n’est pas fait, ${one ? 'elle n’apparaît' : 'elles n’apparaissent'} pas sur la page de pourboire et les clients ne peuvent pas ${one ? 'la' : 'les'} choisir.`,
          `At ${block.strong(est)}, ${one ? 'one person was' : `${count} people were`} added without an email address and ${one ? 'hasn’t' : 'haven’t'} joined the team yet. Until they do, they don’t appear on the tip page and customers cannot choose them.`)),
        block.p(pick(lang,
          'Deux solutions : leur envoyer le lien d’équipe par SMS, ou ajouter leur adresse e-mail pour qu’on leur envoie une invitation.',
          'Two ways to fix it: send them the team link by text, or add their email address so we send them an invitation.')),
        block.button(pick(lang, 'Voir mon équipe', 'See my team'), staffUrl),
      ],
    }),
  });
}

/**
 * Group admin: live for a week, plaques in hand for a few days, still no tip.
 * Once.
 */
export async function sendActivationNudge(opts: {
  to: string; firstName: string; establishmentName: string; dashboardUrl: string; daysSince: number; unsubscribeUrl?: string | null; locale?: string;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, dashboardUrl, unsubscribeUrl } = opts;
  const lang = emailLang(opts.locale);
  const est = esc(establishmentName);
  return lifecycleSend({
    to,
    subject: pick(lang, `Pas encore de pourboire chez ${establishmentName}`, `No tips yet at ${establishmentName}`),
    html: layout({
      lang,
      preheader: pick(lang, 'Trois vérifications qui règlent presque toujours le problème.', 'Three checks that almost always fix it.'),
      footer: lifecycleFooter(lang, unsubscribeUrl),
      body: [
        block.p(hello(lang, firstName)),
        block.p(pick(lang,
          `${block.strong(est)} n’a pas encore reçu de pourboire. Presque toujours, c’est l’une de ces trois raisons :`,
          `${block.strong(est)} hasn’t received a tip yet. It is almost always one of these three things:`)),
        block.list([
          pick(lang,
            'La plaque n’est pas visible au moment de payer. Posez-la à côté du terminal de paiement ou sur les tables.',
            'The plaque isn’t visible when people pay. Put it next to the card terminal or on the tables.'),
          pick(lang,
            'Personne n’en parle. Une phrase de l’équipe au moment de l’addition fait toute la différence.',
            'Nobody mentions it. One sentence from the team when the bill comes makes all the difference.'),
          pick(lang,
            'Elle n’a jamais été testée. Approchez votre téléphone : la page de pourboire doit s’ouvrir.',
            'It has never been tested. Hold your phone near it: the tip page should open.'),
        ]),
        block.button(pick(lang, 'Ouvrir mon tableau de bord', 'Open my dashboard'), dashboardUrl),
        block.small(pick(lang,
          'La plaque ne réagit pas au téléphone ? Répondez à cet e-mail, on règle ça avec vous.',
          'The plaque doesn’t react to your phone? Reply to this email and we will sort it out with you.')),
      ],
    }),
  });
}

/** Staff invited by email who hasn't joined (day 3, then day 7). */
export async function sendStaffInviteReminder(opts: {
  to: string; firstName: string; establishmentName: string; joinUrl: string; step: 1 | 2; unsubscribeUrl?: string | null; locale?: string;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, joinUrl, step, unsubscribeUrl } = opts;
  const lang = emailLang(opts.locale);
  const est = esc(establishmentName);
  return lifecycleSend({
    to,
    subject: pick(lang,
      step === 1 ? `Rappel : ${establishmentName} vous attend sur Digitip` : `Dernier rappel : votre compte Digitip chez ${establishmentName}`,
      step === 1 ? `Reminder: ${establishmentName} is waiting for you on Digitip` : `Last reminder: your Digitip account at ${establishmentName}`),
    html: layout({
      lang,
      preheader: pick(lang, 'Activez votre compte pour que les clients puissent vous choisir.', 'Activate your account so customers can choose you.'),
      footer: lifecycleFooter(lang, unsubscribeUrl),
      body: [
        block.p(hello(lang, firstName)),
        block.p(pick(lang,
          `${block.strong(est)} vous a ajouté à son équipe sur Digitip, mais votre compte n’est pas encore activé. Tant qu’il ne l’est pas, vous n’apparaissez pas sur la page de pourboire et les clients ne peuvent pas vous choisir.`,
          `${block.strong(est)} added you to its team on Digitip, but your account isn’t activated yet. Until it is, you don’t appear on the tip page and customers cannot choose you.`)),
        block.button(pick(lang, 'Activer mon compte', 'Activate my account'), joinUrl),
        block.small(pick(lang,
          `Ça prend une minute. Les pourboires sont versés à l’établissement, qui vous les reverse avec votre salaire.${step === 2 ? ' C’est notre dernier rappel.' : ''}`,
          `It takes a minute. Tips are paid to the business, which passes yours on with your pay.${step === 2 ? ' This is our last reminder.' : ''}`)),
      ],
    }),
  });
}

/** Group admin: an establishment received its very first tip. */
export async function sendFirstTipCelebration(opts: {
  to: string; firstName: string; amount: number; currency: string; establishmentName: string; dashboardUrl: string; unsubscribeUrl?: string | null;
  /** Set when this tip just started the cardless Pro trial. */
  proTrial?: { hasReviewLink: boolean } | null;
  locale?: string;
}): Promise<{ id: string | null }> {
  const { to, firstName, amount, currency, establishmentName, dashboardUrl, unsubscribeUrl, proTrial } = opts;
  const lang = emailLang(opts.locale);
  const est = esc(establishmentName);
  return lifecycleSend({
    to,
    subject: pick(lang, `Premier pourboire chez ${establishmentName}`, `First tip at ${establishmentName}`),
    html: layout({
      lang,
      preheader: pick(lang, `${money(amount, currency, lang)}, laissé avec votre plaque.`, `${money(amount, currency, lang)}, left with your plaque.`),
      footer: lifecycleFooter(lang, unsubscribeUrl),
      body: [
        block.p(hello(lang, firstName)),
        block.p(pick(lang,
          `Un client vient de laisser le premier pourboire chez ${block.strong(est)} : ${block.strong(money(amount, currency, lang))}. La plaque marche.`,
          `A customer just left the first tip at ${block.strong(est)}: ${block.strong(money(amount, currency, lang))}. The plaque works.`)),
        block.p(pick(lang,
          'Ce qui fait venir les suivants : une plaque visible à chaque endroit où l’on paie, et une équipe qui la mentionne au moment de l’addition.',
          'What brings the next ones: a plaque in sight wherever people pay, and a team that mentions it when the bill comes.')),
        ...(proTrial
          ? [block.p(pick(lang,
              `${block.strong('Digitip Pro vous est offert pendant 30 jours, sans carte.')} Après chaque pourboire, vos clients peuvent maintenant laisser un avis Google et un petit mot à la personne qui les a servis.${proTrial.hasReviewLink ? '' : ' Pour que l’invitation à laisser un avis s’affiche, ajoutez votre fiche Google dans Établissements.'}`,
              `${block.strong('Digitip Pro is yours free for 30 days, no card needed.')} After each tip, your customers can now leave a Google review and a note for the person who served them.${proTrial.hasReviewLink ? '' : ' For the review invitation to show, add your Google listing under Establishments.'}`))]
          : []),
        block.button(pick(lang, 'Voir mes pourboires', 'See my tips'), dashboardUrl),
      ],
    }),
  });
}

/** Staff: the tips customers left them crossed €100 or €500 in total. */
export async function sendEarningsMilestone(opts: {
  to: string; firstName: string; milestoneAmount: number; currency: string; dashboardUrl: string; unsubscribeUrl?: string | null;
  establishmentName?: string | null; locale?: string;
}): Promise<{ id: string | null }> {
  const { to, firstName, milestoneAmount, currency, dashboardUrl, unsubscribeUrl, establishmentName } = opts;
  const lang = emailLang(opts.locale);
  const amount = new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0,
  }).format(milestoneAmount / 100);
  const where = establishmentName ? pick(lang, `Chez ${block.strong(esc(establishmentName))}, les clients`, `Customers at ${block.strong(esc(establishmentName))}`) : pick(lang, 'Les clients', 'Customers');
  return lifecycleSend({
    to,
    subject: pick(lang, `Vous avez reçu ${amount} de pourboires`, `You have received ${amount} in tips`),
    html: layout({
      lang,
      preheader: pick(lang, 'Merci à vos clients.', 'Thanks to your customers.'),
      footer: lifecycleFooter(lang, unsubscribeUrl),
      body: [
        block.p(hello(lang, firstName)),
        block.p(pick(lang,
          `${where} vous ont laissé ${block.strong(amount)} de pourboires au total avec Digitip. Bravo.`,
          `${where} have left you ${block.strong(amount)} in tips in total with Digitip. Well done.`)),
        block.p(pick(lang,
          'Ils vous sont reversés par l’établissement, avec votre salaire.',
          'The business passes them on to you with your pay.')),
        block.button(pick(lang, 'Voir le détail', 'See the details'), dashboardUrl),
      ],
    }),
  });
}

/** Group admin: an establishment that used to get tips has had none for three weeks. Once per quiet spell. */
export async function sendReEngagementEmail(opts: {
  to: string; firstName: string; establishmentName: string; daysQuiet: number; dashboardUrl: string; unsubscribeUrl?: string | null; locale?: string;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, daysQuiet, dashboardUrl, unsubscribeUrl } = opts;
  const lang = emailLang(opts.locale);
  const est = esc(establishmentName);
  return lifecycleSend({
    to,
    subject: pick(lang, `Aucun pourboire chez ${establishmentName} depuis ${daysQuiet} jours`, `No tips at ${establishmentName} for ${daysQuiet} days`),
    html: layout({
      lang,
      preheader: pick(lang, 'Si vous êtes ouvert, la plaque a peut-être bougé.', 'If you are open, the plaque may have moved.'),
      footer: lifecycleFooter(lang, unsubscribeUrl),
      body: [
        block.p(hello(lang, firstName)),
        block.p(pick(lang,
          `${block.strong(est)} recevait des pourboires, et plus aucun n’est passé depuis ${daysQuiet} jours. Si l’établissement est fermé en ce moment, ignorez ce message.`,
          `${block.strong(est)} used to get tips, and none has come in for ${daysQuiet} days. If you are closed at the moment, ignore this message.`)),
        block.p(pick(lang, 'Sinon, deux choses à vérifier :', 'Otherwise, two things to check:')),
        block.list([
          pick(lang,
            'La plaque est-elle toujours en vue, au même endroit ? Elle a pu être rangée ou déplacée.',
            'Is the plaque still in sight, in the same place? It may have been put away or moved.'),
          pick(lang,
            'Répond-elle encore ? Approchez votre téléphone : la page de pourboire doit s’ouvrir.',
            'Does it still respond? Hold your phone near it: the tip page should open.'),
        ]),
        block.button(pick(lang, 'Ouvrir mon tableau de bord', 'Open my dashboard'), dashboardUrl),
        block.small(pick(lang,
          'Elle ne répond plus ? Répondez à cet e-mail, on regarde avec vous.',
          'It no longer responds? Reply to this email and we will look into it with you.')),
      ],
    }),
  });
}

/** Group admin, Monday morning: last week's tips (Monday to Sunday), one email per group. */
export async function sendWeeklyTipRecap(opts: {
  to: string; firstName: string;
  /** "du 29 septembre au 5 octobre" style label, already formatted. */
  weekLabel: string;
  establishments: Array<{ name: string; total: number; count: number }>;
  currency: string; dashboardUrl: string; unsubscribeUrl?: string | null; locale?: string;
}): Promise<{ id: string | null }> {
  const { to, firstName, weekLabel, establishments, currency, dashboardUrl, unsubscribeUrl } = opts;
  const lang = emailLang(opts.locale);
  const total = establishments.reduce((s, e) => s + e.total, 0);
  const count = establishments.reduce((s, e) => s + e.count, 0);
  const tips = (n: number) => pick(lang, `${n} pourboire${n > 1 ? 's' : ''}`, `${n} tip${n > 1 ? 's' : ''}`);
  const several = establishments.length > 1;
  return lifecycleSend({
    to,
    subject: pick(lang, `Vos pourboires de la semaine : ${money(total, currency, lang)}`, `Your tips this week: ${money(total, currency, lang)}`),
    html: layout({
      lang,
      preheader: pick(lang, `${tips(count)}, semaine ${weekLabel}.`, `${tips(count)}, week ${weekLabel}.`),
      footer: lifecycleFooter(lang, unsubscribeUrl),
      body: [
        block.p(hello(lang, firstName)),
        block.p(pick(lang,
          `La semaine ${esc(weekLabel)}, vos clients ont laissé ${block.strong(tips(count))}, pour ${block.strong(money(total, currency, lang))} en tout.`,
          `In the week ${esc(weekLabel)}, your customers left ${block.strong(tips(count))}, worth ${block.strong(money(total, currency, lang))} in total.`)),
        ...(several
          ? [block.details(establishments.map((e) => [esc(e.name), `${money(e.total, currency, lang)} · ${tips(e.count)}`] as [string, string]))]
          : []),
        block.button(pick(lang, 'Voir le détail', 'See the details'), dashboardUrl),
        block.small(pick(lang,
          'Montants des pourboires seuls, sans les frais de service payés par les clients.',
          'Tip amounts only, excluding the service fee paid by customers.')),
      ],
    }),
  });
}

/**
 * Group admin, three days before the Stripe trial converts (transactional).
 * Says the price and the date plainly: a subscription that starts charging
 * without warning is how a trial turns into a chargeback.
 */
export async function sendTrialEndingSoon(opts: {
  to: string; firstName: string; establishmentName: string; daysLeft: number;
  priceLabel: string | null; tipCount: number; clickCount: number;
  billingUrl: string; locale?: string;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, daysLeft, priceLabel, tipCount, clickCount, billingUrl } = opts;
  const lang = emailLang(opts.locale);
  const days = pick(lang, `${daysLeft} jour${daysLeft > 1 ? 's' : ''}`, `${daysLeft} day${daysLeft > 1 ? 's' : ''}`);
  const est = esc(establishmentName);
  const price = priceLabel ? esc(priceLabel) : null;
  return lifecycleSend({
    to,
    subject: pick(lang, `Votre essai Digitip Pro se termine dans ${days}`, `Your Digitip Pro trial ends in ${days}`),
    html: layout({
      lang,
      preheader: pick(lang,
        price ? `Ensuite, ${priceLabel} HT par mois. Résiliable avant sans frais.` : 'Résiliable avant la fin sans frais.',
        price ? `Then ${priceLabel} excl. VAT a month. Cancel before at no cost.` : 'Cancel before it ends at no cost.'),
      body: [
        block.p(hello(lang, firstName)),
        block.p(pick(lang,
          `Votre essai de Digitip Pro pour ${block.strong(est)} se termine dans ${days}. ${price ? `L’abonnement démarre alors à ${block.strong(`${price} HT par mois`)}, sur la carte enregistrée.` : 'L’abonnement démarre alors, sur la carte enregistrée.'}`,
          `Your Digitip Pro trial for ${block.strong(est)} ends in ${days}. ${price ? `The subscription then starts at ${block.strong(`${price} excl. VAT a month`)}, on the card on file.` : 'The subscription then starts, on the card on file.'}`)),
        block.p(tipCount > 0
          ? pick(lang,
              `Pendant l’essai, ${block.strong(`${clickCount} client${clickCount > 1 ? 's' : ''} sur ${tipCount}`)} ${clickCount > 1 ? 'ont ouvert votre fiche Google après leur pourboire' : 'a ouvert votre fiche Google après son pourboire'}.`,
              `During the trial, ${block.strong(`${clickCount} customer${clickCount === 1 ? '' : 's'} out of ${tipCount}`)} opened your Google listing after tipping.`)
          : pick(lang,
              'Aucun pourboire n’est passé pendant l’essai, nous n’avons donc rien pu vous montrer encore.',
              'No tip came in during the trial, so there is nothing to show you yet.')),
        block.p(pick(lang,
          'Pour ne pas continuer, résiliez avant la fin de l’essai : vous ne paierez rien.',
          'To stop, cancel before the trial ends: you will pay nothing.')),
        block.button(pick(lang, 'Gérer mon abonnement', 'Manage my subscription'), billingUrl),
        block.small(pick(lang,
          'Vos pourboires continuent d’arriver dans tous les cas : ils ne dépendent pas de l’abonnement.',
          'Your tips keep coming in either way: they do not depend on the subscription.')),
      ],
    }),
  });
}

/**
 * Group admin, three days before the cardless Pro trial ends. No card on
 * file, so nothing will be charged: the risk is Pro switching off unnoticed.
 */
export async function sendFreeTrialEndingSoon(opts: {
  to: string; firstName: string; establishmentName: string; daysLeft: number; endDate: string;
  priceLabel: string | null; tipCount: number; clickCount: number; complimentCount: number;
  billingUrl: string; locale?: string;
}): Promise<{ id: string | null }> {
  const { to, firstName, establishmentName, daysLeft, endDate, priceLabel, tipCount, clickCount, complimentCount, billingUrl } = opts;
  const lang = emailLang(opts.locale);
  const days = pick(lang, `${daysLeft} jour${daysLeft > 1 ? 's' : ''}`, `${daysLeft} day${daysLeft > 1 ? 's' : ''}`);
  const est = esc(establishmentName);
  const s = (n: number) => (n > 1 ? 's' : '');
  return lifecycleSend({
    to,
    subject: pick(lang, `Votre essai Digitip Pro se termine dans ${days}`, `Your Digitip Pro trial ends in ${days}`),
    html: layout({
      lang,
      preheader: pick(lang, 'Sans action de votre part, rien ne vous sera facturé.', 'If you do nothing, you will not be charged.'),
      body: [
        block.p(hello(lang, firstName)),
        block.p(pick(lang,
          `Votre essai gratuit de Digitip Pro pour ${block.strong(est)} se termine le ${block.strong(esc(endDate))}.`,
          `Your free Digitip Pro trial for ${block.strong(est)} ends on ${block.strong(esc(endDate))}.`)),
        ...(tipCount > 0
          ? [
              block.p(pick(lang, 'Depuis le début de l’essai :', 'Since the trial began:')),
              block.list([
                pick(lang,
                  `${clickCount} client${s(clickCount)} sur ${tipCount} ${clickCount > 1 ? 'ont ouvert votre fiche Google après leur pourboire' : 'a ouvert votre fiche Google après son pourboire'} ;`,
                  `${clickCount} customer${clickCount === 1 ? '' : 's'} out of ${tipCount} opened your Google listing after tipping;`),
                pick(lang,
                  complimentCount === 1 ? 'votre équipe a reçu un petit mot d’un client.' : `votre équipe a reçu ${complimentCount} petits mots de clients.`,
                  `your team received ${complimentCount} note${complimentCount === 1 ? '' : 's'} from customers.`),
              ]),
            ]
          : [block.p(pick(lang,
              'Aucun pourboire n’est passé pendant l’essai, nous n’avons donc rien pu vous montrer encore.',
              'No tip came in during the trial, so there is nothing to show you yet.'))]),
        block.p(pick(lang,
          `Vous n’avez pas donné de carte : si vous ne faites rien, Pro s’arrête le ${esc(endDate)} et rien ne vous est facturé.${priceLabel ? ` Pour le garder, c’est ${esc(priceLabel)} HT par mois, sans engagement.` : ''}`,
          `You did not give a card: if you do nothing, Pro stops on ${esc(endDate)} and you are not charged.${priceLabel ? ` To keep it, it is ${esc(priceLabel)} excl. VAT a month, no commitment.` : ''}`)),
        block.button(pick(lang, 'Garder Digitip Pro', 'Keep Digitip Pro'), billingUrl),
        block.small(pick(lang,
          'Vos pourboires et vos relevés mensuels ne changent pas, avec ou sans Pro.',
          'Your tips and monthly statements stay the same, with or without Pro.')),
      ],
    }),
  });
}

// ═══ Monthly payroll statement ════════════════════════════════════════════════

/**
 * Sent on the 1st of each month, to the manager and, when they gave one, to
 * their accountant. Each gets their own copy: the accountant may never have
 * heard of Digitip and needs to know why this is in their inbox.
 */
export async function sendMonthlyStatement(opts: {
  to: string[];
  /** The address among `to` that is the accountant's, if any. */
  accountantEmail?: string | null;
  establishmentName: string;
  monthLabel: string;
  staffCount: number;
  totalFormatted: string;
  summaryCsv: string;
  journalCsv: string;
  month: string;
  locale: 'fr' | 'en';
}): Promise<void> {
  const { to, accountantEmail, establishmentName, monthLabel, staffCount, totalFormatted, month, locale: lang } = opts;
  const est = esc(establishmentName);
  const people = pick(lang, `${staffCount} personne${staffCount > 1 ? 's' : ''}`, `${staffCount} ${staffCount > 1 ? 'people' : 'person'}`);
  const attachments: Attachment[] = [
    { filename: `releve-pourboires-${month}.csv`, content: Buffer.from(opts.summaryCsv, 'utf8') },
    { filename: `journal-pourboires-${month}.csv`, content: Buffer.from(opts.journalCsv, 'utf8') },
  ];

  for (const recipient of to) {
    const isAccountant = !!accountantEmail && recipient.toLowerCase() === accountantEmail.toLowerCase();
    await deliverQuietly({
      to: recipient,
      subject: pick(lang, `Relevé des pourboires de ${monthLabel} : ${establishmentName}`, `Tip statement for ${monthLabel}: ${establishmentName}`),
      attachments,
      html: layout({
        lang,
        preheader: pick(lang, `${totalFormatted} pour ${people}. Deux fichiers joints.`, `${totalFormatted} for ${people}. Two files attached.`),
        body: [
          block.p(pick(lang, 'Bonjour,', 'Hello,')),
          ...(isAccountant
            ? [block.p(pick(lang,
                `${block.strong(est)} vous a indiqué sur Digitip comme destinataire de son relevé mensuel de pourboires. Digitip est le service qui encaisse les pourboires par carte de l’établissement.`,
                `${block.strong(est)} listed you on Digitip as the recipient of its monthly tip statement. Digitip is the service that collects the business’s card tips.`))]
            : []),
          block.p(pick(lang,
            `En ${esc(monthLabel)}, ${block.strong(est)} a reçu ${block.strong(totalFormatted)} de pourboires, attribués à ${people}.`,
            `In ${esc(monthLabel)}, ${block.strong(est)} received ${block.strong(totalFormatted)} in tips, attributed to ${people}.`)),
          block.p(pick(lang, 'Deux fichiers sont joints :', 'Two files are attached:')),
          block.list([
            pick(lang,
              `${block.mono(`releve-pourboires-${month}.csv`)} : le total par personne, à reporter sur la paie ;`,
              `${block.mono(`releve-pourboires-${month}.csv`)}: the total per person, for payroll;`),
            pick(lang,
              `${block.mono(`journal-pourboires-${month}.csv`)} : chaque pourboire, pour le rapprochement avec le relevé bancaire.`,
              `${block.mono(`journal-pourboires-${month}.csv`)}: every tip, to reconcile with the bank statement.`),
          ]),
          block.small(pick(lang,
            'Ce relevé part le 1er de chaque mois. Le responsable de l’établissement peut changer son destinataire dans ses réglages Digitip.',
            'This statement goes out on the 1st of each month. The business manager can change who receives it in their Digitip settings.')),
        ],
      }),
    });
  }
}
