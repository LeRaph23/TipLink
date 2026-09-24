/**
 * Files an admin attaches to a free-form email sent to a customer (an invoice
 * PDF, a credit note, a photo of the pack…).
 *
 * The whole request goes through a Server Action, and Vercel refuses function
 * request bodies above 4.5 MB whatever Next allows, so the total stays under
 * that with room for the subject and body. next.config.ts raises Next's own
 * Server Action limit to match.
 */
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENTS_BYTES = 4 * 1024 * 1024;

const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'txt', 'csv'] as const;

export type EmailAttachment = { filename: string; content: Buffer };

type Validated = { ok: true; attachments: EmailAttachment[] } | { ok: false; error: string };

/** Keeps a readable name but nothing a mail client could read as a path or header. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f"<>:|?*]/g, '').replace(/\s+/g, ' ').trim();
  if (clean.length <= 100) return clean;
  const dot = clean.lastIndexOf('.');
  const ext = dot > 0 ? clean.slice(dot) : '';
  return clean.slice(0, 100 - ext.length) + ext;
}

export async function readAttachments(files: File[]): Promise<Validated> {
  const real = files.filter((f) => f.size > 0);
  if (real.length > MAX_ATTACHMENTS) {
    return { ok: false, error: `${MAX_ATTACHMENTS} pièces jointes maximum` };
  }
  const total = real.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_ATTACHMENTS_BYTES) {
    return { ok: false, error: 'Pièces jointes trop lourdes (4 Mo au total maximum)' };
  }

  const attachments: EmailAttachment[] = [];
  for (const file of real) {
    const filename = sanitizeFilename(file.name);
    const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
    if (!filename || !(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
      return { ok: false, error: `Type de fichier refusé : ${filename || 'sans nom'} (PDF, image, TXT ou CSV)` };
    }
    attachments.push({ filename, content: Buffer.from(await file.arrayBuffer()) });
  }
  return { ok: true, attachments };
}
