'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

export interface ReviewSelection {
  placeId: string | null;
  reviewUrl: string;
}

interface Candidate {
  placeId: string;
  displayName: string | null;
  formattedAddress: string | null;
  rating: number | null;
  userRatingCount: number | null;
  reviewUrl: string;
}

interface Props {
  /** Used to pre-fill the search the first time the picker opens. */
  name: string;
  address?: string | null;
  /** Currently stored review URL (e.g. when editing an establishment). */
  value: string;
  placeId?: string | null;
  onChange: (selection: ReviewSelection) => void;
  /** Compact styling for the dashboard form (vs. the large onboarding step). */
  variant?: 'onboarding' | 'compact';
}

const star = '★';

export function GoogleReviewPicker({
  name,
  address,
  value,
  onChange,
  variant = 'onboarding',
}: Props) {
  const t = useTranslations('onboarding.googleReview');
  const compact = variant === 'compact';

  const [query, setQuery] = useState(name);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [unconfigured, setUnconfigured] = useState(false);
  // Google answered with an error rather than an empty result. Distinct from
  // `unconfigured` (no API key at all) and from a genuine no-match.
  const [failed, setFailed] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualUrl, setManualUrl] = useState(value);
  const [manualError, setManualError] = useState<string | null>(null);
  const didAutoSearch = useRef(false);

  const selectedReviewUrl = value;

  const runSearch = useCallback(async (q: string, addr?: string | null) => {
    if (q.trim().length < 2) return;
    setLoading(true);
    setSearched(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ name: q.trim() });
      if (addr) params.set('address', addr);
      const res = await fetch(`/api/onboarding/google-places?${params.toString()}`);
      const data = (await res.json()) as {
        candidates?: Candidate[];
        unconfigured?: boolean;
        failed?: boolean;
      };
      setCandidates(data.candidates ?? []);
      if (data.unconfigured) {
        setUnconfigured(true);
        setManual(true);
      } else if (!res.ok || data.failed) {
        // Drop straight into manual entry rather than leaving the manager on a
        // search box that cannot succeed. Google being down is our problem, not
        // theirs, and the pasted "Demander des avis" link is just as good — it
        // is the same deep link we would have built from the place id.
        setFailed(true);
        setManual(true);
      }
    } catch {
      setCandidates([]);
      // The request itself never landed — offline, timeout, blocked. Same
      // consequence for the manager as a Google-side failure.
      setFailed(true);
      setManual(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-search once on mount when we have a name and nothing chosen yet.
  // Deferred to a macrotask so we never call setState synchronously inside the
  // effect body (which would trigger cascading renders).
  useEffect(() => {
    if (didAutoSearch.current) return;
    didAutoSearch.current = true;
    if (!value && name.trim().length >= 2) {
      const id = setTimeout(() => void runSearch(name, address), 0);
      return () => clearTimeout(id);
    }
  }, [name, address, value, runSearch]);

  function choose(c: Candidate) {
    setManual(false);
    setManualError(null);
    onChange({ placeId: c.placeId, reviewUrl: c.reviewUrl });
  }

  function clearSelection() {
    onChange({ placeId: null, reviewUrl: '' });
  }

  function applyManual() {
    const v = manualUrl.trim();
    if (!v) {
      setManualError(t('manualInvalid'));
      return;
    }
    setManualError(null);
    // Server-side actions normalise/validate further; here we just accept a
    // non-empty value so the manager isn't blocked by client-side guessing.
    onChange({ placeId: null, reviewUrl: v });
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: compact ? '9px 12px' : '14px 16px',
    borderRadius: compact ? 8 : 12,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    fontSize: compact ? 13.5 : 16,
    fontFamily: 'var(--font)',
    boxSizing: 'border-box',
    outline: 'none',
  };

  // ── Already selected → confirmation card ───────────────────────────────────
  if (selectedReviewUrl) {
    return (
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: compact ? '12px 14px' : '16px 18px',
            borderRadius: compact ? 10 : 14,
            border: '1.5px solid var(--accent)',
            background: 'var(--surface-2)',
          }}
        >
          <span style={{ fontSize: compact ? 18 : 22, lineHeight: 1.2 }}>✅</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: compact ? 13 : 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
              {t('linked')}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-3)',
                wordBreak: 'break-all',
                lineHeight: 1.5,
              }}
            >
              {selectedReviewUrl}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={clearSelection}
          style={{
            marginTop: 10,
            background: 'none',
            border: 'none',
            color: 'var(--text-3)',
            fontSize: 12.5,
            cursor: 'pointer',
            fontFamily: 'var(--font)',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
            padding: 0,
          }}
        >
          {t('change')}
        </button>
      </div>
    );
  }

  // ── Manual entry mode ──────────────────────────────────────────────────────
  if (manual) {
    return (
      <div>
        {failed && (
          <p style={{
            fontSize: compact ? 12 : 13,
            color: 'var(--text-2)',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 12,
            lineHeight: 1.55,
          }}>
            {t('searchUnavailable')}
          </p>
        )}

        {unconfigured ? null : (
          <p style={{ fontSize: compact ? 12.5 : 14, color: 'var(--text-3)', marginBottom: 10, lineHeight: 1.6 }}>
            {t('manualIntro')}
          </p>
        )}

        {/* Where the link actually comes from. This used to be an 11.5px
            footnote under the field, which is unreadable on a phone and is the
            only instruction that matters once the search is unavailable. */}
        {!compact && (
          <ol style={{
            margin: '0 0 14px',
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
            counterReset: 'gstep',
          }}>
            {(['guide1', 'guide2', 'guide3'] as const).map((k) => (
              <li key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{
                  flexShrink: 0,
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'var(--accent)', color: '#fff',
                  fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginTop: 1,
                }}>
                  {k.slice(-1)}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>
                  {t(k)}
                </span>
              </li>
            ))}
          </ol>
        )}

        <input
          type="url"
          inputMode="url"
          value={manualUrl}
          onChange={(e) => setManualUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), applyManual())}
          placeholder="https://g.page/r/…/review"
          style={inputStyle}
        />
        {manualError && (
          <p style={{ fontSize: 12.5, color: 'var(--error)', marginTop: 8 }}>{manualError}</p>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={applyManual}
            style={{
              padding: compact ? '8px 14px' : '11px 18px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--accent-fg, #fff)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font)',
            }}
          >
            {t('manualSave')}
          </button>
          {!unconfigured && (
            <button
              type="button"
              onClick={() => { setManual(false); setManualError(null); }}
              style={{
                padding: compact ? '8px 14px' : '11px 18px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-2)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              {t('backToSearch')}
            </button>
          )}
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 12, lineHeight: 1.6 }}>
          {t('manualHelp')}
        </p>
      </div>
    );
  }

  // ── Search + candidate list ────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), runSearch(query, address))}
          placeholder={t('searchPlaceholder')}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => runSearch(query, address)}
          disabled={loading || query.trim().length < 2}
          style={{
            padding: compact ? '0 14px' : '0 18px',
            borderRadius: compact ? 8 : 12,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text-2)',
            fontSize: 13,
            fontWeight: 600,
            cursor: loading || query.trim().length < 2 ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font)',
            whiteSpace: 'nowrap',
            opacity: loading || query.trim().length < 2 ? 0.5 : 1,
          }}
        >
          {loading ? t('searching') : t('searchButton')}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        {candidates.map((c) => (
          <button
            key={c.placeId}
            type="button"
            onClick={() => choose(c)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: compact ? '10px 12px' : '13px 15px',
              borderRadius: compact ? 10 : 12,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'var(--font)',
              width: '100%',
            }}
          >
            <span style={{ fontSize: compact ? 16 : 18, lineHeight: 1.3 }}>📍</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: compact ? 13.5 : 15, fontWeight: 600, color: 'var(--text)' }}>
                {c.displayName ?? t('unknownPlace')}
              </div>
              {c.formattedAddress && (
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  {c.formattedAddress}
                </div>
              )}
              {c.rating != null && (
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>
                  <span style={{ color: '#f5a623' }}>{star}</span> {c.rating.toFixed(1)}
                  {c.userRatingCount != null && (
                    <span style={{ color: 'var(--text-3)' }}> · {t('reviewCount', { count: c.userRatingCount })}</span>
                  )}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {searched && !loading && candidates.length === 0 && (
        <p style={{
          fontSize: 12.5,
          color: failed ? 'var(--warning)' : 'var(--text-3)',
          marginTop: 12,
          lineHeight: 1.6,
        }}>
          {failed ? t('searchUnavailable') : t('noResults')}
        </p>
      )}

      <button
        type="button"
        onClick={() => { setManual(true); setManualUrl(value); }}
        style={{
          marginTop: 14,
          background: 'none',
          border: 'none',
          color: 'var(--text-3)',
          fontSize: 12.5,
          cursor: 'pointer',
          fontFamily: 'var(--font)',
          textDecoration: 'underline',
          textUnderlineOffset: 3,
          padding: 0,
        }}
      >
        {t('useManual')}
      </button>
    </div>
  );
}
