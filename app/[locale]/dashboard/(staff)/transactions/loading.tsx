export default function Loading() {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22, gap: 16 }}>
        <div>
          <div className="shimmer" style={{ width: 150, height: 22, borderRadius: 7, marginBottom: 8 }} />
          <div className="shimmer" style={{ width: 200, height: 13, borderRadius: 5 }} />
        </div>
        <div className="shimmer" style={{ width: 110, height: 34, borderRadius: 8 }} />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ padding: '6px 0' }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, padding: '14px 18px' }}>
              <div className="shimmer" style={{ flex: 1, height: 14, borderRadius: 5 }} />
              <div className="shimmer" style={{ width: 90, height: 14, borderRadius: 5 }} />
              <div className="shimmer" style={{ width: 70, height: 14, borderRadius: 5 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
