export default function Loading() {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div className="shimmer" style={{ width: 140, height: 22, borderRadius: 7, marginBottom: 8 }} />
        <div className="shimmer" style={{ width: 220, height: 13, borderRadius: 5 }} />
      </div>
      <div className="shimmer" style={{ height: 64, borderRadius: 'var(--radius)', marginBottom: 18 }} />

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ padding: '6px 0' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '13px 18px' }}>
              <div className="shimmer" style={{ width: 70, height: 18, borderRadius: 5 }} />
              <div className="shimmer" style={{ flex: 1, height: 14, borderRadius: 5 }} />
              <div className="shimmer" style={{ width: 100, height: 14, borderRadius: 5 }} />
              <div className="shimmer" style={{ width: 90, height: 26, borderRadius: 6 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
