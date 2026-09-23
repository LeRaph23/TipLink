/**
 * Shown while the success page confirms the payment.
 *
 * That page is not cheap: it retrieves the PaymentIntent from Stripe, then
 * resolves the staff member, the review link and the transaction. With no
 * loading state the customer got a blank white screen in the seconds right
 * after their card was charged, which is the single worst moment in the
 * product to show nothing at all.
 *
 * Deliberately neutral: it must not pre-empt the outcome with a green tick,
 * since the status is exactly what is still being established.
 */
export default function Loading() {
  return (
    <main style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <div className="shimmer" style={{ width: 72, height: 72, borderRadius: '50%', margin: '0 auto 20px' }} />
        <div className="shimmer" style={{ width: 200, height: 24, borderRadius: 8, margin: '0 auto 10px' }} />
        <div className="shimmer" style={{ width: 260, height: 14, borderRadius: 6, margin: '0 auto 28px' }} />
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)', padding: 20,
        }}>
          <div className="shimmer" style={{ width: '100%', height: 16, borderRadius: 6, marginBottom: 12 }} />
          <div className="shimmer" style={{ width: '70%', height: 16, borderRadius: 6 }} />
        </div>
      </div>
    </main>
  );
}
