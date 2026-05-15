export default function Loading() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div className="shimmer" style={{ width: 160, height: 22, borderRadius: 7, marginBottom: 8 }} />
        <div className="shimmer" style={{ width: 230, height: 13, borderRadius: 5 }} />
      </div>
      <div className="shimmer" style={{ height: 300, borderRadius: 'var(--radius)', marginBottom: 16 }} />
      <div className="shimmer" style={{ height: 300, borderRadius: 'var(--radius)' }} />
    </div>
  );
}
