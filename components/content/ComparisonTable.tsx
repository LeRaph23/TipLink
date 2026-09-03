import type { ComparisonRow } from '@/content/comparatifs';

/**
 * Renders a comparison as a sourced table.
 *
 * Every competitor claim shows the URL it came from and the date it was
 * checked, because French comparative-advertising rules (art. L122-1 s. code
 * de la consommation) require claims to be objective and verifiable. Rendering
 * the source is also what keeps the page honest as competitors change their
 * offering: a stale row is visibly stale.
 */
export function ComparisonTable({
  rows,
  competitor,
}: {
  rows: ComparisonRow[];
  competitor: string;
}) {
  return (
    <div style={{ overflowX: 'auto', margin: '28px 0' }}>
      <table
        style={{
          width: '100%',
          minWidth: 520,
          borderCollapse: 'collapse',
          fontSize: 14.5,
        }}
      >
        <thead>
          <tr>
            {['', 'Digitip', competitor].map((h, i) => (
              <th
                key={i}
                scope="col"
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderBottom: '1.5px solid var(--border-subtle)',
                  fontWeight: 700,
                  color: 'var(--text)',
                  fontSize: 13.5,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.criterion}>
              <th
                scope="row"
                style={{
                  textAlign: 'left',
                  padding: '12px',
                  borderBottom: '1px solid var(--border-subtle)',
                  fontWeight: 650,
                  color: 'var(--text)',
                  verticalAlign: 'top',
                  fontSize: 13.5,
                }}
              >
                {r.criterion}
              </th>
              <td style={cell}>{r.digitip}</td>
              <td style={cell}>
                {r.competitor}
                <a
                  href={r.source}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  title={`Source vérifiée le ${r.verifiedOn}`}
                  style={{
                    marginLeft: 6,
                    fontSize: 11.5,
                    color: 'var(--text-3)',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  [source]
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10, lineHeight: 1.6 }}>
        Informations relevées sur les sites et documentations publiques des éditeurs, aux
        dates indiquées. Les offres évoluent, vérifiez auprès de l&apos;éditeur avant de
        décider.
      </p>
    </div>
  );
}

const cell: React.CSSProperties = {
  padding: '12px',
  borderBottom: '1px solid var(--border-subtle)',
  color: 'var(--text-2)',
  verticalAlign: 'top',
  lineHeight: 1.6,
};
