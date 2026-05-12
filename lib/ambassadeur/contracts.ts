import { renderTemplate, sha256Hex } from './templates';

export type ContractRenderVars = {
  ambassador_name: string;
  ambassador_siret: string;
  promo_code: string;
  date: string;
};

/**
 * Renders a contract template body with the ambassador's substituted values
 * and returns the final HTML + its SHA-256 hash. The hash is what gets stored
 * alongside the snapshot so that any tampering with the persisted record can
 * be detected by recomputing the hash from the snapshot.
 */
export function renderContract(
  templateHtml: string,
  vars: ContractRenderVars,
): { html: string; hash: string } {
  const html = renderTemplate(templateHtml, vars);
  return { html, hash: sha256Hex(html) };
}

/**
 * Decodes a `data:image/png;base64,...` URL into a raw PNG Buffer.
 * Throws if the input isn't a PNG dataURL or exceeds the size cap.
 */
export function decodeSignaturePng(dataUrl: string, maxBytes = 524_288): Buffer {
  if (!dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('Signature must be a PNG data URL');
  }
  const base64 = dataUrl.slice('data:image/png;base64,'.length);
  const buf = Buffer.from(base64, 'base64');
  if (buf.length === 0) throw new Error('Empty signature image');
  if (buf.length > maxBytes) throw new Error('Signature image too large');
  // Minimal PNG magic check: 89 50 4E 47 0D 0A 1A 0A
  const magic = buf.subarray(0, 8);
  const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!magic.equals(expected)) throw new Error('Invalid PNG payload');
  return buf;
}

/**
 * Builds the standalone HTML page used to display / print a signed contract,
 * embedding the signature image and audit metadata. Designed to be printed
 * to PDF directly by the browser.
 */
export function buildSignedContractPage(opts: {
  title: string;
  contentSnapshot: string;
  signatureDataUrl: string;
  ambassadorName: string;
  signedAt: string;
  contentHash: string;
  signerIpHashShort: string;
}): string {
  const {
    title, contentSnapshot, signatureDataUrl, ambassadorName,
    signedAt, contentHash, signerIpHashShort,
  } = opts;
  const signedAtFr = new Date(signedAt).toLocaleString('fr-FR', {
    dateStyle: 'long', timeStyle: 'short',
  });
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeForTitle(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 780px; margin: 40px auto; padding: 0 24px; color: #111; line-height: 1.55; }
  h1, h2, h3 { color: #111; }
  .signed-banner { background: #ecfdf5; border: 1px solid #10b981; border-radius: 10px; padding: 14px 18px; margin: 0 0 28px; }
  .signed-banner .label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #047857; }
  .signed-banner h2 { margin: 4px 0 0; font-size: 18px; color: #064e3b; }
  .signature-block { margin-top: 48px; border-top: 1px solid #e5e7eb; padding-top: 24px; }
  .signature-block img { max-width: 280px; max-height: 120px; border: 1px solid #e5e7eb; padding: 8px; background: #fff; }
  .audit { margin-top: 24px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 18px; font-size: 12px; color: #374151; }
  .audit dl { display: grid; grid-template-columns: 160px 1fr; gap: 6px 14px; margin: 0; }
  .audit dt { color: #6b7280; }
  .audit dd { margin: 0; font-family: ui-monospace, monospace; word-break: break-all; }
  @media print {
    body { margin: 24px; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class="no-print" style="text-align: right; margin-bottom: 16px;">
    <button onclick="window.print()" style="padding: 8px 16px; background: #111; color: #fff; border: 0; border-radius: 6px; cursor: pointer; font-size: 13px;">Imprimer / sauvegarder en PDF</button>
  </div>
  <div class="signed-banner">
    <div class="label">● Signé électroniquement</div>
    <h2>${escapeForHtml(title)}</h2>
  </div>
  <article>
    ${contentSnapshot}
  </article>
  <section class="signature-block">
    <p style="margin: 0 0 12px; font-size: 13px; color: #374151;"><strong>Signature de ${escapeForHtml(ambassadorName)}</strong></p>
    <img src="${signatureDataUrl}" alt="Signature de ${escapeForHtml(ambassadorName)}" />
  </section>
  <section class="audit">
    <dl>
      <dt>Signataire</dt><dd>${escapeForHtml(ambassadorName)}</dd>
      <dt>Date &amp; heure</dt><dd>${escapeForHtml(signedAtFr)}</dd>
      <dt>Empreinte SHA-256</dt><dd>${escapeForHtml(contentHash)}</dd>
      <dt>IP hashée (8c)</dt><dd>${escapeForHtml(signerIpHashShort)}…</dd>
    </dl>
    <p style="margin: 12px 0 0; font-size: 11px; color: #6b7280;">Signature électronique simple au sens du règlement eIDAS (UE) 910/2014 et de l'article 1367 du Code civil français. Empreinte cryptographique du document garantissant son intégrité.</p>
  </section>
</body>
</html>`;
}

function escapeForHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function escapeForTitle(s: string): string {
  return s.replace(/[<>]/g, '');
}
