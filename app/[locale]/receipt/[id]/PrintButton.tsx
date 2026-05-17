'use client';

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="receipt-print-hide"
      style={{
        padding: '10px 20px', borderRadius: 10, border: 'none',
        background: '#E57A97', color: '#fff', fontSize: 14, fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}
