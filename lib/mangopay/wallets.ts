import { mangopay, CURRENCY } from './client';

// Creates an EUR wallet owned by a single user (staff or ambassador). The
// wallet holds the user's transferred balance before payout.
export async function createWallet(ownerId: string, description: string): Promise<string> {
  const wallet = await mangopay().Wallets.create({
    Owners: [ownerId],
    Currency: CURRENCY,
    Description: description,
  });
  return wallet.Id;
}

// Returns the wallet balance in cents.
export async function getWalletBalance(walletId: string): Promise<number> {
  const wallet = await mangopay().Wallets.get(walletId);
  return wallet.Balance?.Amount ?? 0;
}
