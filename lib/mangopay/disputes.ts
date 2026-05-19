import Mangopay from 'mangopay4-nodejs-sdk';
import { mangopay } from './client';

// Refetches a Dispute — the webhook resolves a DISPUTE_* Hook back to the
// disputed PayIn via DisputeData.InitialTransactionId.
export async function getDispute(disputeId: string): Promise<Mangopay.dispute.DisputeData> {
  return mangopay().Disputes.get(disputeId);
}
