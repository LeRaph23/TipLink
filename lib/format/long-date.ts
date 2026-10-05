/**
 * "1er novembre", not "1 novembre". Intl writes the bare number for the first
 * of the month in French, which reads as a machine wrote it.
 */
export function longDate(
  d: Date | string,
  locale: string,
  opts: { year?: boolean } = {},
): string {
  const date = new Date(d);
  const text = new Intl.DateTimeFormat(locale.startsWith('fr') ? 'fr-FR' : 'en-US', {
    day: 'numeric', month: 'long', ...(opts.year ? { year: 'numeric' } : {}),
    timeZone: 'Europe/Paris',
  }).format(date);
  return locale.startsWith('fr') ? text.replace(/^1 /, '1er ') : text;
}
