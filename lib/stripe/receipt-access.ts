import { timingSafeEqual } from 'crypto';
import { stripe } from '@/lib/stripe/client';

/**
 * Whether `pi` + `cs` prove the visitor made the payment behind a receipt.
 *
 * The customer who tipped has no account. What they do hold is the
 * PaymentIntent's client secret: Stripe appends it to the return URL of the
 * success page, and it is scoped to that single payment. The PaymentIntent
 * carries our transaction id in its metadata, set server-side at creation, so
 * a valid secret for one tip never opens another tip's receipt.
 */
export async function customerHoldsPayment(transactionId: string, pi?: string, cs?: string): Promise<boolean> {
  if (!pi || !cs || !pi.startsWith('pi_')) return false;
  try {
    const intent = await stripe.paymentIntents.retrieve(pi);
    const secret = intent.client_secret ?? '';
    return (
      intent.metadata?.transaction_id === transactionId &&
      secret.length > 0 &&
      secret.length === cs.length &&
      timingSafeEqual(Buffer.from(secret), Buffer.from(cs))
    );
  } catch {
    return false;
  }
}
