export default function Loading() {
  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ marginBottom: 24 }}>
        <div className="shimmer" style={{ width: 130, height: 22, borderRadius: 7, marginBottom: 8 }} />
        <div className="shimmer" style={{ width: 240, height: 13, borderRadius: 5 }} />
      </div>
      <div className="shimmer" style={{ height: 110, borderRadius: 'var(--radius)', marginBottom: 14 }} />
      <div className="shimmer" style={{ height: 240, borderRadius: 'var(--radius)' }} />
    </div>
  );
}
