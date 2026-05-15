export default function Loading() {
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div className="shimmer" style={{ width: 150, height: 22, borderRadius: 7, marginBottom: 8 }} />
        <div className="shimmer" style={{ width: 220, height: 13, borderRadius: 5 }} />
      </div>

      <div className="dash-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 20 }}>
            <div className="shimmer" style={{ width: 72, height: 11, borderRadius: 4, marginBottom: 14 }} />
            <div className="shimmer" style={{ width: 110, height: 28, borderRadius: 6, marginBottom: 8 }} />
            <div className="shimmer" style={{ width: 80, height: 11, borderRadius: 4 }} />
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="shimmer" style={{ width: 120, height: 14, borderRadius: 5 }} />
        </div>
        <div style={{ padding: '6px 0' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, padding: '13px 18px' }}>
              <div className="shimmer" style={{ flex: 1, height: 14, borderRadius: 5 }} />
              <div className="shimmer" style={{ width: 80, height: 14, borderRadius: 5 }} />
              <div className="shimmer" style={{ width: 64, height: 14, borderRadius: 5 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
