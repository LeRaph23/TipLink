export default function Loading() {
  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Wordmark skeleton */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <div className="shimmer" style={{ width: 80, height: 16, borderRadius: 8 }} />
        </div>
        {/* Staff card skeleton */}
        <div style={{ padding: 26, borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--border-subtle)', marginBottom: 12, textAlign: 'center' }}>
          <div className="shimmer" style={{ width: 68, height: 68, borderRadius: '50%', margin: '0 auto 12px' }} />
          <div className="shimmer" style={{ width: 140, height: 18, borderRadius: 6, margin: '0 auto 8px' }} />
          <div className="shimmer" style={{ width: 100, height: 13, borderRadius: 5, margin: '0 auto' }} />
        </div>
        {/* Amount grid skeleton */}
        <div style={{ padding: 20, borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--border-subtle)', marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[1, 2, 3, 4].map(i => <div key={i} className="shimmer" style={{ height: 64, borderRadius: 12 }} />)}
          </div>
        </div>
        {/* Payment buttons skeleton */}
        <div style={{ padding: 20, borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--border-subtle)' }}>
          <div className="shimmer" style={{ height: 52, borderRadius: 12, marginBottom: 10 }} />
          <div className="shimmer" style={{ height: 52, borderRadius: 12 }} />
        </div>
      </div>
    </main>
  );
}
