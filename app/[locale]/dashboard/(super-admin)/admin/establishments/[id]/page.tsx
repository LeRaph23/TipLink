import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { Link } from '@/i18n/navigation';
import { EstablishmentDetailActions } from './EstablishmentDetailActions';

function fmt(cents: number, currency = 'EUR', locale = 'fr') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function fmtDate(iso: string, locale = 'fr') {
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtDatetime(iso: string, locale = 'fr') {
  return new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius)',
  overflow: 'hidden',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--text)',
  padding: '13px 16px',
  borderBottom: '1px solid var(--border-subtle)',
  background: 'var(--surface-2)',
};

const th: React.CSSProperties = {
  padding: '9px 14px',
  textAlign: 'left' as const,
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-3)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.07em',
  borderBottom: '1px solid var(--border)',
  background: 'var(--surface-2)',
  whiteSpace: 'nowrap' as const,
};

const td: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 13,
  borderBottom: '1px solid var(--border-subtle)',
  verticalAlign: 'middle' as const,
};

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{value ?? '—'}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const isComplete = status === 'complete';
  const isPending = status === 'pending';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 100, fontSize: 11, fontWeight: 600,
      background: isComplete ? 'var(--success-bg)' : isPending ? 'var(--warning-bg, #fef9c3)' : 'var(--neutral-bg, var(--surface-2))',
      color: isComplete ? 'var(--success)' : isPending ? 'var(--warning, #a16207)' : 'var(--text-3)',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
      {status ?? '—'}
    </span>
  );
}

export default async function EstablishmentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();

  // ── Core establishment data ─────────────────────────────────────────────
  const { data: est } = await supabase
    .from('establishments')
    .select('*, groups(id, name)')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (!est) notFound();

  const group = est.groups as { id: string; name: string } | null;

  // ── Parallel queries ────────────────────────────────────────────────────
  const [
    { data: staffRows },
    { data: transactions },
    { data: stickers },
    { data: managerRoles },
  ] = await Promise.all([
    supabase
      .from('staff_profiles')
      .select('id, full_name, avatar_url, user_id, onboarding_status, is_active, created_at')
      .eq('establishment_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase
      .from('transactions')
      .select('id, amount, currency, staff_id, status, created_at')
      .eq('establishment_id', id)
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('nfc_stickers')
      .select('id, short_id, batch_label, generated_at')
      .eq('establishment_id', id)
      .order('generated_at', { ascending: false }),
    supabase
      .from('user_roles')
      .select('user_id, created_at')
      .eq('role', 'manager')
      .eq('establishment_id', id),
  ]);

  // ── Fetch manager user emails via service client ────────────────────────
  const managerUserIds = (managerRoles ?? []).map((r) => r.user_id);
  const managerEmails: Map<string, string> = new Map();

  if (managerUserIds.length > 0) {
    try {
      const service = createServiceClient();
      const { data: authData } = await service.auth.admin.listUsers({ page: 1, perPage: 500 });
      const users = authData?.users ?? [];
      for (const u of users) {
        if (managerUserIds.includes(u.id)) {
          managerEmails.set(u.id, u.email ?? u.id);
        }
      }
    } catch {
      // service key may not be configured — silently degrade
    }
  }

  // ── Aggregations ────────────────────────────────────────────────────────
  const txRows = transactions ?? [];
  const totalGmv = txRows.reduce((s, t) => s + (t.amount ?? 0), 0);
  const currency = est.currency ?? 'EUR';

  // eslint-disable-next-line react-hooks/purity -- Server Component: evaluated once per request
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const gmv30d = txRows
    .filter((t) => new Date(t.created_at).getTime() >= thirtyDaysAgo)
    .reduce((s, t) => s + (t.amount ?? 0), 0);

  // Per-staff totals
  const perStaff = new Map<string, number>();
  for (const t of txRows) {
    if (t.staff_id) perStaff.set(t.staff_id, (perStaff.get(t.staff_id) ?? 0) + (t.amount ?? 0));
  }

  const staff = staffRows ?? [];
  const managers = (managerRoles ?? []).map((r) => ({
    userId: r.user_id,
    email: managerEmails.get(r.user_id) ?? r.user_id,
    since: r.created_at,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Back + Header ── */}
      <div>
        <Link
          href="/dashboard/admin/establishments"
          style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 12 }}
        >
          ← Établissements
        </Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' }}>{est.name}</h1>
              <StatusBadge status={est.onboarding_status} />
              <span style={{
                padding: '3px 9px', borderRadius: 100, fontSize: 11, fontWeight: 600,
                background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)',
                textTransform: 'capitalize',
              }}>{est.business_type}</span>
            </div>
            {group && (
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
                Groupe : <Link href={`/dashboard/admin/groups/${group.id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{group.name}</Link>
              </div>
            )}
          </div>
          <EstablishmentDetailActions
            id={id}
            name={est.name}
            address={est.address ?? null}
            businessType={est.business_type ?? null}
            isDemo={est.is_demo ?? false}
          />
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        {[
          { label: 'GMV total', value: fmt(totalGmv, currency, locale) },
          { label: 'GMV 30 jours', value: fmt(gmv30d, currency, locale) },
          { label: 'Transactions', value: String(txRows.length) },
          { label: 'Collègues actifs', value: String(staff.filter((s) => s.is_active).length) },
          { label: 'SmartTags', value: String((stickers ?? []).length) },
          { label: 'Membre depuis', value: fmtDate(est.created_at, locale) },
        ].map(({ label, value }) => (
          <div key={label} style={{
            background: 'var(--surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius)', padding: '14px 16px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Infos & Managers ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Infos générales */}
        <div style={card}>
          <div style={sectionTitle}>Informations générales</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: 16 }}>
            <KV label="Slug" value={<span style={{ fontFamily: 'monospace', fontSize: 12 }}>{est.slug}</span>} />
            <KV label="Pays" value={est.country} />
            <KV label="Devise" value={(est.currency ?? '').toUpperCase()} />
            <KV label="Type" value={<span style={{ textTransform: 'capitalize' }}>{est.business_type}</span>} />
            <KV label="Adresse" value={est.address ?? '—'} />
            <KV label="Stripe account" value={est.stripe_account_id
              ? <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{est.stripe_account_id}</span>
              : <span style={{ color: 'var(--text-3)' }}>Non configuré</span>
            } />
            <KV label="Créé le" value={fmtDatetime(est.created_at, locale)} />
            <KV label="Onboarding" value={<StatusBadge status={est.onboarding_status} />} />
            <KV label="Avis Google" value={est.google_review_url
              ? <a href={est.google_review_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 12, wordBreak: 'break-all' }}>Configuré ↗</a>
              : <span style={{ color: 'var(--text-3)' }}>Non configuré</span>
            } />
            <KV label="Mode démo" value={est.is_demo
              ? <span style={{ color: 'var(--accent)', fontWeight: 700 }}>🧪 Activé (faux paiement)</span>
              : <span style={{ color: 'var(--text-3)' }}>Désactivé</span>
            } />
          </div>
        </div>

        {/* Managers */}
        <div style={card}>
          <div style={sectionTitle}>Chef·fe(s) / Managers ({managers.length})</div>
          {managers.length === 0 ? (
            <div style={{ padding: '24px 16px', color: 'var(--text-3)', fontSize: 13 }}>Aucun manager assigné</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Email</th>
                  <th style={th}>Manager depuis</th>
                </tr>
              </thead>
              <tbody>
                {managers.map((m) => (
                  <tr key={m.userId}>
                    <td style={{ ...td, fontWeight: 500 }}>{m.email}</td>
                    <td style={{ ...td, color: 'var(--text-3)' }}>{fmtDate(m.since, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Staff ── */}
      <div style={card}>
        <div style={sectionTitle}>Collègues / Staff ({staff.length})</div>
        {staff.length === 0 ? (
          <div style={{ padding: '24px 16px', color: 'var(--text-3)', fontSize: 13 }}>Aucun profil staff</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Nom</th>
                  <th style={th}>Statut</th>
                  <th style={th}>Onboarding Stripe</th>
                  <th style={{ ...th, textAlign: 'right' }}>Pourboires reçus</th>
                  <th style={th}>Rejoins le</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id}>
                    <td style={{ ...td, fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {s.avatar_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.avatar_url} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
                        )}
                        {s.full_name}
                      </div>
                    </td>
                    <td style={td}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 600,
                        background: s.is_active ? 'var(--success-bg)' : 'var(--neutral-bg, var(--surface-2))',
                        color: s.is_active ? 'var(--success)' : 'var(--text-3)',
                      }}>
                        {s.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td style={td}><StatusBadge status={s.onboarding_status} /></td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {perStaff.has(s.id) ? fmt(perStaff.get(s.id)!, currency, locale) : '—'}
                    </td>
                    <td style={{ ...td, color: 'var(--text-3)' }}>{fmtDate(s.created_at, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── SmartTags ── */}
      <div style={card}>
        <div style={sectionTitle}>SmartTags assignés ({(stickers ?? []).length})</div>
        {!stickers || stickers.length === 0 ? (
          <div style={{ padding: '24px 16px', color: 'var(--text-3)', fontSize: 13 }}>Aucun SmartTag assigné</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Code (short_id)</th>
                  <th style={th}>Lot</th>
                  <th style={th}>Généré le</th>
                </tr>
              </thead>
              <tbody>
                {stickers.map((s) => (
                  <tr key={s.id}>
                    <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.03em' }}>{s.short_id}</td>
                    <td style={{ ...td, color: 'var(--text-3)' }}>{s.batch_label ?? '—'}</td>
                    <td style={{ ...td, color: 'var(--text-3)' }}>{fmtDatetime(s.generated_at, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Historique transactions ── */}
      <div style={card}>
        <div style={sectionTitle}>Historique des pourboires (200 derniers · succès uniquement)</div>
        {txRows.length === 0 ? (
          <div style={{ padding: '24px 16px', color: 'var(--text-3)', fontSize: 13 }}>Aucune transaction</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Collègue</th>
                  <th style={{ ...th, textAlign: 'right' }}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {txRows.map((t) => {
                  const staffMember = staff.find((s) => s.id === t.staff_id);
                  return (
                    <tr key={t.id}>
                      <td style={{ ...td, color: 'var(--text-3)' }}>{fmtDatetime(t.created_at, locale)}</td>
                      <td style={td}>{staffMember?.full_name ?? <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {fmt(t.amount, currency, locale)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
