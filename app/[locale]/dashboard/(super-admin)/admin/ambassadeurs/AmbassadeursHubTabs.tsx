'use client';

import { useState } from 'react';
import { Link, usePathname } from '@/i18n/navigation';

const BASE = '/dashboard/admin/ambassadeurs';

const TABS = [
  { key: 'pilotage',       label: 'Pilotage',       href: BASE },
  { key: 'equipe',         label: 'Équipe',         href: `${BASE}/equipe` },
  { key: 'recrutement',    label: 'Recrutement',    href: `${BASE}/recrutement` },
  { key: 'terrain',        label: 'Terrain',        href: `${BASE}/terrain` },
  { key: 'communications', label: 'Communications', href: `${BASE}/communications` },
] as const;

const NAMED_SEGMENTS = ['equipe', 'recrutement', 'terrain', 'communications'];

/** Resolve which tab a pathname belongs to — the per-ambassador fiche
 *  (`/ambassadeurs/<uuid>`) is a drill-down of Équipe, so it lights that tab. */
function activeKey(pathname: string): string {
  if (pathname === BASE) return 'pilotage';
  const rest = pathname.startsWith(`${BASE}/`) ? pathname.slice(BASE.length + 1) : '';
  const seg = rest.split('/')[0];
  if (NAMED_SEGMENTS.includes(seg)) return seg;
  return seg ? 'equipe' : 'pilotage';
}

function Tab({ label, href, active }: { label: string; href: string; active: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <Link
      href={href}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '9px 16px',
        textDecoration: 'none',
        borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
        color: active ? 'var(--accent)' : hov ? 'var(--text)' : 'var(--text-3)',
        fontSize: 13.5,
        fontWeight: active ? 700 : 500,
        whiteSpace: 'nowrap',
        marginBottom: -1,
        transition: 'color 120ms',
      }}
    >
      {label}
    </Link>
  );
}

export function AmbassadeursHubTabs() {
  const pathname = usePathname();
  const active = activeKey(pathname);
  return (
    <div className="dash-tabs" style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
      {TABS.map((t) => (
        <Tab key={t.key} label={t.label} href={t.href} active={active === t.key} />
      ))}
    </div>
  );
}
