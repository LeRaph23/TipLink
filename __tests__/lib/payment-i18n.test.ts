import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The tipping surface must carry no hardcoded French.
 *
 * `components/payment/AmountSelector.tsx` and its group twin rendered the line
 * that tells a stranger how much their card is about to be charged as
 * "{x} pourboire + {y} frais de service = {z} débités", literally, while using
 * next-intl for the `aria-label` immediately beside it. An English-locale
 * tipper read "€5 pourboire + €0.45 frais de service = €5.45 débités" on the
 * app's primary screen, at the one moment they are deciding whether to pay.
 *
 * This guards the result rather than the method: a component here may use any
 * key it likes, but it may not ship French prose.
 */

const FILES = [
  'components/payment/AmountSelector.tsx',
  'components/payment/GroupAmountSelector.tsx',
  'components/payment/TipCheckout.tsx',
  'components/payment/GroupTipCheckout.tsx',
];

// Unmistakably French, and short enough not to collide with English or with
// identifiers. Accented forms catch the rest.
const FRENCH = [
  'pourboire', 'frais de service', 'débit', 'Montant', 'Choisissez',
  'Veuillez', 'Réessayer', 'Paiement', 'équipe', 'établissement',
];

/** Strips // and block comments so prose in an explanation is not a finding. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('tipping surface carries no hardcoded French', () => {
  for (const file of FILES) {
    it(file, () => {
      let src: string;
      try {
        src = readFileSync(join(process.cwd(), file), 'utf8');
      } catch {
        // The file list is a guard, not a manifest: a renamed component should
        // not fail the suite on its name.
        return;
      }
      const code = stripComments(src);
      const found = FRENCH.filter((word) => new RegExp(word, 'i').test(code));
      expect(found).toEqual([]);
    });
  }
});
