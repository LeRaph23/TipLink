import Mangopay from 'mangopay4-nodejs-sdk';
import { mangopay, money } from './client';

export type ScaContext = 'USER_PRESENT' | 'USER_NOT_PRESENT';

export type TransferInput = {
  authorId: string;
  creditedUserId: string;
  debitedWalletId: string;
  creditedWalletId: string;
  amount: number; // cents
  scaContext?: ScaContext;
  tag?: string;
};

// Wallet-to-wallet transfer (central collection wallet -> staff/ambassador
// wallet). When both users are OWNER this is subject to SCA: pass scaContext.
// USER_NOT_PRESENT requires the credited user to have given prior SCA consent.
export async function createTransfer(
  input: TransferInput
): Promise<Mangopay.transfer.TransferData> {
  const payload: Mangopay.transfer.CreateTransfer = {
    AuthorId: input.authorId,
    CreditedUserId: input.creditedUserId,
    DebitedWalletId: input.debitedWalletId,
    CreditedWalletId: input.creditedWalletId,
    DebitedFunds: money(input.amount),
    Fees: money(0),
    ...(input.scaContext ? { ScaContext: input.scaContext } : {}),
    ...(input.tag ? { Tag: input.tag } : {}),
  };
  return mangopay().Transfers.create(payload);
}

export async function getTransfer(id: string): Promise<Mangopay.transfer.TransferData> {
  return mangopay().Transfers.get(id);
}
