export default function Loading() {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22, gap: 16 }}>
        <div>
          <div className="shimmer" style={{ width: 130, height: 22, borderRadius: 7, marginBottom: 8 }} />
          <div className="shimmer" style={{ width: 210, height: 13, borderRadius: 5 }} />
        </div>
        <div className="shimmer" style={{ width: 120, height: 34, borderRadius: 8 }} />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ padding: '6px 0' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '13px 18px' }}>
              <div className="shimmer" style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0 }} />
              <div className="shimmer" style={{ flex: 1, height: 14, borderRadius: 5 }} />
              <div className="shimmer" style={{ width: 90, height: 14, borderRadius: 5 }} />
              <div className="shimmer" style={{ width: 60, height: 22, borderRadius: 100 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
