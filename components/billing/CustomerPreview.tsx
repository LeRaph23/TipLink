/**
 * The two cards a customer gets after paying, at their real size, for the
 * Pro offer. They are what Pro sells and they happen on a stranger's phone,
 * so the offer shows them rather than describing them. Same look as the tip
 * success page (ReviewInvite, ComplimentForm), without a phone drawn around
 * them: the frame added nothing but decoration.
 *
 * Decorative: the text beside it says the same thing.
 */
export function CustomerPreview({
  labels,
}: {
  /** Already interpolated with the example name. */
  labels: {
    reviewTitle: string;
    reviewBody: string;
    reviewButton: string;
    complimentTitle: string;
    chips: [string, string, string];
  };
}) {
  const box: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border-subtle)',
    borderRadius: 12, padding: 14,
  };
  return (
    <div aria-hidden="true" style={{ display: 'grid', gap: 8, maxWidth: 320, userSelect: 'none' }}>
      <div style={box}>
        <div style={{ color: '#F2A93B', fontSize: 13, letterSpacing: 2 }}>★★★★★</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '4px 0 2px' }}>{labels.reviewTitle}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 10 }}>{labels.reviewBody}</div>
        <div style={{
          background: 'var(--accent)', color: 'var(--accent-fg)', borderRadius: 8,
          fontSize: 13, fontWeight: 600, textAlign: 'center', padding: '9px 0',
        }}>
          {labels.reviewButton}
        </div>
      </div>
      <div style={box}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>{labels.complimentTitle}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {labels.chips.map((c, i) => (
            <span key={c} style={{
              fontSize: 12.5, padding: '5px 10px', borderRadius: 100,
              border: `1px solid ${i === 1 ? 'var(--accent)' : 'var(--border)'}`,
              color: i === 1 ? 'var(--accent)' : 'var(--text-2)',
            }}>
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
