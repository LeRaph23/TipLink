'use client';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

interface BanFeature {
  properties: {
    label: string;
    score: number;
  };
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onConfirm?: () => void;
  style?: React.CSSProperties;
}

export function AddressAutocomplete({ value, onChange, onConfirm, style }: Props) {
  const t = useTranslations('onboarding.address');
  const [suggestions, setSuggestions] = useState<BanFeature[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  // True once a lookup fails (network / CSP block) so we can invite the user to
  // type their address manually instead of silently showing nothing.
  const [lookupFailed, setLookupFailed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    onChange(q);
    setActiveIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (q.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        // Géoplateforme (IGN) geocoder — the old api-adresse.data.gouv.fr host
        // was decommissioned on 2026-04-14. Same BAN data, same GeoJSON shape.
        const res = await fetch(
          `https://data.geopf.fr/geocodage/search/?q=${encodeURIComponent(q)}&limit=5`,
          { signal: ctrl.signal }
        );
        const data = await res.json();
        setSuggestions(data.features ?? []);
        setOpen(true);
        setLookupFailed(false);
      } catch (err) {
        // Ignore deliberate aborts; for real failures (network / CSP) flag the
        // field so the user knows they can still type the address by hand.
        if ((err as Error)?.name !== 'AbortError') {
          console.error('[address] geocoder lookup failed', err);
          setLookupFailed(true);
        }
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function selectSuggestion(feat: BanFeature) {
    onChange(feat.properties.label);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        selectSuggestion(suggestions[activeIndex]);
      } else if (onConfirm) {
        onConfirm();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    right: 0,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
    zIndex: 50,
    listStyle: 'none',
    padding: '4px',
    margin: 0,
    overflow: 'hidden',
  };

  return (
    <div style={{ position: 'relative' }} onBlur={handleBlur}>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        style={style}
        autoComplete="off"
        placeholder="12 rue de Rivoli, 75001 Paris"
      />
      {open && suggestions.length > 0 && (
        <ul style={dropdownStyle}>
          {suggestions.map((feat, i) => (
            <li
              key={feat.properties.label}
              onMouseDown={() => selectSuggestion(feat)}
              onMouseEnter={() => setActiveIndex(i)}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                background: i === activeIndex ? 'var(--surface-2)' : 'transparent',
                color: i === activeIndex ? 'var(--text)' : 'var(--text-2)',
                fontSize: 14,
                fontFamily: 'var(--font)',
                transition: 'background 80ms',
              }}
            >
              {feat.properties.label}
            </li>
          ))}
        </ul>
      )}
      {loading && (
        <span
          style={{
            position: 'absolute',
            right: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 12,
            color: 'var(--text-3)',
            fontFamily: 'var(--font)',
            pointerEvents: 'none',
          }}
        >
          {t('searching')}
        </span>
      )}
      {lookupFailed && !loading && (
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.5 }}>
          {t('manualHint')}
        </p>
      )}
    </div>
  );
}
