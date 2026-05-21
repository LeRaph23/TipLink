/**
 * Commission grid for the Commerciaux Pros programme.
 *
 * Voluntarily kept in its own module (parallel to `lib/ambassador-tiers.ts`)
 * so the webhook attribution code stays a clean branch — never read the
 * ambassador grid here, and never read this from ambassador code paths.
 *
 * Amounts in centimes.
 */
export const COMMERCIAL_COMMISSION_BY_PACK = {
  solo: 5000,
  duo: 6500,
} as const;

export const COMMERCIAL_MIN_PAYOUT_CENTS = 3000;

export type CommercialLegalForm =
  | 'sarl'
  | 'sas'
  | 'sasu'
  | 'ei'
  | 'auto_entrepreneur'
  | 'eurl'
  | 'sa'
  | 'autre';

export const COMMERCIAL_LEGAL_FORMS: { value: CommercialLegalForm; label: string }[] = [
  { value: 'auto_entrepreneur', label: 'Auto-entrepreneur / micro-entreprise' },
  { value: 'ei', label: 'Entreprise individuelle (EI)' },
  { value: 'eurl', label: 'EURL' },
  { value: 'sarl', label: 'SARL' },
  { value: 'sasu', label: 'SASU' },
  { value: 'sas', label: 'SAS' },
  { value: 'sa', label: 'SA' },
  { value: 'autre', label: 'Autre' },
];

export type CommercialVrpStatus =
  | 'vrp_exclusif'
  | 'vrp_multicarte'
  | 'agent_commercial'
  | 'independant'
  | 'autre';

export const COMMERCIAL_VRP_STATUSES: { value: CommercialVrpStatus; label: string }[] = [
  { value: 'vrp_exclusif', label: 'VRP exclusif' },
  { value: 'vrp_multicarte', label: 'VRP multicarte' },
  { value: 'agent_commercial', label: 'Agent commercial' },
  { value: 'independant', label: 'Commercial indépendant' },
  { value: 'autre', label: 'Autre' },
];
