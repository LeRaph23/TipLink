'use client';

import { useState, useEffect } from 'react';
import { usePathname } from '@/i18n/navigation';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import type { Database } from '@/types/database';

type UserRole = Database['public']['Tables']['user_roles']['Row'];

interface Props {
  userRoles: Pick<UserRole, 'role' | 'group_id' | 'establishment_id'>[];
  userEmail: string;
  userName: string;
  children: React.ReactNode;
}

export function DashboardShell({ userRoles, userEmail, userName, children }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close sidebar whenever the route changes (mobile navigation)
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Mobile backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.48)',
            zIndex: 90, backdropFilter: 'blur(3px)',
          }}
        />
      )}

      {/* Sidebar — becomes fixed overlay on mobile via .dash-sidebar CSS */}
      <div className={`dash-sidebar${open ? ' is-open' : ''}`}>
        <DashboardNav userRoles={userRoles} userEmail={userEmail} userName={userName} />
      </div>

      {/* Main content */}
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', minWidth: 0 }}>
        {/* Mobile top bar */}
        <div className="mob-bar">
          <button className="mob-hamburger" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" />
            </svg>
          </button>
          <span style={{
            fontFamily: 'var(--font-poppins), sans-serif',
            fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', color: '#E57A97',
          }}>
            DigiTip
          </span>
        </div>

        <div className="fade-up dash-main-pad" style={{ padding: '36px 40px', maxWidth: 1080 }}>
          {children}
        </div>
      </main>
    </div>
  );
}
