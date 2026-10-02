import { Band, LogoShimmer, PayColumn, PayMain, Shimmer } from '@/components/pay/ui';

/**
 * Shown while the success page confirms the payment.
 *
 * That page is not cheap: it retrieves the PaymentIntent from Stripe, then
 * resolves the staff member, the review link and the transaction. With no
 * loading state the customer got a blank white screen in the seconds right
 * after their card was charged, which is the single worst moment in the
 * product to show nothing at all.
 *
 * Deliberately neutral: it must not pre-empt the outcome with a green tick or
 * the rose field, since the status is exactly what is still being established.
 */
export default function Loading() {
  return (
    <PayMain pb={32}>
      <div aria-busy="true">
        <Band tone="neutral" pb={48} logo={<LogoShimmer />}>
          <Shimmer w={64} h={64} r={999} style={{ margin: '0 auto 16px' }} />
          <Shimmer w={200} h={24} style={{ margin: '0 auto' }} />
          <Shimmer w={260} h={16} style={{ margin: '12px auto 0', maxWidth: '100%' }} />
        </Band>
        <PayColumn>
          <div style={{
            marginTop: 16, padding: '16px 20px', borderRadius: 'var(--radius-lg)',
            background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          }}>
            <Shimmer w="100%" h={16} style={{ marginBottom: 16 }} />
            <Shimmer w="70%" h={16} />
          </div>
        </PayColumn>
      </div>
    </PayMain>
  );
}
