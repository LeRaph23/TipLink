import Mangopay from 'mangopay4-nodejs-sdk';
import { mangopay, CURRENCY } from './client';

// Creates a CardRegistration object. This is served verbatim to the Checkout
// SDK's `onCreateCardRegistration` callback; the SDK then tokenizes the card
// client-side, updates the registration, and yields a CardId for the PayIn.
export async function createCardRegistration(
  userId: string,
  cardType: string
): Promise<Mangopay.cardRegistration.CardRegistrationData> {
  return mangopay().CardRegistrations.create({
    UserId: userId,
    Currency: CURRENCY,
    CardType: cardType as Mangopay.card.CardType,
  });
}
