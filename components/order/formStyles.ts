import type { CSSProperties } from 'react';

export const inputStyle = (focused: boolean, error = false): CSSProperties => ({
  width: '100%',
  background: 'var(--surface-2)',
  border: `1.5px solid ${error ? 'var(--error)' : focused ? 'var(--accent)' : 'var(--border)'}`,
  borderRadius: 'var(--radius-sm)',
  padding: '11px 14px',
  color: 'var(--text)',
  fontSize: 14,
  outline: 'none',
  boxShadow: focused && !error ? '0 0 0 3px var(--accent-muted)' : 'none',
  transition: 'border-color 120ms, box-shadow 120ms',
  fontFamily: 'var(--font)',
});

export const labelStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 500,
  color: 'var(--text-2)',
  display: 'block',
  marginBottom: 6,
};

export const errorStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--error)',
  marginTop: 6,
  fontWeight: 500,
};

export const EU_COUNTRIES = ['FR', 'BE', 'IE', 'ES', 'DE', 'IT', 'NL', 'LU', 'PT', 'AT', 'FI', 'GR'];
