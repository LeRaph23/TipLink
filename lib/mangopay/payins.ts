import Mangopay from 'mangopay4-nodejs-sdk';
import { mangopay, money } from './client';

// SecureModeReturnURL to use with the Checkout SDK — the SDK handles the 3DS
// redirect internally and returns the user to its own domain.
export const CHECKOUT_SDK_RETURN_URL = 'https://checkout.mangopay.com';

export type DirectCardPayInInput = {
  authorId: string;
  creditedWalletId: string;
  cardId: string;
  debitedFunds: number; // cents — total charged to the card
  fees?: number; // cents — kept at 0; the platform commission lives in the ledger
  secureModeReturnURL?: string;
  statementDescriptor?: string;
  ipAddress?: string;
  browserInfo?: Mangopay.base.BrowserInfoData;
  tag?: string;
};

// Direct Card PayIn crediting the central collection wallet.
export async function createDirectCardPayIn(
  input: DirectCardPayInInput
): Promise<Mangopay.payIn.CardDirectPayInData> {
  const payload: Mangopay.payIn.CreateCardDirectPayIn = {
    ExecutionType: 'DIRECT',
    PaymentType: 'CARD',
    AuthorId: input.authorId,
    CreditedWalletId: input.creditedWalletId,
    CardId: input.cardId,
    DebitedFunds: money(input.debitedFunds),
    Fees: money(input.fees ?? 0),
    SecureModeReturnURL: input.secureModeReturnURL ?? CHECKOUT_SDK_RETURN_URL,
    SecureMode: 'DEFAULT',
    ...(input.statementDescriptor
      ? { StatementDescriptor: input.statementDescriptor.slice(0, 10) }
      : {}),
    ...(input.ipAddress ? { IpAddress: input.ipAddress } : {}),
    ...(input.browserInfo ? { BrowserInfo: input.browserInfo } : {}),
    ...(input.tag ? { Tag: input.tag } : {}),
  };
  return mangopay().PayIns.create(payload);
}

export async function getPayIn(payInId: string): Promise<Mangopay.payIn.PayInData> {
  return mangopay().PayIns.get(payInId);
}
