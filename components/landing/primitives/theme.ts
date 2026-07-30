// Shared landing tokens. Extracted verbatim from LandingPage.tsx so segment
// pages can reuse the same surface without importing the whole page.
import type React from 'react';

export const LIGHT: React.CSSProperties = {
  '--lbg': '#f9f9f7',
  '--lsurface': '#ffffff',
  '--ltext': '#111118',
  '--ltext-2': '#3a3b4f',
  '--lmuted': '#74748a',
  '--laccent': '#E57A97',
  '--lborder': '#e4e4ec',
  '--lsuccess': '#16a34a',
  '--lwarn': '#d97706',
} as React.CSSProperties;

// ─── Utils ────────────────────────────────────────────────────────────────────

