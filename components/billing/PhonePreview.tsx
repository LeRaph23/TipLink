/**
 * What the customer sees after tipping, drawn small, for the Pro offer.
 *
 * The features Pro sells happen on a stranger's phone, after the manager has
 * left the room. The offer used to describe them in three sentences; this
 * shows them. A drawing rather than a screenshot so it follows the theme and
 * the language, and never goes stale when the real page changes colour.
 *
 * Decorative: everything it says is also said in the text beside it.
 */
export function PhonePreview({
  labels,
}: {
  /** Already interpolated with the example name. */
  labels: {
    thanks: string;
    reviewTitle: string;
    reviewButton: string;
    complimentTitle: string;
    chips: [string, string, string];
  };
}) {
  return (
    <div aria-hidden="true" style={{
      width: 210, flexShrink: 0, borderRadius: 30, padding: 7,
      background: 'var(--text)', boxShadow: '0 18px 40px -18px rgba(0,0,0,0.45)',
    }}>
      <div style={{
        borderRadius: 24, overflow: 'hidden', background: 'var(--bg, var(--surface-2))',
        fontFamily: 'var(--font)', userSelect: 'none',
      }}>
        <div style={{
          background: 'linear-gradient(160deg, #E57A97, #EC97B0)', color: '#fff',
          padding: '22px 14px 26px', textAlign: 'center',
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', margin: '0 auto 8px',
            background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700,
          }}>
            ✓
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{labels.thanks}</div>
        </div>

        <div style={{ padding: 9, marginTop: -14, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 7, position: 'relative' }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 12, padding: '10px 10px 11px',
          }}>
            <div style={{ color: '#F2A93B', fontSize: 11, letterSpacing: 1 }}>★★★★★</div>
            <div style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--text)', margin: '3px 0 8px', lineHeight: 1.3 }}>
              {labels.reviewTitle}
            </div>
            <div style={{
              background: 'var(--accent)', color: 'var(--accent-fg)', borderRadius: 8,
              fontSize: 10.5, fontWeight: 700, textAlign: 'center', padding: '7px 0',
            }}>
              {labels.reviewButton}
            </div>
          </div>

          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 12, padding: '10px 10px 11px',
          }}>
            <div style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--text)', marginBottom: 7, lineHeight: 1.3 }}>
              {labels.complimentTitle}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {labels.chips.map((c, i) => (
                <span key={c} style={{
                  fontSize: 9.5, padding: '3px 7px', borderRadius: 100,
                  border: `1px solid ${i === 0 ? 'var(--accent)' : 'var(--border)'}`,
                  color: i === 0 ? 'var(--accent)' : 'var(--text-2)',
                  background: i === 0 ? 'var(--accent-muted)' : 'transparent',
                }}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
