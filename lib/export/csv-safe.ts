/**
 * Spreadsheets run a cell that starts with = + - @ as a formula. Names in our
 * exports are typed by employees and managers, so `=HYPERLINK(...)` as a first
 * name would run in the accountant's Excel. Such cells get a leading
 * apostrophe, which Excel and LibreOffice show as plain text. Plain numbers,
 * negative amounts included, are left alone.
 */
export function neutralizeFormula(s: string): string {
  if (!/^[=+\-@\t\r]/.test(s)) return s;
  if (/^-?\d+([.,]\d+)?$/.test(s)) return s;
  return `'${s}`;
}
