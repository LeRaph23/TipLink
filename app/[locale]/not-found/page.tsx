import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { NotFoundScreen } from '@/components/errors/NotFoundScreen';
import { NOINDEX_METADATA } from '@/lib/seo/metadata';

export const metadata: Metadata = NOINDEX_METADATA;

/**
 * `/<locale>/not-found` as a real URL.
 *
 * proxy.ts sends every failed SmartTag scan here — an unreadable short id, an
 * unreachable PostgREST, a non-OK response, an unknown tag. `not-found.tsx` is
 * a convention file and answers none of those, so all four landed on the
 * framework's default English 404 instead of the French copy written for them.
 * That is the screen someone sees after tapping a damaged or unassigned plaque,
 * which makes it part of the scan path rather than an edge case.
 */
export default async function NotFoundRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <NotFoundScreen />;
}
