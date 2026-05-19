// Generates a PDF invoice for a SmartTag pack sale and stores it in Supabase
// Storage. Replaces the Stripe-hosted invoice — Mangopay produces no invoices.

import 'server-only';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { customAlphabet } from 'nanoid';
import { createServiceClient } from '@/lib/supabase/service';

const INVOICE_BUCKET = 'pack-invoices';

// Seller identity printed on every invoice.
// TODO: replace with the operating company's real legal details.
const SELLER = {
  name: 'Digitip',
  line1: '',
  cityLine: '',
  siret: '',
  vat: '',
} as const;

const invoiceSuffix = customAlphabet('0123456789ABCDEFGHJKMNPQRSTVWXYZ', 8);

export function makeInvoiceNumber(date: Date = new Date()): string {
  return `INV-${date.getFullYear()}-${invoiceSuffix()}`;
}

export type InvoiceAddress = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

export type InvoiceInput = {
  invoiceNumber: string;
  date: Date;
  buyerName: string;
  buyerVatNumber?: string | null;
  buyerAddress?: InvoiceAddress | null;
  description: string;
  quantity: number;
  htAmount: number; // cents
  taxAmount: number; // cents
  totalAmount: number; // cents
  taxRatePercent: number | null;
};

export type InvoiceResult = { invoiceNumber: string; invoicePdfUrl: string | null };

function euros(cents: number): string {
  return `${(cents / 100).toFixed(2)} EUR`;
}

function addressLines(a: InvoiceAddress | null | undefined): string[] {
  if (!a) return [];
  const lines: string[] = [];
  if (a.line1) lines.push(a.line1);
  if (a.line2) lines.push(a.line2);
  const cityLine = [a.postalCode, a.city].filter(Boolean).join(' ');
  if (cityLine) lines.push(cityLine);
  if (a.country) lines.push(a.country);
  return lines;
}

// Builds the invoice PDF, uploads it to Supabase Storage and returns a
// long-lived signed URL. Never throws — on failure it returns a null URL so
// the caller (a webhook handler) is not blocked.
export async function generatePackInvoice(input: InvoiceInput): Promise<InvoiceResult> {
  try {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4 portrait
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0.1, 0.1, 0.12);
    const muted = rgb(0.45, 0.45, 0.5);

    let y = 790;
    const left = 56;
    const right = 539;

    const text = (
      s: string,
      x: number,
      yy: number,
      opts: { size?: number; bold?: boolean; color?: typeof ink } = {}
    ) => {
      page.drawText(s, {
        x,
        y: yy,
        size: opts.size ?? 10,
        font: opts.bold ? bold : font,
        color: opts.color ?? ink,
      });
    };

    text('FACTURE', left, y, { size: 22, bold: true });
    text(SELLER.name, right - bold.widthOfTextAtSize(SELLER.name, 13), y + 4, {
      size: 13,
      bold: true,
    });
    y -= 22;
    for (const line of [SELLER.line1, SELLER.cityLine, SELLER.siret ? `SIRET ${SELLER.siret}` : '', SELLER.vat ? `TVA ${SELLER.vat}` : '']) {
      if (!line) continue;
      text(line, right - font.widthOfTextAtSize(line, 9), y, { size: 9, color: muted });
      y -= 12;
    }

    y = 720;
    text(`Facture n° ${input.invoiceNumber}`, left, y, { size: 10, bold: true });
    y -= 14;
    text(`Date : ${input.date.toISOString().slice(0, 10)}`, left, y, { size: 10, color: muted });

    y -= 36;
    text('Facturé à', left, y, { size: 9, bold: true, color: muted });
    y -= 14;
    text(input.buyerName, left, y, { size: 11, bold: true });
    y -= 14;
    for (const line of addressLines(input.buyerAddress)) {
      text(line, left, y, { size: 10, color: muted });
      y -= 13;
    }
    if (input.buyerVatNumber) {
      text(`TVA : ${input.buyerVatNumber}`, left, y, { size: 10, color: muted });
      y -= 13;
    }

    y -= 24;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: muted });
    y -= 18;
    text('Description', left, y, { size: 9, bold: true, color: muted });
    text('Qté', 360, y, { size: 9, bold: true, color: muted });
    text('Montant HT', right - font.widthOfTextAtSize('Montant HT', 9), y, {
      size: 9,
      bold: true,
      color: muted,
    });
    y -= 16;
    text(input.description, left, y, { size: 10 });
    text(String(input.quantity), 360, y, { size: 10 });
    text(euros(input.htAmount), right - font.widthOfTextAtSize(euros(input.htAmount), 10), y, {
      size: 10,
    });

    y -= 22;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: muted });

    const totalRow = (label: string, value: string, isBold = false) => {
      y -= 18;
      text(label, 360, y, { size: 10, bold: isBold });
      text(value, right - (isBold ? bold : font).widthOfTextAtSize(value, 10), y, {
        size: 10,
        bold: isBold,
      });
    };
    totalRow('Total HT', euros(input.htAmount));
    totalRow(
      `TVA${input.taxRatePercent != null ? ` (${input.taxRatePercent} %)` : ''}`,
      euros(input.taxAmount)
    );
    totalRow('Total TTC', euros(input.totalAmount), true);

    y -= 40;
    text('Payée — réglée par carte via Mangopay.', left, y, { size: 9, color: muted });

    const bytes = await pdf.save();
    const path = `${input.date.getFullYear()}/${input.invoiceNumber}.pdf`;
    const service = createServiceClient();

    const { error: uploadErr } = await service.storage
      .from(INVOICE_BUCKET)
      .upload(path, Buffer.from(bytes), { contentType: 'application/pdf', upsert: true });
    if (uploadErr) {
      console.error('[invoice-pdf] upload failed:', uploadErr.message);
      return { invoiceNumber: input.invoiceNumber, invoicePdfUrl: null };
    }

    // ~10-year signed URL so the link emailed to the customer keeps working.
    const { data } = await service.storage
      .from(INVOICE_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 3650);
    return { invoiceNumber: input.invoiceNumber, invoicePdfUrl: data?.signedUrl ?? null };
  } catch (err) {
    console.error('[invoice-pdf] generation failed:', err);
    return { invoiceNumber: input.invoiceNumber, invoicePdfUrl: null };
  }
}
