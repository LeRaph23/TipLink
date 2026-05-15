import {
  isValidIBAN,
  electronicFormatIBAN,
  friendlyFormatIBAN,
  getCountrySpecifications,
} from 'ibantools';

const SEPA_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES',
  'FI', 'FR', 'GB', 'GI', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT',
  'LI', 'LT', 'LU', 'LV', 'MC', 'MT', 'NL', 'NO', 'PL', 'PT',
  'RO', 'SE', 'SI', 'SK', 'SM', 'VA',
]);

export type IbanValidationResult =
  | { ok: true; normalized: string; country: string; friendly: string }
  | { ok: false; error: string };

export function validateIban(input: string | null | undefined): IbanValidationResult {
  if (!input) return { ok: false, error: 'IBAN requis.' };

  const normalized = electronicFormatIBAN(input);
  if (!normalized) return { ok: false, error: 'IBAN invalide (format non reconnu).' };

  if (!/^[A-Z0-9]+$/.test(normalized)) {
    return { ok: false, error: 'IBAN invalide (caractères non autorisés).' };
  }

  const country = normalized.slice(0, 2);
  if (!/^[A-Z]{2}$/.test(country)) {
    return { ok: false, error: 'IBAN invalide (code pays manquant).' };
  }

  if (!SEPA_COUNTRIES.has(country)) {
    return { ok: false, error: `Code pays IBAN non supporté (${country}). Seuls les IBAN SEPA sont acceptés.` };
  }

  const spec = getCountrySpecifications()[country];
  if (spec?.IBANRegistry && spec.chars && normalized.length !== spec.chars) {
    return {
      ok: false,
      error: `Longueur incorrecte pour un IBAN ${country} (attendu ${spec.chars} caractères, reçu ${normalized.length}).`,
    };
  }

  if (!isValidIBAN(normalized)) {
    return { ok: false, error: 'IBAN invalide (checksum incorrect). Vérifiez la saisie.' };
  }

  return {
    ok: true,
    normalized,
    country,
    friendly: friendlyFormatIBAN(normalized) ?? normalized,
  };
}

export function formatIbanFriendly(iban: string): string {
  return friendlyFormatIBAN(electronicFormatIBAN(iban) ?? iban) ?? iban;
}
