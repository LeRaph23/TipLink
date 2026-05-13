'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { isOpenNow, mapsLink as buildMapsLink } from '@/lib/salon-hours';
import type { AmbassadorSalon } from '@/components/salons/SalonsMap';

const SalonsMap = dynamic(
  () => import('@/components/salons/SalonsMap').then((m) => m.SalonsMap),
  { ssr: false, loading: () => (
    <div style={{ height: '60vh', minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13, background: 'var(--surface-2)', borderRadius: 'var(--radius)' }}>
      Chargement de la carte…
    </div>
  ) }
);

type Zone = { id: string; city: string; name: string };
type CurrentClaim = { zoneId: string; zoneName: string; city: string; claimedAt: string };

type Salon = AmbassadorSalon & { website: string | null };

const RATING_LABEL: Record<number, string> = {
  1: 'Peu probable',
  2: 'Possible',
  3: 'Très probable',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const mapsLink = buildMapsLink;

export function AmbassadeurSalonsTracker({ code }: { code: string }) {
  const [loading, setLoading] = useState(true);
  const [currentClaim, setCurrentClaim] = useState<CurrentClaim | null>(null);
  const [availableZones, setAvailableZones] = useState<Zone[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [zoneBbox, setZoneBbox] = useState<{ minLat: number; minLon: number; maxLat: number; maxLon: number } | null>(null);
  const [zoneCity, setZoneCity] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeVisitFor, setActiveVisitFor] = useState<Salon | null>(null);
  const [view, setView] = useState<'map' | 'list'>('map');

  // Persisted view choice (hydration-safe localStorage read).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('tiplink:salons-view');
    if (saved === 'list' || saved === 'map') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setView(saved);
    }
  }, []);
  const onChangeView = useCallback((v: 'map' | 'list') => {
    setView(v);
    if (typeof window !== 'undefined') window.localStorage.setItem('tiplink:salons-view', v);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const zRes = await fetch(`/api/ambassadeur/${encodeURIComponent(code)}/zones`);
      const zData = await zRes.json();
      if (!zRes.ok) {
        setActionError(zData.error ?? 'Erreur');
        setLoading(false);
        return;
      }
      setCurrentClaim(zData.currentClaim);
      setAvailableZones(zData.availableZones ?? []);
      setZoneCity(zData.city ?? null);

      if (zData.currentClaim) {
        const sRes = await fetch(`/api/ambassadeur/${encodeURIComponent(code)}/salons`);
        const sData = await sRes.json();
        if (sRes.ok) {
          setSalons(sData.salons ?? []);
          setZoneBbox(sData.zone?.bbox ?? null);
        }
      } else {
        setSalons([]);
        setZoneBbox(null);
      }
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => { void refresh(); }, [refresh]);

  const triggerRefresh = useCallback(async () => {
    setLoading(true);
    await refresh();
  }, [refresh]);

  const claimZone = async (zoneId: string) => {
    setBusy(true); setActionError(null);
    try {
      const res = await fetch(`/api/ambassadeur/${encodeURIComponent(code)}/zones/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zoneId }),
      });
      const data = await res.json();
      if (!res.ok) setActionError(data.error ?? 'Erreur');
      await triggerRefresh();
    } finally { setBusy(false); }
  };

  const releaseZone = async () => {
    if (!confirm('Libérer cette zone ? Un autre ambassadeur pourra la prendre.')) return;
    setBusy(true); setActionError(null);
    try {
      await fetch(`/api/ambassadeur/${encodeURIComponent(code)}/zones/release`, { method: 'POST' });
      await triggerRefresh();
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <SectionShell title="Salons à démarcher">
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          Chargement…
        </div>
      </SectionShell>
    );
  }

  if (!currentClaim) {
    return (
      <SectionShell title="Salons à démarcher">
        <div style={{ padding: '18px 16px' }}>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.5 }}>
            Choisis une <strong>zone</strong> {zoneCity ? `à ${zoneCity}` : ''} pour voir les salons à démarcher.
            Tant que tu la gardes, aucun autre ambassadeur ne peut y aller — pas de doublons sur le terrain.
          </div>
          {actionError && (
            <div style={{
              background: 'var(--error-bg)', color: 'var(--error)',
              borderRadius: 'var(--radius-sm)', padding: '8px 12px',
              fontSize: 12, marginBottom: 10,
            }}>{actionError}</div>
          )}
          {availableZones.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: 16 }}>
              Aucune zone disponible pour le moment. Reviens plus tard.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {availableZones.map((z) => (
                <button
                  key={z.id}
                  disabled={busy}
                  onClick={() => claimZone(z.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', background: 'var(--surface-2)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    fontSize: 13, color: 'var(--text)', textAlign: 'left',
                  }}
                >
                  <span>
                    <strong>{z.name}</strong>
                    <span style={{ color: 'var(--text-3)', marginLeft: 6, fontSize: 11 }}>· {z.city}</span>
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>Choisir →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </SectionShell>
    );
  }

  const notVisited = salons.filter((s) => !s.visit);
  const visitedByOthers = salons.filter((s) => s.visit && !s.visit.visitedByMe);
  const visitedByMe = salons.filter((s) => s.visit?.visitedByMe);

  return (
    <SectionShell
      title="Salons à démarcher"
      right={
        <button
          onClick={releaseZone}
          disabled={busy}
          style={{
            fontSize: 11, padding: '4px 10px',
            background: 'transparent', color: 'var(--text-3)',
            border: '1px solid var(--border)', borderRadius: 99, cursor: 'pointer',
          }}
        >
          Libérer
        </button>
      }
    >
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Zone réservée
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', marginTop: 2 }}>
          {currentClaim.zoneName}
          <span style={{ color: 'var(--text-3)', fontSize: 12, marginLeft: 6, fontWeight: 500 }}>
            · {currentClaim.city}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>
          <span>📍 {salons.length} salons</span>
          <span>✓ {visitedByMe.length} faits par toi</span>
          <span>🚫 {visitedByOthers.length} déjà faits</span>
        </div>
      </div>

      {actionError && (
        <div style={{
          margin: 12, background: 'var(--error-bg)', color: 'var(--error)',
          borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 12,
        }}>{actionError}</div>
      )}

      {salons.length > 0 && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'center', gap: 4 }}>
          <button
            onClick={() => onChangeView('map')}
            style={{
              padding: '6px 14px', borderRadius: 99,
              background: view === 'map' ? 'var(--accent-muted)' : 'transparent',
              color: view === 'map' ? 'var(--accent)' : 'var(--text-3)',
              border: `1px solid ${view === 'map' ? 'var(--accent-border)' : 'var(--border)'}`,
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >🗺️ Carte</button>
          <button
            onClick={() => onChangeView('list')}
            style={{
              padding: '6px 14px', borderRadius: 99,
              background: view === 'list' ? 'var(--accent-muted)' : 'transparent',
              color: view === 'list' ? 'var(--accent)' : 'var(--text-3)',
              border: `1px solid ${view === 'list' ? 'var(--accent-border)' : 'var(--border)'}`,
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >📋 Liste</button>
        </div>
      )}

      {salons.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
          Aucun salon dans cette zone pour le moment. Préviens l&apos;admin.
        </div>
      ) : view === 'map' ? (
        <div style={{ padding: 12 }}>
          <SalonsMap
            variant="ambassador"
            salons={salons}
            initialBbox={zoneBbox}
            onLogVisit={(s) => setActiveVisitFor(s as Salon)}
          />
        </div>
      ) : (
        <>
          {notVisited.length > 0 && (
            <SubHeading>À faire ({notVisited.length})</SubHeading>
          )}
          {notVisited.map((s) => (
            <SalonRow key={s.id} salon={s} onLogVisit={() => setActiveVisitFor(s)} />
          ))}

          {visitedByMe.length > 0 && <SubHeading>Tes visites ({visitedByMe.length})</SubHeading>}
          {visitedByMe.map((s) => (
            <SalonRow key={s.id} salon={s} onLogVisit={() => setActiveVisitFor(s)} />
          ))}

          {visitedByOthers.length > 0 && (
            <SubHeading>Déjà visités par un autre ambassadeur ({visitedByOthers.length})</SubHeading>
          )}
          {visitedByOthers.map((s) => (
            <SalonRow key={s.id} salon={s} onLogVisit={null} dimmed />
          ))}
        </>
      )}

      {activeVisitFor && (
        <VisitModal
          code={code}
          salon={activeVisitFor}
          onClose={() => setActiveVisitFor(null)}
          onSaved={async () => { setActiveVisitFor(null); await triggerRefresh(); }}
        />
      )}
    </SectionShell>
  );
}

function SectionShell({
  title, right, children,
}: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      marginBottom: 16,
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '10px 16px 6px',
      fontSize: 10, fontWeight: 700, color: 'var(--text-3)',
      textTransform: 'uppercase', letterSpacing: '0.07em',
      background: 'var(--surface-2)',
      borderTop: '1px solid var(--border-subtle)',
      borderBottom: '1px solid var(--border-subtle)',
    }}>{children}</div>
  );
}

function SalonRow({
  salon, onLogVisit, dimmed,
}: { salon: Salon; onLogVisit: (() => void) | null; dimmed?: boolean }) {
  const v = salon.visit;
  const openState = isOpenNow(salon.opening_hours);
  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: '1px solid var(--border-subtle)',
      opacity: dimmed ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{salon.name}</span>
            {openState && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                background: openState.open ? 'var(--success-bg)' : 'var(--error-bg)',
                color: openState.open ? 'var(--success)' : 'var(--error)',
                border: `1px solid ${openState.open ? 'var(--success)' : 'var(--error)'}`,
                whiteSpace: 'nowrap',
              }}>
                {openState.open ? '● Ouvert' : '○ Fermé'}
              </span>
            )}
            {salon.google_rating != null && (
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                ⭐ {salon.google_rating.toFixed(1)}
              </span>
            )}
          </div>
          {openState?.nextChange && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
              {openState.nextChange}
            </div>
          )}
          {salon.address && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
              {salon.address}{salon.postal_code ? ` · ${salon.postal_code}` : ''}
            </div>
          )}
          {v && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, fontSize: 10,
            }}>
              <Pill>{fmtDate(v.lastVisitAt)}</Pill>
              <Pill color={v.bestRating === 3 ? 'success' : v.bestRating === 2 ? 'warning' : 'neutral'}>
                ⭐ {v.bestRating}/3 · {RATING_LABEL[v.bestRating]}
              </Pill>
              {v.flyerLeft && <Pill>🪧 Flyer</Pill>}
              {v.bestConvinced === 'yes' && <Pill color="success">✓ Convaincu</Pill>}
              {v.bestConvinced === 'maybe' && <Pill color="warning">~ Peut-être</Pill>}
            </div>
          )}
          {v?.myNotes && (
            <div style={{
              marginTop: 6, fontSize: 11, color: 'var(--text-2)',
              fontStyle: 'italic',
            }}>« {v.myNotes} »</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          {(salon.lat != null || salon.address) && (
            <a
              href={mapsLink(salon)} target="_blank" rel="noopener noreferrer"
              style={{
                fontSize: 10, padding: '3px 8px',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 99, color: 'var(--text-2)', textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >📍 Maps</a>
          )}
          {salon.phone && (
            <a
              href={`tel:${salon.phone}`}
              style={{
                fontSize: 10, padding: '3px 8px',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 99, color: 'var(--text-2)', textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >☎ Appeler</a>
          )}
          {onLogVisit && (
            <button
              onClick={onLogVisit}
              style={{
                fontSize: 11, padding: '5px 12px',
                background: 'var(--accent)', color: '#fff',
                border: 'none', borderRadius: 99, cursor: 'pointer',
                fontWeight: 600, whiteSpace: 'nowrap',
              }}
            >
              {v?.visitedByMe ? 'Re-visiter' : 'Visiter'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color?: 'success' | 'warning' | 'neutral' }) {
  const styles =
    color === 'success'
      ? { bg: 'var(--success-bg)', fg: 'var(--success)', bd: 'var(--success)' }
    : color === 'warning'
      ? { bg: 'var(--warning-bg)', fg: 'var(--warning)', bd: 'var(--warning)' }
      : { bg: 'var(--surface-2)', fg: 'var(--text-3)', bd: 'var(--border)' };
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 99,
      background: styles.bg, color: styles.fg,
      border: `1px solid ${styles.bd}`, fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function VisitModal({
  code, salon, onClose, onSaved,
}: {
  code: string;
  salon: Salon;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [flyerLeft, setFlyerLeft] = useState(false);
  const [convinced, setConvinced] = useState<'yes' | 'maybe' | 'no'>('no');
  const [rating, setRating] = useState<number>(2);
  const [notes, setNotes] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/ambassadeur/${encodeURIComponent(code)}/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salonId: salon.id, flyerLeft, convinced,
          likelihoodRating: rating,
          notes: notes.trim() || undefined,
          followUpAt: followUpAt || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Erreur');
        return;
      }
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)', zIndex: 100,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)', width: '100%', maxWidth: 480,
          borderTopLeftRadius: 'var(--radius-xl)', borderTopRightRadius: 'var(--radius-xl)',
          padding: '20px 18px 24px', maxHeight: '92dvh', overflowY: 'auto',
        }}
      >
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 99, margin: '0 auto 14px' }} />
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>
          {salon.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>
          {salon.address ?? 'Enregistrer ta visite'}
        </div>

        <Field label="Tu as laissé un flyer ?">
          <div style={{ display: 'flex', gap: 8 }}>
            <Toggle active={!flyerLeft} onClick={() => setFlyerLeft(false)}>Non</Toggle>
            <Toggle active={flyerLeft} onClick={() => setFlyerLeft(true)}>Oui 🪧</Toggle>
          </div>
        </Field>

        <Field label="Convaincu·e de commander ?">
          <div style={{ display: 'flex', gap: 8 }}>
            <Toggle active={convinced === 'no'} onClick={() => setConvinced('no')}>Non</Toggle>
            <Toggle active={convinced === 'maybe'} onClick={() => setConvinced('maybe')}>Peut-être</Toggle>
            <Toggle active={convinced === 'yes'} onClick={() => setConvinced('yes')}>Oui</Toggle>
          </div>
        </Field>

        <Field label="Probabilité de commande">
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3].map((r) => (
              <Toggle key={r} active={rating === r} onClick={() => setRating(r)}>
                {'⭐'.repeat(r)} <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.8 }}>{RATING_LABEL[r]}</span>
              </Toggle>
            ))}
          </div>
        </Field>

        <Field label="Notes (optionnel)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
            rows={3}
            placeholder="Ex: parler à Sophie, repasser jeudi…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 10px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text)',
              fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
            }}
          />
        </Field>

        <Field label="Date de relance (optionnel)">
          <input
            type="date"
            value={followUpAt}
            onChange={(e) => setFollowUpAt(e.target.value)}
            style={{
              padding: '8px 10px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text)',
              fontSize: 13,
            }}
          />
        </Field>

        {error && (
          <div style={{
            background: 'var(--error-bg)', color: 'var(--error)',
            borderRadius: 'var(--radius-sm)', padding: '8px 12px',
            fontSize: 12, marginBottom: 12,
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '12px',
              background: 'var(--surface-2)', color: 'var(--text-2)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >Annuler</button>
          <button
            onClick={save}
            disabled={saving}
            style={{
              flex: 2, padding: '12px',
              background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-sm)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >{saving ? 'Enregistrement…' : 'Enregistrer la visite'}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6,
      }}>{label}</div>
      {children}
    </div>
  );
}

function Toggle({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '9px 8px',
        background: active ? 'var(--accent-muted)' : 'var(--surface-2)',
        color: active ? 'var(--accent)' : 'var(--text-2)',
        border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600,
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >{children}</button>
  );
}
