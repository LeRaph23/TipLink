'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/types/database';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/dashboard/ThemeToggle';

type UserRole = Database['public']['Tables']['user_roles']['Row'];

interface Props {
  userRoles: Pick<UserRole, 'role' | 'group_id' | 'establishment_id'>[];
  userEmail: string;
  userName: string;
  hasStaffProfile?: boolean;
}


function HomeIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6.5L8 2l6 4.5V14a1 1 0 01-1 1H3a1 1 0 01-1-1V6.5z" /><path d="M6 15V9h4v6" /></svg>;
}
function TxIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5h12M2 8h8M2 11h5" /><path d="M11 10l2 2 2-2" /><path d="M13 12V7" /></svg>;
}
function PayoutIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="14" height="9" rx="1.5" /><path d="M1 7h14" /><circle cx="5" cy="11" r="1" fill="currentColor" stroke="none" /></svg>;
}
function StaffIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="5" r="3" /><path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" /></svg>;
}
function NfcIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v10M5 5.5C3.8 6.7 3.8 9.3 5 10.5M11 5.5c1.2 1.2 1.2 3.8 0 5M2.5 3C.5 5 .5 11 2.5 13M13.5 3C15.5 5 15.5 11 13.5 13" /></svg>;
}
function EstIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 15V6l6-4 6 4v9" /><path d="M6 15v-4h4v4" /><path d="M2 6h12" /></svg>;
}
function GroupIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="5" r="2.5" /><circle cx="11" cy="5" r="2.5" /><path d="M0 13.5c0-2.485 2.239-4 5-4" /><path d="M11 9.5c2.761 0 5 1.515 5 4" /><path d="M8 14c0-2.485 1.343-4 3-4s3 1.515 3 4" /></svg>
  );
}
function SearchIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="4.5" /><path d="M14 14l-3-3" /></svg>;
}
function UsersIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="6" cy="4.5" r="2.2" /><path d="M1 14c0-2.8 2.2-4 5-4s5 1.2 5 4" /><circle cx="11.5" cy="5" r="1.8" /><path d="M14 14v-.5c0-1.5-1-2.5-2.8-2.5" /></svg>;
}
function BoltIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M9.5 1L4 9h4l-1.5 6L12 7H8L9.5 1z" /></svg>;
}
function ListIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 4h12M2 8h8M2 12h10" /></svg>;
}
function CardIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="1.5" y="3" width="13" height="10" rx="1.5" /><path d="M1.5 6.5h13" /></svg>;
}

function NavLink({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <Link
      href={href}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '7px 10px', borderRadius: 8, textDecoration: 'none',
        background: active ? 'var(--accent-muted)' : hov ? 'var(--surface-2)' : 'transparent',
        color: active ? 'var(--accent)' : hov ? 'var(--text)' : 'var(--text-2)',
        fontSize: 13.5, fontWeight: active ? 600 : 500,
        letterSpacing: '-0.01em', width: '100%',
        transition: 'all 120ms',
      }}
    >
      <span style={{ color: active ? 'var(--accent)' : 'currentColor', flexShrink: 0 }}>{icon}</span>
      {label}
    </Link>
  );
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const palette = ['#E57A97', '#EC97B0', '#ec4899', '#14b8a6', '#f59e0b', '#3b82f6'];
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  const initials = name.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: palette[idx], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 700, color: '#fff', flexShrink: 0, letterSpacing: '-0.02em', userSelect: 'none' }}>
      {initials}
    </div>
  );
}

export function DashboardNav({ userRoles, userEmail, userName, hasStaffProfile = false }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const tn = useTranslations('dashboard.nav');
  const td = useTranslations('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const hasRole = (role: UserRole['role']) => userRoles.some(r => r.role === role);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const ta = useTranslations('dashboard.admin.nav');

  const links = [
    { href: '/dashboard',               label: tn('overview'),     icon: <HomeIcon />,   always: true },
    { href: '/dashboard/transactions',  label: tn('transactions'), icon: <TxIcon />,     always: true },
    { href: '/dashboard/banking',       label: 'Virements',        icon: <PayoutIcon />, roles: ['staff', 'group_admin'] as UserRole['role'][] },
    { href: '/dashboard/billing',       label: tn('billing'),      icon: <PayoutIcon />, roles: ['group_admin', 'super_admin'] as UserRole['role'][] },
    { href: '/dashboard/staff',         label: tn('staff'),        icon: <StaffIcon />,  roles: ['manager', 'group_admin', 'super_admin'] as UserRole['role'][] },
    { href: '/dashboard/establishments', label: tn('establishments'), icon: <EstIcon />, roles: ['manager', 'group_admin', 'super_admin'] as UserRole['role'][] },
    { href: '/dashboard/stickers',      label: tn('stickers'),     icon: <NfcIcon />,    roles: ['manager', 'group_admin'] as UserRole['role'][] },
    { href: '/dashboard/analytics',     label: td('analytics.nav'),icon: <TxIcon />,     roles: ['manager', 'group_admin', 'super_admin'] as UserRole['role'][] },
    { href: '/dashboard/settings',      label: tn('settings'),     icon: <StaffIcon />,  roles: ['group_admin', 'super_admin'] as UserRole['role'][] },
  ];

  const adminLinks = [
    { href: '/dashboard/admin',                 label: ta('overview'),     icon: <HomeIcon /> },
    { href: '/dashboard/admin/search',        label: ta('search'),       icon: <SearchIcon /> },
    { href: '/dashboard/admin/users',         label: ta('users'),        icon: <UsersIcon /> },
    { href: '/dashboard/admin/webhooks',      label: ta('webhooks'),    icon: <BoltIcon /> },
    { href: '/dashboard/admin/audit',         label: ta('audit'),       icon: <ListIcon /> },
    { href: '/dashboard/admin/stripe',        label: ta('stripe'),      icon: <CardIcon /> },
    { href: '/dashboard/admin/smarttags',     label: ta('smarttags'),   icon: <NfcIcon /> },
    { href: '/dashboard/admin/orders',         label: ta('orders'),      icon: <PayoutIcon /> },
    { href: '/dashboard/admin/transactions',   label: ta('transactions'), icon: <TxIcon /> },
    { href: '/dashboard/admin/establishments', label: ta('establishments'), icon: <EstIcon /> },
    { href: '/dashboard/admin/groups',         label: ta('groups'),      icon: <GroupIcon /> },
  ];

  const visibleLinks = links.filter(l =>
    l.always ||
    (l.roles && l.roles.some(r => hasRole(r)))
  );
  const isSuperAdmin = hasRole('super_admin');

  const displayName = userName || userEmail;
  const topRole = userRoles[0]?.role?.replace('_', ' ') ?? 'staff';

  return (
    <aside style={{
      width: 'var(--sidebar-w)', flexShrink: 0, height: '100vh',
      background: 'var(--bg-subtle)', borderRight: '1px solid var(--border-subtle)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      position: 'sticky', top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 9 }}>
        <span style={{ fontFamily: 'var(--font-poppins), sans-serif', fontWeight: 800, fontSize: 16, letterSpacing: '-0.03em', color: '#E57A97' }}>DigiTip</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ThemeToggle />
          <LanguageSwitcher compact />
        </div>
      </div>

      {/* Nav links */}
      <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' }}>
        {isSuperAdmin ? (
          adminLinks.map(l => (
            <NavLink
              key={l.href} href={l.href} icon={l.icon} label={l.label}
              active={l.href === '/dashboard/admin' ? pathname === '/dashboard/admin' : pathname.startsWith(l.href)}
            />
          ))
        ) : (
          visibleLinks.map(l => (
            <NavLink
              key={l.href} href={l.href} icon={l.icon} label={l.label}
              active={l.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(l.href)}
            />
          ))
        )}
      </nav>

      {/* User footer */}
      <div style={{ padding: 8, borderTop: '1px solid var(--border-subtle)', position: 'relative' }} ref={menuRef}>
        <button
          onClick={() => setMenuOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 9,
            padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
            background: menuOpen ? 'var(--surface-2)' : 'transparent', textAlign: 'left',
            transition: 'background 120ms',
          }}
          onMouseEnter={e => { if (!menuOpen) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)'; }}
          onMouseLeave={e => { if (!menuOpen) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
          <Avatar name={displayName} size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'capitalize' }}>{topRole}</div>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--text-3)" strokeWidth="1.7" strokeLinecap="round" style={{ transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 180ms', flexShrink: 0 }}>
            <path d="M2 4l4 4 4-4" />
          </svg>
        </button>

        {menuOpen && (
          <div className="scale-in" style={{
            position: 'absolute', bottom: '100%', left: 8, right: 8, marginBottom: 4,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: 6,
            boxShadow: 'var(--shadow-lg)', zIndex: 50,
          }}>
            <button
              onClick={handleSignOut}
              style={{
                display: 'block', width: '100%', padding: '7px 8px', borderRadius: 6,
                background: 'transparent', color: 'var(--error)', border: 'none',
                cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: 'var(--font)',
              }}
            >
              {tn('signOut')}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
