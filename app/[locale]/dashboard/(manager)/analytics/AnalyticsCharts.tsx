'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';

type Props = {
  daily: { date: string; total: number }[];
  topStaff: { name: string; total: number }[];
  currency: string;
  locale: string;
  labels: {
    revenue: string;
    topStaff: string;
    noData: string;
    date: string;
    amount: string;
  };
};

export function AnalyticsCharts({ daily, topStaff, currency, locale, labels }: Props) {
  const fmt = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });

  const hasData = daily.some((d) => d.total > 0);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 20 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
          {labels.revenue}
        </h2>
        {!hasData ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{labels.noData}</div>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={daily} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => new Date(v).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                  style={{ fontSize: 11 }}
                  stroke="var(--text-3)"
                />
                <YAxis
                  tickFormatter={(v) => fmt.format(v)}
                  style={{ fontSize: 11 }}
                  stroke="var(--text-3)"
                />
                <Tooltip
                  formatter={(v) => fmt.format(Number(v ?? 0))}
                  labelFormatter={(v) => new Date(String(v)).toLocaleDateString(locale, { day: 'numeric', month: 'long' })}
                  contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                />
                <Line type="monotone" dataKey="total" stroke="#E57A97" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', padding: 20 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
          {labels.topStaff}
        </h2>
        {topStaff.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{labels.noData}</div>
        ) : (
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={topStaff} layout="vertical" margin={{ top: 4, right: 16, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis type="number" tickFormatter={(v) => fmt.format(v)} style={{ fontSize: 11 }} stroke="var(--text-3)" />
                <YAxis type="category" dataKey="name" style={{ fontSize: 11 }} stroke="var(--text-3)" width={120} />
                <Tooltip
                  formatter={(v) => fmt.format(Number(v ?? 0))}
                  contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="total" fill="#EC97B0" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
