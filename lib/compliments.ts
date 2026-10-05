/**
 * What a customer can say about the person who served them.
 *
 * Shared by the tip success page (client), the API route that stores them and
 * the dashboards that count them, so all three agree on the list. The SQL
 * CHECK in 00088 holds the same five keys: adding one means a migration too.
 *
 * Chips first and a sentence second, because a chip is one tap and most
 * customers will give exactly one tap. Compliments only, never a rating: see
 * the migration for why a score next to a review invitation is a liability.
 */
export const COMPLIMENT_TAGS = ['welcome', 'advice', 'speed', 'smile', 'care'] as const;

export type ComplimentTag = (typeof COMPLIMENT_TAGS)[number];

export const COMPLIMENT_MESSAGE_MAX = 280;

export function isComplimentTag(v: unknown): v is ComplimentTag {
  return typeof v === 'string' && (COMPLIMENT_TAGS as readonly string[]).includes(v);
}

export type ComplimentRow = {
  staff_id: string | null;
  tags: string[] | null;
  message: string | null;
  hidden_at?: string | null;
};

export type StaffComplimentSummary = {
  /** Null for compliments addressed to the whole team. */
  staffId: string | null;
  count: number;
  /** Tags by frequency, most given first. Ties keep the canonical order. */
  topTags: Array<{ tag: ComplimentTag; count: number }>;
  messageCount: number;
};

/**
 * Per-recipient tallies, busiest first. Pure so the ordering rules, which are
 * what a manager reads as "who is doing well", can be checked.
 */
export function summarizeCompliments(rows: ComplimentRow[]): StaffComplimentSummary[] {
  const by = new Map<string | null, { count: number; messages: number; tags: Map<ComplimentTag, number> }>();
  for (const r of rows) {
    const key = r.staff_id ?? null;
    const acc = by.get(key) ?? { count: 0, messages: 0, tags: new Map() };
    acc.count += 1;
    if (r.message && r.message.trim()) acc.messages += 1;
    for (const t of r.tags ?? []) {
      if (isComplimentTag(t)) acc.tags.set(t, (acc.tags.get(t) ?? 0) + 1);
    }
    by.set(key, acc);
  }
  return [...by.entries()]
    .map(([staffId, acc]) => ({
      staffId,
      count: acc.count,
      messageCount: acc.messages,
      topTags: [...acc.tags.entries()]
        .sort((a, b) => b[1] - a[1] || COMPLIMENT_TAGS.indexOf(a[0]) - COMPLIMENT_TAGS.indexOf(b[0]))
        .map(([tag, count]) => ({ tag, count })),
    }))
    // The team row last whatever its count: it is nobody in particular.
    .sort((a, b) => (a.staffId === null ? 1 : 0) - (b.staffId === null ? 1 : 0) || b.count - a.count);
}
