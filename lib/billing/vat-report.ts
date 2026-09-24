import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Everything Digitip sells that carries VAT, for one calendar year, in the
 * shape the annual CA12 return (3517-S) asks for: taxable base excluding VAT
 * and VAT collected, by rate.
 *
 * Two sources:
 * - Stripe invoices and credit notes: SmartTag packs and Pro subscriptions.
 *   Stripe Tax computed their VAT; this just adds it up (a credit note counts
 *   negative, so an invoice cancelled and reissued nets out).
 * - Tip service fees: the fee the tipper pays on top of the tip is Digitip's
 *   revenue and is not invoiced through Stripe. The advertised fee includes
 *   VAT, so the VAT is extracted from it at 20 %. The tip itself is a
 *   voluntary gratuity passed on to the establishment and carries no VAT.
 *
 * Deductible VAT (on Digitip's own purchases) is not known here: it comes from
 * supplier invoices and is entered by hand on the return.
 */

export const FEE_VAT_RATE_BPS = 2000;

export type VatSource = 'invoice' | 'credit_note' | 'tip_fee';

export type VatLine = {
  date: string; // ISO date (YYYY-MM-DD)
  source: VatSource;
  reference: string;
  customer: string;
  country: string;
  /** Rate in percent as applied (20, 5.5…), 0 when no VAT was charged. */
  ratePercent: number;
  htCents: number;
  vatCents: number;
  ttcCents: number;
};

export type VatBucket = { ratePercent: number; htCents: number; vatCents: number; ttcCents: number; lines: number };

export type VatSummary = {
  year: number;
  buckets: VatBucket[];
  totalHtCents: number;
  totalVatCents: number;
  totalTtcCents: number;
  bySource: Record<VatSource, { htCents: number; vatCents: number; lines: number }>;
  /** French invoices issued without VAT: always an error unless cancelled by a credit note. */
  frenchInvoicesWithoutVat: string[];
};

/** Splits a VAT-inclusive amount; the VAT is rounded to the cent, the base takes the rest. */
export function splitInclusive(ttcCents: number, rateBps = FEE_VAT_RATE_BPS): { htCents: number; vatCents: number } {
  const vatCents = Math.round((ttcCents * rateBps) / (10_000 + rateBps));
  return { htCents: ttcCents - vatCents, vatCents };
}

/**
 * The part of a tip's service fee Digitip actually kept: a refund returns the
 * fee in proportion to the amount refunded (a full refund returns all of it).
 */
export function keptFeeCents(fee: number, amount: number, refunded: number): number {
  if (fee <= 0 || amount <= 0) return 0;
  const kept = Math.max(0, amount - Math.max(0, refunded));
  return Math.round((fee * Math.min(kept, amount)) / amount);
}

function rateOf(htCents: number, vatCents: number): number {
  if (vatCents === 0 || htCents === 0) return 0;
  // Snap to the rates that exist in France / the EU so rounding noise on small
  // amounts does not create a "19.98 %" bucket.
  const raw = (vatCents / htCents) * 100;
  const known = [2.1, 5.5, 10, 20, 17, 19, 21, 22, 23, 24, 25, 27];
  const nearest = known.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
  return Math.abs(nearest - raw) < 0.5 ? nearest : Math.round(raw * 100) / 100;
}

export function summarize(year: number, lines: VatLine[]): VatSummary {
  const buckets = new Map<number, VatBucket>();
  const bySource: VatSummary['bySource'] = {
    invoice: { htCents: 0, vatCents: 0, lines: 0 },
    credit_note: { htCents: 0, vatCents: 0, lines: 0 },
    tip_fee: { htCents: 0, vatCents: 0, lines: 0 },
  };
  for (const l of lines) {
    const b = buckets.get(l.ratePercent) ?? { ratePercent: l.ratePercent, htCents: 0, vatCents: 0, ttcCents: 0, lines: 0 };
    b.htCents += l.htCents;
    b.vatCents += l.vatCents;
    b.ttcCents += l.ttcCents;
    b.lines += 1;
    buckets.set(l.ratePercent, b);
    const s = bySource[l.source];
    s.htCents += l.htCents;
    s.vatCents += l.vatCents;
    s.lines += 1;
  }
  const sorted = [...buckets.values()].sort((a, b) => b.ratePercent - a.ratePercent);
  return {
    year,
    buckets: sorted,
    totalHtCents: sorted.reduce((s, b) => s + b.htCents, 0),
    totalVatCents: sorted.reduce((s, b) => s + b.vatCents, 0),
    totalTtcCents: sorted.reduce((s, b) => s + b.ttcCents, 0),
    bySource,
    frenchInvoicesWithoutVat: lines
      .filter((l) => l.source === 'invoice' && l.country === 'FR' && l.vatCents === 0 && l.htCents > 0)
      .map((l) => l.reference),
  };
}

function isoDay(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function taxOf(totalTaxes: { amount: number }[] | null | undefined): number {
  return (totalTaxes ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);
}

export function invoiceLine(inv: Stripe.Invoice): VatLine {
  const vatCents = taxOf(inv.total_taxes);
  const htCents = inv.total_excluding_tax ?? inv.total - vatCents;
  return {
    date: isoDay(inv.status_transitions?.finalized_at ?? inv.created),
    source: 'invoice',
    reference: inv.number ?? inv.id,
    customer: inv.customer_name ?? inv.customer_email ?? '',
    country: inv.customer_address?.country ?? inv.customer_shipping?.address?.country ?? '',
    ratePercent: rateOf(htCents, vatCents),
    htCents,
    vatCents,
    ttcCents: inv.total,
  };
}

export function creditNoteLine(cn: Stripe.CreditNote, invoice: Stripe.Invoice | null): VatLine {
  const vatCents = taxOf(cn.total_taxes);
  const htCents = cn.total_excluding_tax ?? cn.total - vatCents;
  return {
    date: isoDay(cn.created),
    source: 'credit_note',
    reference: cn.number,
    customer: invoice?.customer_name ?? invoice?.customer_email ?? '',
    country: invoice?.customer_address?.country ?? '',
    ratePercent: rateOf(htCents, vatCents),
    htCents: -htCents,
    vatCents: -vatCents,
    ttcCents: -cn.total,
  };
}

function yearBounds(year: number) {
  const gte = Math.floor(Date.UTC(year, 0, 1) / 1000);
  const lt = Math.floor(Date.UTC(year + 1, 0, 1) / 1000);
  return { gte, lt };
}

async function stripeLines(year: number): Promise<VatLine[]> {
  const created = yearBounds(year);
  const invoices = await stripe.invoices
    .list({ created, status: 'paid', limit: 100 })
    .autoPagingToArray({ limit: 10_000 });
  const creditNotes = await stripe.creditNotes
    .list({ created, limit: 100, expand: ['data.invoice'] })
    .autoPagingToArray({ limit: 10_000 });
  return [
    ...invoices.map(invoiceLine),
    ...creditNotes
      .filter((cn) => cn.status !== 'void')
      .map((cn) => creditNoteLine(cn, typeof cn.invoice === 'object' ? (cn.invoice as Stripe.Invoice) : null)),
  ];
}

type TipRow = {
  id: string;
  succeeded_at: string | null;
  amount: number;
  refunded_amount: number | null;
  application_fee_amount: number | null;
  metadata: { service_fee?: number | string } | null;
  establishments: { name: string } | null;
};

async function tipFeeLines(year: number): Promise<VatLine[]> {
  const supabase = createServiceClient();
  const from = new Date(Date.UTC(year, 0, 1)).toISOString();
  const to = new Date(Date.UTC(year + 1, 0, 1)).toISOString();
  const rows: TipRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, succeeded_at, amount, refunded_amount, application_fee_amount, metadata, establishments(name)')
      .in('status', ['succeeded', 'refunded'])
      .gte('succeeded_at', from)
      .lt('succeeded_at', to)
      .order('succeeded_at')
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as TipRow[]));
    if (!data || data.length < PAGE) break;
  }

  return rows.flatMap((r) => {
    const fee = r.application_fee_amount ?? Number(r.metadata?.service_fee ?? 0);
    const kept = keptFeeCents(Number.isFinite(fee) ? fee : 0, r.amount, r.refunded_amount ?? 0);
    if (kept <= 0) return [];
    const { htCents, vatCents } = splitInclusive(kept);
    return [{
      date: (r.succeeded_at ?? '').slice(0, 10),
      source: 'tip_fee' as const,
      reference: r.id.slice(0, 8).toUpperCase(),
      customer: r.establishments?.name ?? '',
      country: 'FR',
      ratePercent: FEE_VAT_RATE_BPS / 100,
      htCents,
      vatCents,
      ttcCents: kept,
    }];
  });
}

export async function buildVatReport(year: number): Promise<{ summary: VatSummary; lines: VatLine[] }> {
  const [s, t] = await Promise.all([stripeLines(year), tipFeeLines(year)]);
  const lines = [...s, ...t].sort((a, b) => a.date.localeCompare(b.date));
  return { summary: summarize(year, lines), lines };
}

const SOURCE_LABEL: Record<VatSource, string> = {
  invoice: 'Facture Stripe',
  credit_note: 'Avoir Stripe',
  tip_fee: 'Frais de service pourboire',
};

function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** French-Excel friendly CSV: semicolons, decimal commas, BOM. */
export function vatLinesToCsv(lines: VatLine[]): string {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = ['Date', 'Type', 'Référence', 'Client', 'Pays', 'Taux TVA %', 'Base HT €', 'TVA €', 'TTC €'];
  const body = lines.map((l) =>
    [l.date, SOURCE_LABEL[l.source], l.reference, l.customer, l.country, String(l.ratePercent).replace('.', ','),
      euros(l.htCents), euros(l.vatCents), euros(l.ttcCents)].map(esc).join(';'),
  );
  return '﻿' + [header.join(';'), ...body].join('\r\n') + '\r\n';
}
