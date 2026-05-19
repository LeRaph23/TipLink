import Mangopay from 'mangopay4-nodejs-sdk';
import { mangopay, money } from './client';

export type PayOutInput = {
  authorId: string;
  debitedWalletId: string;
  recipientId: string;
  amount: number; // cents
  bankWireRef?: string; // appears on the bank statement, max 12 chars
  tag?: string;
};

// Payout from a wallet to a registered Recipient (IBAN). Exempt from SCA
// because the Recipient registration was itself SCA-authenticated (trusted
// beneficiary exemption).
export async function createPayOut(
  input: PayOutInput
): Promise<Mangopay.payOut.PayOutData> {
  const payload: Mangopay.payOut.CreatePayOut = {
    AuthorId: input.authorId,
    DebitedWalletId: input.debitedWalletId,
    RecipientId: input.recipientId,
    DebitedFunds: money(input.amount),
    Fees: money(0),
    PaymentType: 'BANK_WIRE',
    ...(input.bankWireRef ? { BankWireRef: input.bankWireRef.slice(0, 12) } : {}),
    ...(input.tag ? { Tag: input.tag } : {}),
  };
  return mangopay().PayOuts.create(payload);
}

export async function getPayOut(id: string): Promise<Mangopay.payOut.PayOutData> {
  return mangopay().PayOuts.get(id);
}
