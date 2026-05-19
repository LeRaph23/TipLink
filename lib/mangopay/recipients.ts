import Mangopay from 'mangopay4-nodejs-sdk';
import { mangopay, CURRENCY } from './client';
import type { ScaContext } from './transfers';

export type IbanRecipientInput = {
  userId: string;
  displayName: string;
  firstName: string;
  lastName: string;
  iban: string;
  bic?: string;
  country: string; // ISO 3166-1 alpha-2
  address: {
    addressLine1: string;
    city: string;
    postalCode: string;
    country: string;
  };
  scaContext?: ScaContext;
};

// Registers a SEPA IBAN as a PAYOUT-scoped Recipient. Requires the user to be
// OWNER and triggers SCA — the returned PendingUserAction.RedirectUrl must be
// used to send the user through the hosted SCA session before payouts work.
export async function createIbanRecipient(
  input: IbanRecipientInput
): Promise<Mangopay.recipient.RecipientData> {
  const payload: Mangopay.recipient.CreateRecipientData = {
    DisplayName: input.displayName,
    PayoutMethodType: 'LocalBankTransfer',
    RecipientType: 'Individual',
    RecipientScope: 'PAYOUT',
    Currency: CURRENCY,
    Country: input.country as Mangopay.CountryISO,
    IndividualRecipient: {
      FirstName: input.firstName,
      LastName: input.lastName,
      Address: {
        AddressLine1: input.address.addressLine1,
        City: input.address.city,
        PostalCode: input.address.postalCode,
        Country: input.address.country as Mangopay.CountryISO,
      },
    },
    // SEPA EUR LocalBankTransfer schema: IBAN (+ optional BIC). If a payout
    // engine rejects a field, confirm the exact schema via Recipients.getSchema.
    LocalBankTransfer: {
      IBAN: input.iban,
      ...(input.bic ? { BIC: input.bic } : {}),
    },
    ...(input.scaContext ? { ScaContext: input.scaContext } : {}),
  };
  return mangopay().Recipients.create(payload, input.userId);
}

export async function getRecipient(id: string): Promise<Mangopay.recipient.RecipientData> {
  return mangopay().Recipients.get(id);
}

export async function deactivateRecipient(id: string): Promise<void> {
  await mangopay().Recipients.deactivate(id);
}
