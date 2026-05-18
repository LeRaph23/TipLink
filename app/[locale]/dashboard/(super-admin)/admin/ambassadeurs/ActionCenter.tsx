import { Link } from '@/i18n/navigation';

export interface ActionCounts {
  payouts: number;
  bonuses: number;
  referrals: number;
  applications: number;
}

interface ActionItem {
  label: string;
  hint: string;
  count: number;
  href: string;
  external: boolean;
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}

function Row({ item, last }: { item: ActionItem; last: boolean }) {
  const has = item.count > 0;
  const inner = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px',
      borderBottom: last ? undefined : '1px solid var(--border-subtle)',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
        background: has ? 'var(--accent)' : 'var(--surface-2)',
        color: has ? '#fff' : 'var(--text-3)',
      }}>
        {item.count}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{item.label}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{item.hint}</div>
      </div>
      {has && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 12, fontWeight: 600, color: 'var(--accent)', flexShrink: 0,
        }}>
          Traiter <Chevron />
        </span>
      )}
    </div>
  );
  if (!has) return inner;
  return item.external ? (
    <Link href={item.href} style={{ textDecoration: 'none', display: 'block' }}>{inner}</Link>
  ) : (
    <a href={item.href} style={{ textDecoration: 'none', display: 'block' }}>{inner}</a>
  );
}

/** "À traiter" — a single inbox of everything that needs a super-admin
 *  decision, with a jump link to where the action lives. */
export function ActionCenter({ counts }: { counts: ActionCounts }) {
  const items: ActionItem[] = [
    { label: 'Virements en attente', hint: 'Demandes de retrait à payer ou refuser', count: counts.payouts, href: '#payouts', external: false },
    { label: 'Bonus à créditer', hint: 'Paliers hebdo & défis à valider', count: counts.bonuses, href: '#bonuses', external: false },
    { label: 'Primes de parrainage', hint: 'Récompenses parrain à créditer', count: counts.referrals, href: '/dashboard/admin/ambassadeurs/recrutement', external: true },
    { label: 'Candidatures', hint: 'Formulaires de recrutement à examiner', count: counts.applications, href: '/dashboard/admin/ambassadeurs/recrutement', external: true },
  ];
  const total = items.reduce((s, i) => s + i.count, 0);

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
          À traiter
        </h2>
        <span style={{ fontSize: 12, color: total > 0 ? 'var(--accent)' : 'var(--text-3)', fontWeight: 600 }}>
          {total > 0 ? `${total} action${total > 1 ? 's' : ''} en attente` : 'Rien à traiter'}
        </span>
      </div>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', overflow: 'hidden',
      }}>
        {items.map((item, i) => (
          <Row key={item.label} item={item} last={i === items.length - 1} />
        ))}
      </div>
    </section>
  );
}
