/** Same reasoning as /pay/success: this page awaits Stripe before it can say
 *  anything, and a blank screen straight after a hardware purchase reads as a
 *  failed payment. */
export default function Loading() {
  return (
    <main style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <div className="shimmer" style={{ width: 72, height: 72, borderRadius: '50%', margin: '0 auto 20px' }} />
        <div className="shimmer" style={{ width: 220, height: 24, borderRadius: 8, margin: '0 auto 10px' }} />
        <div className="shimmer" style={{ width: 280, height: 14, borderRadius: 6, margin: '0 auto 28px' }} />
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)', padding: 20,
        }}>
          <div className="shimmer" style={{ width: '100%', height: 16, borderRadius: 6, marginBottom: 12 }} />
          <div className="shimmer" style={{ width: '60%', height: 16, borderRadius: 6 }} />
        </div>
      </div>
    </main>
  );
}
