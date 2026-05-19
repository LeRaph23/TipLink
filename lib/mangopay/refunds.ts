import Mangopay from 'mangopay4-nodejs-sdk';
import { mangopay, platformIds } from './client';

// Full refund of a card PayIn — returns the funds to the cardholder. A PayIn
// that is the subject of an open dispute cannot be refunded.
export async function refundPayIn(payInId: string): Promise<Mangopay.refund.RefundData> {
  return mangopay().PayIns.createRefund(payInId, {
    AuthorId: platformIds().userId,
  });
}

// Full refund of a Transfer — claws the funds back from a staff/ambassador
// wallet into the central wallet, undoing a tip distribution after a
// cardholder refund or a lost dispute.
export async function refundTransfer(
  transferId: string
): Promise<Mangopay.refund.RefundData> {
  return mangopay().Transfers.createRefund(transferId, {
    AuthorId: platformIds().userId,
  });
}

// Refetches a Refund — used by the webhook to resolve a PAYIN_REFUND_SUCCEEDED
// Hook back to the original transaction (RefundData.InitialTransactionId).
export async function getRefund(refundId: string): Promise<Mangopay.refund.RefundData> {
  return mangopay().Refunds.get(refundId);
}
