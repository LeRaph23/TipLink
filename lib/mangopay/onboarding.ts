import 'server-only';
import { validateIban } from '@/lib/banking/iban';
import { createNaturalOwner } from './users';
import { createWallet } from './wallets';
import { createIbanRecipient } from './recipients';

export type MangopayAccountInput = {
  firstName: string;
  lastName: string;
  email: string;
  dob: { day: number; month: number; year: number };
  address: { line1: string; city: string; postal_code: string; country: string };
  iban: string;
  bic?: string;
  // ISO 3166-1 alpha-2; defaults to the address country.
  nationality?: string;
  walletDescription: string;
};

export type ProvisionResult =
  | { ok: true; userId: string; walletId: string; recipientId: string; scaRedirectUrl: string | null }
  | { ok: false; error: string };

// Creates the Mangopay objects every payee (staff member or ambassador) needs:
// an OWNER Natural User, an EUR wallet, and a PAYOUT IBAN Recipient. The PAYOUT
// Recipient requires SCA — its PendingUserAction.RedirectUrl is returned so the
// caller can send the browser through the hosted session (appending its own
// returnUrl). Shared by the staff and ambassador onboarding flows.
export async function provisionMangopayAccount(
  input: MangopayAccountInput
): Promise<ProvisionResult> {
  const ibanResult = validateIban(input.iban);
  if (!ibanResult.ok) return { ok: false, error: ibanResult.error };

  const addressCountry = input.address.country.toUpperCase();
  const recipientAddress = {
    addressLine1: input.address.line1,
    city: input.address.city,
    postalCode: input.address.postal_code,
    country: addressCountry,
  };

  try {
    const userId = await createNaturalOwner({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      birthday: new Date(Date.UTC(input.dob.year, input.dob.month - 1, input.dob.day)),
      nationality: (input.nationality ?? input.address.country).toUpperCase(),
      countryOfResidence: addressCountry,
      address: recipientAddress,
    });

    const walletId = await createWallet(userId, input.walletDescription);

    const recipient = await createIbanRecipient({
      userId,
      displayName: `${input.firstName} ${input.lastName}`,
      firstName: input.firstName,
      lastName: input.lastName,
      iban: ibanResult.normalized,
      bic: input.bic,
      country: ibanResult.country,
      address: recipientAddress,
      scaContext: 'USER_PRESENT',
    });

    return {
      ok: true,
      userId,
      walletId,
      recipientId: recipient.Id,
      scaRedirectUrl: recipient.PendingUserAction?.RedirectUrl ?? null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Création du compte Mangopay échouée';
    console.error('provisionMangopayAccount failed', err);
    return { ok: false, error: msg };
  }
}
