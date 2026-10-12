import { CheckoutFooter, CheckoutShell } from '@/components/checkout/OrderSummary';
import { CheckoutSkeleton } from '@/components/checkout/PackCheckout';

// The landing's order buttons navigate straight here. The page waits on Stripe
// for the price before it can render, so without this the click shows nothing
// until then: the checkout's own skeleton appears at once instead.
export default function CheckoutLoading() {
  return (
    <CheckoutShell
      summary={<CheckoutSkeleton />}
      form={<CheckoutSkeleton />}
      footer={<CheckoutFooter />}
    />
  );
}
