/**
 * Where an NFC scan goes, from the row resolve_sticker_establishment returns.
 * Kept free of Node APIs: the proxy runs it on the edge.
 *
 * - no row: unknown tag
 * - no establishment: stock tag, which a manager claims through the wizard
 * - establishment whose group has not finished onboarding: a plaque bought
 *   online and shipped before its owner set up an account. It goes to the
 *   wizard too, which sends the activation link to the buyer's email; the tip
 *   page would only show customers a team that cannot be paid.
 * - otherwise: the tip page
 *
 * `group_onboarded` is undefined while the database still runs the resolver
 * from before migration 00086; that case keeps the old behaviour.
 */
export type StickerRow = {
  establishment_id: string | null;
  group_id?: string | null;
  group_onboarded?: boolean | null;
};

export type ScanDestination =
  | { kind: 'not_found' }
  | { kind: 'onboarding' }
  | { kind: 'tip'; establishmentId: string };

export function scanDestination(rows: StickerRow[]): ScanDestination {
  const row = rows[0];
  if (!row) return { kind: 'not_found' };
  if (!row.establishment_id) return { kind: 'onboarding' };
  if (row.group_onboarded === false) return { kind: 'onboarding' };
  return { kind: 'tip', establishmentId: row.establishment_id };
}

/** "mohamed@gmail.com" → "m•••@gmail.com": enough for the owner to recognise it. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '•••';
  return `${local[0]}•••@${domain}`;
}

/**
 * Language of the tip page for a scan with no saved preference. French when
 * the phone asks for French (or says nothing), English for any other language:
 * a German, Dutch or English-speaking customer reads English far better than
 * French. It used to fall back to French for everyone (sixth QA run).
 */
export function tipLocaleFromAcceptLanguage(header: string): 'fr' | 'en' {
  const first = header.split(',')[0]?.trim().toLowerCase() ?? '';
  if (!first || first === '*' || first.startsWith('fr')) return 'fr';
  return 'en';
}
