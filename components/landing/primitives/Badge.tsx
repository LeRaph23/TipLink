import type React from 'react';

export function Badge({ children, variant = 'accent' }: { children: React.ReactNode; variant?: 'accent' | 'success' | 'warn' }) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    accent: { bg: '#FEF1F4', text: '#E57A97', border: '#FBDAE3' },
    success: { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
    warn: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  };
  const c = colors[variant];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 100, background: c.bg, border: `1px solid ${c.border}`, fontSize: 12, fontWeight: 700, color: c.text, letterSpacing: '0.01em' }}>
      {children}
    </span>
  );
}


