import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const CSP = [
  "default-src 'self'",
  // Next.js inline scripts + the Mangopay Checkout SDK (PCI: must load from
  // checkout.mangopay.com, never bundled) + Google profiling for fraud checks.
  "script-src 'self' 'unsafe-inline' https://checkout.mangopay.com https://*.google.com",
  // Mangopay Checkout SDK iframes (card form + hosted 3DS).
  "frame-src https://checkout.mangopay.com https://*.mangopay.com",
  // Supabase REST/Realtime + Mangopay API calls from the browser SDK.
  "connect-src 'self' https://*.mangopay.com https://*.payline.com https://*.supabase.co wss://*.supabase.co",
  // Avatars and logos live in Supabase Storage (public-media bucket).
  // Carto tiles power the salon map.
  "img-src 'self' data: blob: https://*.supabase.co https://*.basemaps.cartocdn.com",
  // Tailwind injects inline styles; no external stylesheet CDN
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ');

const securityHeaders = [
  // Prevent clickjacking (redundant with frame-ancestors but kept for older browsers)
  { key: 'X-Frame-Options', value: 'DENY' },
  // Block MIME-type sniffing attacks
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Don't send full Referer to cross-origin destinations
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable browser features not needed by the app
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Disable DNS prefetch to avoid leaking URLs
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  // Enforce HTTPS for 1 year (Vercel/CDN may add this too, belt-and-suspenders)
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // CSP enforced. 'unsafe-inline' on script-src is required for Next.js
  // bootstrap; the rest of the policy still blocks unauthorized origins,
  // frames, form actions, and base-uri overrides.
  { key: 'Content-Security-Policy', value: CSP },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
