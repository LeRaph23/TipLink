export type LegalPath =
  | '/privacy'
  | '/terms'
  | '/mentions-legales'
  | '/cgv'
  | '/dpa'
  | '/conditions-pourboire';

/** Every legal page, in the order the footer of each one lists them. */
export function legalNavLinks(tc: (key: string) => string): { label: string; href: LegalPath }[] {
  return [
    { label: tc('mentionsLegales'), href: '/mentions-legales' },
    { label: tc('cgv'), href: '/cgv' },
    { label: tc('terms'), href: '/terms' },
    { label: tc('dpa'), href: '/dpa' },
    { label: tc('tipTerms'), href: '/conditions-pourboire' },
    { label: tc('privacy'), href: '/privacy' },
  ];
}
