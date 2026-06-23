// Cache tags for the public tipping pages (`/pay/[staffId]` and
// `/pay/group/[establishmentId]`).
//
// These pages cache their Supabase reads in the Next.js Data Cache so a scanned
// tag no longer pays for a database round-trip on every open (see the `fetch`
// calls in the two pay pages). The entries are invalidated on-demand whenever
// the underlying data that drives the page changes:
//
//   - `updateTag(tag)`            in Server Actions (read-your-own-writes)
//   - `revalidateTag(tag, 'max')` in Route Handlers / webhooks (stale-while-revalidate)
//
// A short time-based `revalidate` on the fetches acts as a safety net so any
// mutation path we don't explicitly tag still self-heals within minutes.

/** Tag for the single-staff tip page `/pay/[staffId]`. */
export function staffTipTag(staffId: string): string {
  return `pay:staff:${staffId}`;
}

/** Tag for the establishment "pick a colleague" page `/pay/group/[establishmentId]`. */
export function establishmentTipTag(establishmentId: string): string {
  return `pay:establishment:${establishmentId}`;
}
