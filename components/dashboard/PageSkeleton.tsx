export default function PageSkeleton() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div className="shimmer" style={{ width: 160, height: 22, borderRadius: 7, marginBottom: 8 }} />
        <div className="shimmer" style={{ width: 230, height: 13, borderRadius: 5 }} />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="shimmer" style={{ width: 130, height: 14, borderRadius: 5 }} />
        </div>
        <div style={{ padding: '6px 0' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, padding: '13px 18px' }}>
              <div className="shimmer" style={{ flex: 1, height: 14, borderRadius: 5 }} />
              <div className="shimmer" style={{ width: 90, height: 14, borderRadius: 5 }} />
              <div className="shimmer" style={{ width: 64, height: 14, borderRadius: 5 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
