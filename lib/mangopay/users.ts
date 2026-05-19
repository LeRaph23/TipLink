import Mangopay from 'mangopay4-nodejs-sdk';
import { mangopay } from './client';

export type NaturalOwnerInput = {
  firstName: string;
  lastName: string;
  email: string;
  birthday: Date;
  nationality: string; // ISO 3166-1 alpha-2
  countryOfResidence: string; // ISO 3166-1 alpha-2
  address?: {
    addressLine1: string;
    city: string;
    postalCode: string;
    country: string;
  };
};

// Creates an OWNER-category Natural User (staff member or ambassador). OWNER
// users can hold a wallet, receive transfers and request payouts once their
// KYC identity proof is validated. They must accept Mangopay's terms.
export async function createNaturalOwner(input: NaturalOwnerInput): Promise<string> {
  const payload: Mangopay.user.CreateUserNaturalOwnerData = {
    PersonType: 'NATURAL',
    UserCategory: 'OWNER',
    TermsAndConditionsAccepted: true,
    FirstName: input.firstName,
    LastName: input.lastName,
    Email: input.email,
    Birthday: Math.floor(input.birthday.getTime() / 1000),
    Nationality: input.nationality as Mangopay.CountryISO,
    CountryOfResidence: input.countryOfResidence as Mangopay.CountryISO,
    ...(input.address
      ? {
          Address: {
            AddressLine1: input.address.addressLine1,
            City: input.address.city,
            PostalCode: input.address.postalCode,
            Country: input.address.country as Mangopay.CountryISO,
          },
        }
      : {}),
  };
  const user = await mangopay().Users.create(payload);
  return user.Id;
}

// Creates a lightweight PAYER-category Natural User for a guest tipper. A PayIn
// requires an AuthorId; a PAYER can pay but cannot receive funds, needs no KYC
// and no terms acceptance.
export async function createTipperUser(input: {
  firstName: string;
  lastName: string;
  email: string;
}): Promise<string> {
  const payload: Mangopay.user.CreateUserNaturalPayerData = {
    PersonType: 'NATURAL',
    UserCategory: 'PAYER',
    FirstName: input.firstName,
    LastName: input.lastName,
    Email: input.email,
  };
  const user = await mangopay().Users.create(payload);
  return user.Id;
}

export async function getUser(userId: string) {
  return mangopay().Users.get(userId);
}

// Enrolls an OWNER user in SCA. The returned RedirectUrl must be sent to the
// browser (with an encoded returnUrl query parameter appended) so the user can
// complete the hosted SCA session. Required before USER_NOT_PRESENT transfers.
export async function enrollUserInSca(userId: string): Promise<string | null> {
  const result = await mangopay().Users.enroll(userId);
  return result?.PendingUserAction?.RedirectUrl ?? null;
}
