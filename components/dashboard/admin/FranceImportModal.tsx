'use client';

// Modal for the "🇫🇷 Toute la France" import.
//
// Lists the 13 metropolitan regions as checkboxes (all on by default), with a
// rough estimate of the work the import will entail. The estimate is order-of-
// magnitude only — actual numbers depend on the OSM map state. Submission
// dispatches an `import_france` background job; progress shows in the existing
// ImportJobsPanel above. Closing the modal does not cancel anything.

import { useMemo, useState } from 'react';
import { FRENCH_REGIONS } from '@/lib/admin/french-regions';

// Rough per-region commune counts (from INSEE 2024 totals). Used purely for
// the "≈ X 000 zones" estimate shown in the modal. Stale numbers here would
// be cosmetic, not functional.
const COMMUNES_PER_REGION: Record<string, number> = {
  IDF: 1268,  ARA: 4032,  BFC: 3704,  BRE: 1207,  CVL: 1758,
  COR: 360,   GES: 5118,  HDF: 3858,  NOR: 2641,  NAQ: 4288,
  OCC: 4456,  PDL: 1232,  PAC: 946,
};

// Average salons (incl. all 5 categories: coiffure, esthetique, restaurant,
// cafe, bar) per commune across France. Coarse — used for ETA only.
const SALONS_PER_COMMUNE = 12;

// Wall-clock budget per zone in our pipeline (Overpass + batch upsert).
// Empirically 2-5s with the new code; 4 is a safe midpoint.
const SECONDS_PER_ZONE = 4;
// BAN batch reverse-geocoding: ~500 addresses per 5s = ~100/s effective.
const ADDRESSES_PER_SECOND = 100;

export function FranceImportModal({
  open, onClose, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (regions: string[], enrich: boolean) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(FRENCH_REGIONS.map((r) => r.code))
  );
  const [enrich, setEnrich] = useState(true);

  const estimate = useMemo(() => {
    let zones = 0;
    for (const r of FRENCH_REGIONS) {
      if (selected.has(r.code)) zones += COMMUNES_PER_REGION[r.code] ?? 0;
    }
    const salons = zones * SALONS_PER_COMMUNE;
    const osmSeconds = zones * SECONDS_PER_ZONE;
    const addrSeconds = enrich ? salons / ADDRESSES_PER_SECOND : 0;
    return { zones, salons, hours: Math.max(0.1, (osmSeconds + addrSeconds) / 3600) };
  }, [selected, enrich]);

  if (!open) return null;

  const toggle = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };
  const selectAll  = () => setSelected(new Set(FRENCH_REGIONS.map((r) => r.code)));
  const selectNone = () => setSelected(new Set());

  const submit = () => {
    if (selected.size === 0) return;
    onSubmit(Array.from(selected), enrich);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 20, maxWidth: 560,
          width: '100%', maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text)' }}>
            🇫🇷 Importer toute la France
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-3)',
              fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1,
            }}
            aria-label="Fermer"
          >×</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, marginBottom: 14, lineHeight: 1.5 }}>
          Coche les régions à importer. Le job tourne en tâche de fond : le worker s&apos;auto-relance
          entre chaque chunk, et plusieurs crons quotidiens prennent le relais si une étape crashe
          pendant que cet onglet est fermé.
        </p>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button onClick={selectAll}  style={chipStyle}>Tout cocher ({FRENCH_REGIONS.length})</button>
          <button onClick={selectNone} style={chipStyle}>Aucun</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
          {FRENCH_REGIONS.map((r) => {
            const checked = selected.has(r.code);
            return (
              <label
                key={r.code}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  background: checked ? 'var(--accent-muted, var(--surface-2))' : 'var(--surface-2)',
                  fontSize: 13, color: 'var(--text)',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(r.code)}
                  style={{ cursor: 'pointer' }}
                />
                <span>{r.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>
                  {r.departments.length} dépts
                </span>
              </label>
            );
          })}
        </div>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)',
          fontSize: 13, color: 'var(--text)', marginBottom: 14, cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={enrich}
            onChange={(e) => setEnrich(e.target.checked)}
          />
          <span>Enrichir les adresses manquantes (API BAN)</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>
            Recommandé
          </span>
        </label>

        <div style={{
          padding: 10, marginBottom: 14,
          background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)',
          border: '1px dashed var(--border-subtle)',
          fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5,
        }}>
          <strong>Estimation grossière</strong> ·{' '}
          ~{Math.round(estimate.zones).toLocaleString('fr-FR')} zones ·{' '}
          ~{Math.round(estimate.salons).toLocaleString('fr-FR')} établissements ·{' '}
          durée ≈ {estimate.hours < 1 ? `${Math.round(estimate.hours * 60)} min` : `${estimate.hours.toFixed(1)} h`}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={chipStyle}>Annuler</button>
          <button
            onClick={submit}
            disabled={selected.size === 0}
            style={{
              padding: '8px 14px', background: selected.size === 0 ? 'var(--surface-3)' : 'var(--accent)',
              color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)',
              fontSize: 13, fontWeight: 600,
              cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
              opacity: selected.size === 0 ? 0.6 : 1,
            }}
          >
            Lancer l&apos;import ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}

const chipStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: 12, fontWeight: 600,
  background: 'var(--surface-2)', color: 'var(--text-2)',
  border: '1px solid var(--border)', borderRadius: 99, cursor: 'pointer',
};
