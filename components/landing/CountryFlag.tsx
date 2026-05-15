import type { ReactElement } from 'react';

// Real SVG flags — emoji flags render inconsistently (Windows/Chrome show
// raw regional-indicator letters), so the landing page draws them itself.

export type CountryCode = 'fr' | 'be' | 'ch' | 'lu';

const COUNTRY_LABEL: Record<CountryCode, string> = {
  fr: 'France',
  be: 'Belgique',
  ch: 'Suisse',
  lu: 'Luxembourg',
};

// Countries the hardware ships to (free EU shipping).
export const SHIPPING_COUNTRIES: CountryCode[] = ['fr', 'be', 'ch', 'lu'];

const FLAG_SHAPES: Record<CountryCode, ReactElement> = {
  fr: (
    <>
      <rect width="24" height="16" fill="#fff" />
      <rect width="8" height="16" fill="#0055A4" />
      <rect x="16" width="8" height="16" fill="#EF4135" />
    </>
  ),
  be: (
    <>
      <rect width="8" height="16" fill="#15110D" />
      <rect x="8" width="8" height="16" fill="#FAE042" />
      <rect x="16" width="8" height="16" fill="#ED2939" />
    </>
  ),
  ch: (
    <>
      <rect width="24" height="16" fill="#D52B1E" />
      <rect x="10.5" y="3.5" width="3" height="9" fill="#fff" />
      <rect x="7.5" y="6.5" width="9" height="3" fill="#fff" />
    </>
  ),
  lu: (
    <>
      <rect width="24" height="16" fill="#fff" />
      <rect width="24" height="5.34" fill="#ED2939" />
      <rect y="10.66" width="24" height="5.34" fill="#00A1DE" />
    </>
  ),
};

export function CountryFlag({ code, size = 22 }: { code: CountryCode; size?: number }) {
  const height = Math.round((size * 2) / 3);
  return (
    <span
      role="img"
      aria-label={COUNTRY_LABEL[code]}
      title={COUNTRY_LABEL[code]}
      style={{
        display: 'inline-flex',
        width: size,
        height,
        borderRadius: 3,
        overflow: 'hidden',
        boxShadow: '0 0 0 1px rgba(17,17,24,0.12)',
        flexShrink: 0,
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 24 16"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >
        {FLAG_SHAPES[code]}
      </svg>
    </span>
  );
}
