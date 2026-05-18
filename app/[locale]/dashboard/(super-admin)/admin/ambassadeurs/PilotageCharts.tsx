'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export interface WeeklyPoint {
  label: string;
  ventes: number;
  commission: number;
}

export interface TopPoint {
  name: string;
  count: number;
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: 18,
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{title}</h3>
      {sub && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '3px 0 0' }}>{sub}</p>}
      <div style={{ marginTop: 14 }}>{children}</div>
    </section>
  );
}

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--text)',
};

export function PilotageCharts({
  weekly,
  topAmbassadors,
}: {
  weekly: WeeklyPoint[];
  topAmbassadors: TopPoint[];
}) {
  const hasWeekly = weekly.some((w) => w.ventes > 0);
  const hasTop = topAmbassadors.length > 0;
  const maxTop = Math.max(1, ...topAmbassadors.map((t) => t.count));

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      gap: 16, marginBottom: 28,
    }}>
      <Panel title="Ventes par semaine" sub="10 dernières semaines (ventes valides)">
        {hasWeekly ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weekly} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-3)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
              <Bar dataKey="ventes" name="Ventes" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty>Aucune vente sur la période.</Empty>
        )}
      </Panel>

      <Panel title="Top ambassadeurs" sub="Classement de la période en cours">
        {hasTop ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {topAmbassadors.map((t, i) => (
              <div key={t.name + i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)', width: 18, flexShrink: 0, textAlign: 'right' }}>
                  {i + 1}
                </span>
                <span style={{
                  fontSize: 12.5, color: 'var(--text)', width: 110, flexShrink: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontWeight: i === 0 ? 700 : 500,
                }}>
                  {t.name}
                </span>
                <div style={{ flex: 1, height: 18, background: 'var(--surface-2)', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.max(6, (t.count / maxTop) * 100)}%`,
                    background: i === 0 ? 'var(--accent)' : 'var(--accent-muted)',
                    borderRadius: 5,
                  }} />
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', width: 22, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {t.count}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty>Aucune vente sur la période.</Empty>
        )}
      </Panel>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-3)', fontSize: 13,
    }}>
      {children}
    </div>
  );
}
