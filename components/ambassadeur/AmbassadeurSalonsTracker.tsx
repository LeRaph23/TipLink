'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { isOpenNow, mapsLink as buildMapsLink } from '@/lib/salon-hours';
import { CategoryIcon, type AmbassadorSalon } from '@/components/salons/SalonsMap';
import { Card, SectionHeader, Button, Badge, Modal, Field, Textarea, Input, EmptyState, FONT, WEIGHT, SPACE } from './ui';
import { Icon, type IconName } from './icons';

const SalonsMap = dynamic(
  () => import('@/components/salons/SalonsMap').then((m) => m.SalonsMap),
  { ssr: false, loading: () => (
    <div style={{ height: '60vh', minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: FONT.body, background: 'var(--surface-2)', borderRadius: 'var(--radius)' }}>
      Chargement de la carte…
    </div>
  ) }
);

type Bbox = { minLat: number; minLon: number; maxLat: number; maxLon: number };

type Salon = AmbassadorSalon & { website: string | null };

type GeoFix = { lat: number; lon: number; accuracy: number };
type GeoStatus = 'locating' | 'ok' | 'denied' | 'unavailable';

const RATING_LABEL: Record<number, string> = {
  1: 'Peu probable',
  2: 'Possible',
  3: 'Très probable',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const mapsLink = buildMapsLink;

// Map/list preference persisted per screen (hydration-safe localStorage read).
function usePersistedView(key: string): ['map' | 'list', (v: 'map' | 'list') => void] {
  const [view, setView] = useState<'map' | 'list'>('map');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(key);
    if (saved === 'list' || saved === 'map') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setView(saved);
    }
  }, [key]);
  const change = useCallback((v: 'map' | 'list') => {
    setView(v);
    if (typeof window !== 'undefined') window.localStorage.setItem(key, v);
  }, [key]);
  return [view, change];
}

function TrackerCard({ children }: { children: ReactNode }) {
  return (
    <Card padded={false}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <SectionHeader title="Établissements à démarcher" icon={<Icon name="location" size={14} />} />
      </div>
      {children}
    </Card>
  );
}

export function AmbassadeurSalonsTracker({ code }: { code: string }) {
  const [loading, setLoading] = useState(true);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [city, setCity] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeVisitFor, setActiveVisitFor] = useState<Salon | null>(null);
  const [view, onChangeView] = usePersistedView('tiplink:salons-view');

  const loadSalons = useCallback(async () => {
    try {
      const res = await fetch(`/api/ambassadeur/${encodeURIComponent(code)}/salons`);
      const data = await res.json();
      if (res.ok) {
        setActionError(null);
        setSalons(data.salons ?? []);
        setCity(data.city ?? null);
      } else {
        setActionError(data.error ?? 'Erreur');
      }
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => { void loadSalons(); }, [loadSalons]);

  // Fit the map to the salons that actually have coordinates.
  const salonsBbox = useMemo<Bbox | null>(() => {
    const pts = salons.filter((s) => s.lat != null && s.lon != null);
    if (pts.length === 0) return null;
    let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
    for (const s of pts) {
      minLat = Math.min(minLat, s.lat as number);
      maxLat = Math.max(maxLat, s.lat as number);
      minLon = Math.min(minLon, s.lon as number);
      maxLon = Math.max(maxLon, s.lon as number);
    }
    return { minLat, minLon, maxLat, maxLon };
  }, [salons]);

  if (loading) {
    return (
      <TrackerCard>
        <EmptyState>Chargement…</EmptyState>
      </TrackerCard>
    );
  }

  const notVisited = salons.filter((s) => !s.visit);
  const visitedByOthers = salons.filter((s) => s.visit && !s.visit.visitedByMe);
  const visitedByMe = salons.filter((s) => s.visit?.visitedByMe);

  return (
    <TrackerCard>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        {city && (
          <>
            <div style={{ fontSize: FONT.label, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Secteur
            </div>
            <div style={{ fontSize: FONT.bodyLg, fontWeight: WEIGHT.bold, color: 'var(--accent)', marginTop: 2 }}>
              {city}
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: SPACE.md, marginTop: city ? SPACE.sm : 0, fontSize: FONT.label, color: 'var(--text-3)', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="location" size={13} /> {salons.length} établissements
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="check" size={13} /> {visitedByMe.length} faits par toi
          </span>
        </div>
      </div>

      {actionError && (
        <div style={{
          margin: SPACE.md, background: 'var(--error-bg)', color: 'var(--error)',
          borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: FONT.body - 1,
        }}>{actionError}</div>
      )}

      {salons.length === 0 ? (
        <EmptyState>
          Aucun établissement à démarcher pour le moment. Reviens plus tard ou préviens l&apos;admin.
        </EmptyState>
      ) : (
        <>
          <ViewToggle view={view} onChange={onChangeView} />

          {view === 'map' ? (
            <div style={{ padding: SPACE.md }}>
              <SalonsMap
                variant="ambassador"
                salons={salons}
                initialBbox={salonsBbox}
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
        </>
      )}

      {activeVisitFor && (
        <VisitModal
          code={code}
          salon={activeVisitFor}
          onClose={() => setActiveVisitFor(null)}
          onSaved={async () => {
            setActiveVisitFor(null);
            await loadSalons();
          }}
        />
      )}
    </TrackerCard>
  );
}

function ViewToggle({ view, onChange }: { view: 'map' | 'list'; onChange: (v: 'map' | 'list') => void }) {
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'center', gap: SPACE.xs }}>
      {(['map', 'list'] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          style={{
            minHeight: 36, padding: '7px 16px', borderRadius: 999,
            background: view === v ? 'var(--accent-muted)' : 'transparent',
            color: view === v ? 'var(--accent)' : 'var(--text-3)',
            border: `1px solid ${view === v ? 'var(--accent-border)' : 'var(--border)'}`,
            fontSize: FONT.body - 1, fontWeight: WEIGHT.bold, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {v === 'map' ? 'Carte' : 'Liste'}
        </button>
      ))}
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '10px 16px 6px',
      fontSize: FONT.micro, fontWeight: WEIGHT.bold, color: 'var(--text-3)',
      textTransform: 'uppercase', letterSpacing: '0.07em',
      background: 'var(--surface-2)',
      borderTop: '1px solid var(--border-subtle)',
      borderBottom: '1px solid var(--border-subtle)',
    }}>{children}</div>
  );
}

const rowLinkStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  minHeight: 38, padding: '7px 10px',
  fontSize: FONT.micro + 1, fontWeight: WEIGHT.semibold,
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-2)',
  textDecoration: 'none', whiteSpace: 'nowrap',
};

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE.sm }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <CategoryIcon category={salon.category} size={14} color="var(--text-3)" strokeWidth={2.2} />
              <span style={{ fontSize: FONT.body + 1, fontWeight: WEIGHT.bold, color: 'var(--text)' }}>{salon.name}</span>
            </span>
            {salon.converted && <Badge tone="accent">Client</Badge>}
            {openState && (
              <Badge tone={openState.open ? 'success' : 'error'}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                {openState.open ? 'Ouvert' : 'Fermé'}
              </Badge>
            )}
          </div>
          {openState?.nextChange && (
            <div style={{ fontSize: FONT.micro, color: 'var(--text-3)', marginTop: 2 }}>
              {openState.nextChange}
            </div>
          )}
          {salon.address && (
            <div style={{ fontSize: FONT.label, color: 'var(--text-3)', marginTop: 2 }}>
              {salon.address}{salon.postal_code ? ` · ${salon.postal_code}` : ''}
            </div>
          )}
          {v && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              <Badge tone="neutral" caps={false}>{fmtDate(v.lastVisitAt)}</Badge>
              <Badge
                tone={v.bestRating === 3 ? 'success' : v.bestRating === 2 ? 'warning' : 'neutral'}
                caps={false}
              >
                <Icon name="star" size={10} /> {v.bestRating}/3 · {RATING_LABEL[v.bestRating]}
              </Badge>
              {v.flyerLeft && <Badge tone="neutral"><Icon name="flag" size={10} /> Flyer</Badge>}
              {v.bestConvinced === 'yes' && <Badge tone="success"><Icon name="check" size={10} /> Convaincu</Badge>}
              {v.bestConvinced === 'maybe' && <Badge tone="warning">Peut-être</Badge>}
            </div>
          )}
          {v?.myNotes && (
            <div style={{ marginTop: 6, fontSize: FONT.label, color: 'var(--text-2)', fontStyle: 'italic' }}>
              « {v.myNotes} »
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          {(salon.lat != null || salon.address) && (
            <a href={mapsLink(salon)} target="_blank" rel="noopener noreferrer" style={rowLinkStyle}>
              <Icon name="location" size={13} /> Maps
            </a>
          )}
          {salon.phone && (
            <a href={`tel:${salon.phone}`} style={rowLinkStyle}>
              <Icon name="phone" size={13} /> Appeler
            </a>
          )}
          {onLogVisit && (
            <Button size="sm" onClick={onLogVisit}>
              {v?.visitedByMe ? 'Re-visiter' : 'Visiter'}
            </Button>
          )}
        </div>
      </div>
    </div>
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
  const [isClient, setIsClient] = useState(salon.converted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoFix | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('locating');

  // GPS check-in: capture the device position as soon as the modal opens, so a
  // fix is ready by the time the ambassador submits.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGeoStatus('unavailable');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGeoStatus('ok');
      },
      () => setGeoStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, []);

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
          gps: geo ?? undefined,
          converted: isClient,
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

  const geoIcon: IconName = geoStatus === 'ok' ? 'location' : geoStatus === 'locating' ? 'clock' : 'alert';
  const geoColors =
    geoStatus === 'ok'
      ? { bg: 'var(--success-bg)', fg: 'var(--success)' }
    : geoStatus === 'locating'
      ? { bg: 'var(--surface-2)', fg: 'var(--text-3)' }
      : { bg: 'var(--warning-bg)', fg: 'var(--warning)' };

  return (
    <Modal variant="sheet" onClose={onClose}>
      <div style={{ padding: '4px 18px 24px' }}>
        <div style={{ fontSize: FONT.bodyLg, fontWeight: WEIGHT.heavy, color: 'var(--text)', marginBottom: 2 }}>
          {salon.name}
        </div>
        <div style={{ fontSize: FONT.body - 1, color: 'var(--text-3)', marginBottom: SPACE.md }}>
          {salon.address ?? 'Enregistrer ta visite'}
        </div>

        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: SPACE.sm,
          padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: SPACE.lg,
          fontSize: FONT.body - 1, lineHeight: 1.4,
          background: geoColors.bg, color: geoColors.fg,
        }}>
          <Icon name={geoIcon} size={15} style={{ marginTop: 1 }} />
          <span>
            {geoStatus === 'locating' && 'Localisation en cours… reste sur place.'}
            {geoStatus === 'ok' && geo &&
              `Position détectée (±${Math.round(geo.accuracy)} m) — ta visite sera vérifiée.`}
            {geoStatus === 'denied' &&
              'Localisation refusée — la visite sera enregistrée mais marquée non vérifiée.'}
            {geoStatus === 'unavailable' &&
              'Localisation indisponible sur cet appareil — visite marquée non vérifiée.'}
          </span>
        </div>

        <Field label="Tu as laissé un flyer ?">
          <div style={{ display: 'flex', gap: SPACE.sm }}>
            <Toggle active={!flyerLeft} onClick={() => setFlyerLeft(false)}>Non</Toggle>
            <Toggle active={flyerLeft} onClick={() => setFlyerLeft(true)}>Oui</Toggle>
          </div>
        </Field>

        <Field label="Convaincu·e de commander ?">
          <div style={{ display: 'flex', gap: SPACE.sm }}>
            <Toggle active={convinced === 'no'} onClick={() => setConvinced('no')}>Non</Toggle>
            <Toggle active={convinced === 'maybe'} onClick={() => setConvinced('maybe')}>Peut-être</Toggle>
            <Toggle active={convinced === 'yes'} onClick={() => setConvinced('yes')}>Oui</Toggle>
          </div>
        </Field>

        <Field label="Probabilité de commande">
          <div style={{ display: 'flex', gap: SPACE.sm }}>
            {[1, 2, 3].map((r) => (
              <Toggle key={r} active={rating === r} onClick={() => setRating(r)}>
                <span style={{ display: 'inline-flex' }}>
                  {Array.from({ length: r }).map((_, i) => <Icon key={i} name="star" size={11} />)}
                </span>
                <span style={{ fontSize: FONT.micro + 1, opacity: 0.85 }}>{RATING_LABEL[r]}</span>
              </Toggle>
            ))}
          </div>
        </Field>

        <Field label="Devenu client ? (l'établissement a commandé)">
          <div style={{ display: 'flex', gap: SPACE.sm }}>
            <Toggle active={!isClient} onClick={() => setIsClient(false)}>Non</Toggle>
            <Toggle active={isClient} onClick={() => setIsClient(true)}>Oui</Toggle>
          </div>
        </Field>

        <Field label="Notes (optionnel)">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
            rows={3}
            placeholder="Ex: parler à Sophie, repasser jeudi…"
          />
        </Field>

        <Field label="Date de relance (optionnel)">
          <Input type="date" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
        </Field>

        {error && (
          <div style={{
            background: 'var(--error-bg)', color: 'var(--error)',
            borderRadius: 'var(--radius-sm)', padding: '8px 12px',
            fontSize: FONT.body - 1, marginBottom: SPACE.md,
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: SPACE.sm }}>
          <Button variant="secondary" onClick={onClose} style={{ flex: 1 }}>Annuler</Button>
          <Button onClick={save} loading={saving} style={{ flex: 2 }}>
            {saving ? 'Enregistrement…' : 'Enregistrer la visite'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Toggle({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, minHeight: 40, padding: '9px 8px',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        background: active ? 'var(--accent-muted)' : 'var(--surface-2)',
        color: active ? 'var(--accent)' : 'var(--text-2)',
        border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-sm)', fontSize: FONT.body - 1, fontWeight: WEIGHT.semibold,
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >{children}</button>
  );
}
