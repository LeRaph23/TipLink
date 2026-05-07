'use client';
import { useRef, useState } from 'react';

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
  const [suggestions, setSuggestions] = useState<BanFeature[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
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
        const res = await fetch(
          `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5`,
          { signal: ctrl.signal }
        );
        const data = await res.json();
        setSuggestions(data.features ?? []);
        setOpen(true);
      } catch {
        // AbortError or network error — silently ignore
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
        <div
          style={{
            position: 'absolute',
            right: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--text-3)',
          }}
        />
      )}
    </div>
  );
}
