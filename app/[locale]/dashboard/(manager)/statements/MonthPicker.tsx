'use client';

import { useRouter, usePathname } from '@/i18n/navigation';

// Native select that navigates on change — no separate submit button, large
// touch target, works great on mobile.
export function MonthPicker({
  value,
  months,
  label,
}: {
  value: string;
  months: { value: string; label: string }[];
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-3)' }}>
      <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
      <select
        value={value}
        onChange={(e) => router.push(`${pathname}?month=${e.target.value}`)}
        style={{
          padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)',
          background: 'var(--surface)', color: 'var(--text)', fontSize: 14,
          fontFamily: 'var(--font)', minHeight: 44, cursor: 'pointer', flex: 1,
        }}
      >
        {months.map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
    </label>
  );
}
