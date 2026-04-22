'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { Database } from '@/types/database';

type UserRole = Database['public']['Tables']['user_roles']['Row'];

interface Props {
  userRoles: Pick<UserRole, 'role' | 'group_id' | 'establishment_id'>[];
  userEmail: string;
}

export function DashboardNav({ userRoles, userEmail }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const hasRole = (role: UserRole['role']) => userRoles.some((r) => r.role === role);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const links = [
    { href: '/dashboard', label: 'Home', always: true },
    { href: '/dashboard/transactions', label: 'Transactions', always: true },
    { href: '/dashboard/onboarding', label: 'Payouts', roles: ['staff'] as UserRole['role'][] },
    { href: '/dashboard/staff', label: 'Staff', roles: ['manager', 'group_admin', 'super_admin'] as UserRole['role'][] },
    { href: '/dashboard/stickers', label: 'NFC Stickers', roles: ['manager', 'group_admin', 'super_admin'] as UserRole['role'][] },
    { href: '/dashboard/establishments', label: 'Establishments', roles: ['group_admin', 'super_admin'] as UserRole['role'][] },
    { href: '/dashboard/groups', label: 'Groups', roles: ['super_admin'] as UserRole['role'][] },
  ];

  const visibleLinks = links.filter(
    (l) => l.always || (l.roles && l.roles.some((r) => hasRole(r)))
  );

  return (
    <nav className="border-b bg-background sticky top-0 z-40">
      <div className="container mx-auto px-4 max-w-5xl flex items-center gap-6 h-14">
        <Link href="/dashboard" className="font-bold text-lg">
          TipLink
        </Link>
        <div className="flex items-center gap-4 text-sm flex-1">
          {visibleLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={[
                'transition-colors',
                pathname === l.href
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground hidden sm:inline">{userEmail}</span>
          <button
            onClick={handleSignOut}
            className="text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
