import 'server-only';
import type { createServiceClient } from '@/lib/supabase/service';

type Service = ReturnType<typeof createServiceClient>;

export type PayrollPeriod = { start: string; end: string; label: string };

/** One line per employee: what goes to the accountant. */
export type PayrollSummaryRow = {
  staffId: string;
  name: string;
  count: number;
  amountCents: number;
};

/** One line per tip: the audit trail behind the summary. */
export type PayrollJournalRow = {
  /** Paris local date (YYYY-MM-DD) and time (HH:MM) of the tip. */
  date: string;
  time?: string;
  staffName: string;
  tipCents: number;
  feeCents: number;
  totalCents: number;
  reference: string;
};

export type PayrollDataset = {
  period: PayrollPeriod;
  summary: PayrollSummaryRow[];
  totals: { count: number; amountCents: number };
};

const PAGE = 1000;

export function monthPeriod(month: string): PayrollPeriod {
  const [y, m] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
    end: new Date(Date.UTC(y, m, 1)).toISOString(),
    label: month,
  };
}

export function previousMonth(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Every non-deleted staff member across a group's establishments. */
async function staffOfGroup(service: Service, groupId: string): Promise<Map<string, string>> {
  const { data: ests } = await service
    .from('establishments')
    .select('id')
    .eq('group_id', groupId)
    .is('deleted_at', null);

  const estIds = (ests ?? []).map((e) => e.id);
  if (estIds.length === 0) return new Map();

  const { data: staff } = await service
    .from('staff_profiles')
    .select('id, full_name')
    .in('establishment_id', estIds)
    .is('deleted_at', null);

  return new Map((staff ?? []).map((s) => [s.id, s.full_name]));
}

/**
 * Tips attributed to each employee over a period.
 *
 * Reads `tip_allocations`, not `transactions`: the money reached the
 * establishment in one lump, and this is the record of who earned which part
 * of it. Reversed rows are excluded — a refunded tip must not be paid twice,
 * once by the customer's bank and once through payroll.
 *
 * Paged so peak memory stays bounded for a busy group and so a PostgREST row
 * cap can never silently truncate someone's month.
 */
export async function buildPayrollSummary(
  service: Service,
  groupId: string,
  period: PayrollPeriod,
): Promise<PayrollDataset> {
  const byId = await staffOfGroup(service, groupId);
  const staffIds = [...byId.keys()];
  const agg = new Map<string, PayrollSummaryRow>();

  if (staffIds.length > 0) {
    for (let from = 0; ; from += PAGE) {
      const { data } = await service
        .from('tip_allocations')
        .select('amount, staff_id, id')
        .in('staff_id', staffIds)
        .eq('status', 'allocated')
        .gte('allocated_at', period.start)
        .lt('allocated_at', period.end)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);

      const rows = (data ?? []) as Array<{ amount: number; staff_id: string }>;
      for (const a of rows) {
        const r = agg.get(a.staff_id) ?? {
          staffId: a.staff_id,
          name: byId.get(a.staff_id) ?? '',
          count: 0,
          amountCents: 0,
        };
        r.count += 1;
        r.amountCents += a.amount;
        agg.set(a.staff_id, r);
      }
      if (rows.length < PAGE) break;
    }
  }

  const summary = [...agg.values()].sort((a, b) => b.amountCents - a.amountCents);
  return {
    period,
    summary,
    totals: summary.reduce(
      (acc, r) => ({ count: acc.count + r.count, amountCents: acc.amountCents + r.amountCents }),
      { count: 0, amountCents: 0 },
    ),
  };
}

/**
 * One row per tip, for an accountant who wants to reconcile the summary against
 * the bank statement. Includes what the customer paid on top, so the total
 * received by the establishment lines up with what Stripe deposited.
 */
export async function buildPayrollJournal(
  service: Service,
  groupId: string,
  period: PayrollPeriod,
): Promise<PayrollJournalRow[]> {
  const byId = await staffOfGroup(service, groupId);
  const staffIds = [...byId.keys()];
  if (staffIds.length === 0) return [];

  const out: PayrollJournalRow[] = [];

  for (let from = 0; ; from += PAGE) {
    const { data } = await service
      .from('tip_allocations')
      .select('id, amount, staff_id, allocated_at, transactions(id, amount, metadata)')
      .in('staff_id', staffIds)
      .eq('status', 'allocated')
      .gte('allocated_at', period.start)
      .lt('allocated_at', period.end)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);

    const rows = (data ?? []) as unknown as Array<{
      id: string;
      amount: number;
      staff_id: string;
      allocated_at: string | null;
      transactions: { id: string; amount: number; metadata: { tip_amount?: number; service_fee?: number } | null } | null;
    }>;

    for (const r of rows) {
      const tip = Number(r.transactions?.metadata?.tip_amount);
      const fee = Number(r.transactions?.metadata?.service_fee);
      const at = r.allocated_at ? parisDateTime(r.allocated_at) : { date: '', time: '' };
      out.push({
        date: at.date,
        time: at.time,
        staffName: byId.get(r.staff_id) ?? '',
        // The employee's share, which is the whole tip on a solo one and a
        // fraction of it on a team tip.
        tipCents: r.amount,
        // Fee and total describe the whole transaction, not this share — an
        // accountant matching a bank line needs the figure the customer paid.
        feeCents: Number.isFinite(fee) ? fee : 0,
        totalCents: r.transactions?.amount ?? (Number.isFinite(tip) ? tip : r.amount),
        reference: r.transactions?.id ?? r.id,
      });
    }
    if (rows.length < PAGE) break;
  }

  return out;
}

/** A timestamp as the date and time shown on a clock in France. */
export function parisDateTime(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

// ── CSV rendering ────────────────────────────────────────────────────────────
// French Excel conventions, since these files go to French payroll and
// accountants: semicolon separator, decimal comma, UTF-8 BOM, CRLF.

export function csvCell(v: string | number): string {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const eur = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

/** UTF-8 BOM + CRLF so Excel opens accented names correctly on a double-click. */
export function toCsv(header: string[], rows: Array<Array<string | number>>): string {
  const lines = [header.map(csvCell).join(';')];
  for (const r of rows) lines.push(r.map(csvCell).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function summaryCsv(data: PayrollDataset): string {
  return toCsv(
    ['Employé', 'Période', 'Nombre de pourboires', 'Montant à verser (€)'],
    data.summary.map((r) => [r.name, data.period.label, r.count, eur(r.amountCents)]),
  );
}

export function journalCsv(rows: PayrollJournalRow[]): string {
  return toCsv(
    ['Date', 'Heure', 'Employé', 'Part employé (€)', 'Frais client (€)', 'Total payé par le client (€)', 'Référence'],
    rows.map((r) => [r.date, r.time ?? '', r.staffName, eur(r.tipCents), eur(r.feeCents), eur(r.totalCents), r.reference]),
  );
}
