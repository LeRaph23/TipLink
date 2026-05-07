export default function AdminLoading() {
  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100 }}>
      {/* Page title */}
      <div className="shimmer" style={{ width: 180, height: 22, borderRadius: 6, marginBottom: 24 }} />

      {/* Stat cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div className="shimmer" style={{ width: 60, height: 11, borderRadius: 4, marginBottom: 10 }} />
            <div className="shimmer" style={{ width: 80, height: 22, borderRadius: 5 }} />
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px', gap: 0, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          {[140, 80, 80, 80, 40].map((w, i) => (
            <div key={i} className="shimmer" style={{ width: w, height: 11, borderRadius: 4 }} />
          ))}
        </div>
        {/* Rows */}
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px', gap: 0, padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="shimmer" style={{ width: `${60 + (i * 17) % 40}%`, height: 13, borderRadius: 4 }} />
            <div className="shimmer" style={{ width: 70, height: 13, borderRadius: 4 }} />
            <div className="shimmer" style={{ width: 55, height: 13, borderRadius: 4 }} />
            <div className="shimmer" style={{ width: 65, height: 13, borderRadius: 4 }} />
            <div className="shimmer" style={{ width: 36, height: 24, borderRadius: 6 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
