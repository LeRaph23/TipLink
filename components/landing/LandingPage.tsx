'use client';

import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import Image from 'next/image';
import { ProductCard } from '@/components/landing/ProductCard';
import { BuyModal } from '@/components/landing/BuyModal';
import { StickyMobileCTA } from '@/components/landing/StickyMobileCTA';
import { CountryFlag, SHIPPING_COUNTRIES } from '@/components/landing/CountryFlag';
import type { PackPricing } from '@/lib/stripe/pricing';
import { formatPriceCents, htSuffix } from '@/lib/format-price';
import { launchOfferState, formatOfferEnd, type LaunchOfferState } from '@/lib/launch-offer';

type PackId = 'solo' | 'duo';
type PricingMap = Record<PackId, PackPricing>;

// ─── Light theme ──────────────────────────────────────────────────────────────
const LIGHT: React.CSSProperties = {
  '--lbg': '#f9f9f7',
  '--lsurface': '#ffffff',
  '--ltext': '#111118',
  '--ltext-2': '#3a3b4f',
  '--lmuted': '#74748a',
  '--laccent': '#E57A97',
  '--lborder': '#e4e4ec',
  '--lsuccess': '#16a34a',
  '--lwarn': '#d97706',
} as React.CSSProperties;

// ─── Utils ────────────────────────────────────────────────────────────────────


function Reveal({ children, delay = 0, style: s = {} }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } }, { threshold: 0.07 });
    obs.observe(el); return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(22px)', transition: `opacity 600ms ${delay}ms cubic-bezier(.22,1,.36,1), transform 600ms ${delay}ms cubic-bezier(.22,1,.36,1)`, ...s }}>
      {children}
    </div>
  );
}

// Animated number that counts up once scrolled into view. Parses the leading
// numeric part of a label ("3 sec", "2 min", "0 €") and re-appends the suffix.
// Labels with no leading digit ("À vie") fall through and render verbatim.
function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const match = /^(\d+(?:\.\d+)?)(.*)$/.exec(value.trim());
  const target = match ? parseFloat(match[1]) : 0;
  const decimals = match && match[1].includes('.') ? match[1].split('.')[1].length : 0;
  const suffix = match ? match[2] : '';
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      raf = requestAnimationFrame(() => setVal(target));
      return () => cancelAnimationFrame(raf);
    }
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / 900);
        setVal(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => { obs.disconnect(); cancelAnimationFrame(raf); };
  }, [target]);
  if (!match) return <span ref={ref}>{value}</span>;
  return <span ref={ref}>{val.toFixed(decimals)}{suffix}</span>;
}

function Badge({ children, variant = 'accent' }: { children: React.ReactNode; variant?: 'accent' | 'success' | 'warn' }) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    accent: { bg: '#FEF1F4', text: '#E57A97', border: '#FBDAE3' },
    success: { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
    warn: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  };
  const c = colors[variant];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 100, background: c.bg, border: `1px solid ${c.border}`, fontSize: 12, fontWeight: 700, color: c.text, letterSpacing: '0.01em' }}>
      {children}
    </span>
  );
}


// ─── SVG icons (replaces emojis for consistent cross-platform rendering) ──────
function ShieldIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function RefreshIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}
function TruckIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1" />
      <path d="M16 8h4l3 3v5h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}
function CardIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}
function BoxIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}
function BoltIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
function CoinIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8M9.5 10.5C9.5 9.12 10.62 8 12 8s2.5 1.12 2.5 2.5c0 2.5-5 2.5-5 5S10.62 18 12 18s2.5-1.12 2.5-2.5" />
    </svg>
  );
}
function GlobeIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}
function BuildingIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9M15 21V9" />
    </svg>
  );
}
function PlaneIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}
function MessageIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function UsersIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function CheckIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ─── PromoBanner ──────────────────────────────────────────────────────────────
// Announces the launch-offer deadline when one is configured, falling back to
// evergreen text otherwise.
//
// The remaining-days count depends on the current date, so it cannot come from
// the prerendered HTML — this page is statically generated and the count would
// be frozen at build time, eventually claiming an offer that has already
// expired. The server snapshot is therefore always "inactive" and the real
// state is read on the client. useSyncExternalStore is the right primitive
// here: it gives a server/client split without a mount effect that would
// re-render the whole page a second time on every visit.
const OFFER_INACTIVE: LaunchOfferState = { active: false };
const subscribeToNothing = () => () => {};
let clientOfferCache: LaunchOfferState | null = null;

function readClientOffer(): LaunchOfferState {
  // Cached because getSnapshot must return a referentially stable value.
  clientOfferCache ??= launchOfferState(process.env.NEXT_PUBLIC_LAUNCH_OFFER_ENDS_AT);
  return clientOfferCache;
}

function PromoBanner() {
  const t = useTranslations('landing');
  const locale = useLocale();
  const offer = useSyncExternalStore(
    subscribeToNothing,
    readClientOffer,
    () => OFFER_INACTIVE
  );

  return (
    <div style={{ background: 'linear-gradient(90deg,#C95578,#E57A97,#EC97B0)', color: '#fff', textAlign: 'center', padding: '9px 16px', fontSize: 13, fontWeight: 600, letterSpacing: '0.01em', position: 'sticky', top: 0, zIndex: 300 }}>
      {offer.active
        ? t('promoBannerDated', {
            date: formatOfferEnd(offer.endsAt, locale),
            days: offer.daysLeft,
          })
        : t('promoBanner')}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header({ onOrderClick }: { onOrderClick: () => void }) {
  const t = useTranslations('landing');
  const tc = useTranslations('common');
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  const navItems = [
    { key: 'packs', href: '#packs' },
    { key: 'clients', href: '#engagements' },
    { key: 'faq', href: '#faq' },
    { key: 'contact', href: '/contact' },
  ] as const;

  return (
    <>
      <header style={{ position: 'sticky', top: 38, zIndex: 200, height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 clamp(16px, 4vw, 48px)', background: scrolled ? 'rgba(255,255,255,0.97)' : '#fff', backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: '1px solid #e4e4ec', transition: 'background 300ms' }}>
        <Link href="/" aria-label="Digitip — Accueil" title="Digitip" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <span style={{ fontFamily: 'var(--font-poppins), sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', color: '#111118' }}>DigiTip</span>
        </Link>

        {/* Desktop nav */}
        <nav className="land-nav-desktop" style={{ gap: 2, alignItems: 'center' }}>
          {navItems.map(({ key, href }) => (
            <a key={key} href={href} className="land-nav-link" style={{ padding: '6px 14px', textDecoration: 'none', color: '#74748a', fontSize: 13.5, fontWeight: 500, borderRadius: 7, transition: 'color 150ms' }}>
              {t(`nav.${key}` as Parameters<typeof t>[0])}
            </a>
          ))}
        </nav>

        {/* Desktop buttons */}
        <div className="land-btns-desktop" style={{ gap: 8, alignItems: 'center' }}>
          <LanguageSwitcher variant="light" />
          <Link href="/login" className="btn-ghost" style={{ padding: '7px 16px', borderRadius: 8, textDecoration: 'none', border: '1px solid #e4e4ec', color: '#3a3b4f', fontSize: 13, fontWeight: 500, background: '#fff' }}>{tc('login')}</Link>
          <button onClick={onOrderClick} className="btn-accent" style={{ padding: '8px 20px', borderRadius: 9, cursor: 'pointer', background: '#E57A97', color: '#fff', fontSize: 13.5, fontWeight: 700, border: 'none', boxShadow: '0 2px 16px rgba(229,122,151,0.38)', transition: 'all 140ms' }}>
            {t('hero.cta')} →
          </button>
        </div>

        {/* Mobile hamburger — visibility handled by .land-mob-toggle CSS class */}
        <button
          className="land-mob-toggle"
          onClick={() => setMobileOpen(true)}
          style={{ alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 9, border: '1.5px solid #e4e4ec', background: '#fff', cursor: 'pointer', color: '#111118' }}
          aria-label="Menu"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" />
          </svg>
        </button>
      </header>

      {/* Mobile full-screen menu */}
      {mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 300, display: 'flex', flexDirection: 'column', padding: '0 0 32px' }}>
          {/* Top bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 62, borderBottom: '1px solid #e4e4ec', flexShrink: 0 }}>
            <span style={{ fontFamily: 'var(--font-poppins), sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', color: '#111118' }}>DigiTip</span>
            <button onClick={() => setMobileOpen(false)} style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: '1.5px solid #e4e4ec', background: '#fff', cursor: 'pointer', fontSize: 20, color: '#74748a' }}>
              ✕
            </button>
          </div>
          {/* Nav links */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 20px', gap: 4 }}>
            {navItems.map(({ key, href }) => (
              <a key={key} href={href} onClick={() => setMobileOpen(false)} style={{ padding: '14px 16px', textDecoration: 'none', color: '#111118', fontSize: 17, fontWeight: 600, borderRadius: 12, display: 'block' }}>
                {t(`nav.${key}` as Parameters<typeof t>[0])}
              </a>
            ))}
          </div>
          {/* CTA */}
          <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <LanguageSwitcher variant="light" />
            <Link href="/login" onClick={() => setMobileOpen(false)} style={{ display: 'block', padding: '14px', borderRadius: 12, textDecoration: 'none', border: '1.5px solid #e4e4ec', color: '#3a3b4f', fontSize: 15, fontWeight: 600, background: '#fff', textAlign: 'center' }}>
              {tc('login')}
            </Link>
            <button onClick={() => { setMobileOpen(false); onOrderClick(); }} style={{ width: '100%', padding: '15px', borderRadius: 12, cursor: 'pointer', background: '#E57A97', color: '#fff', fontSize: 16, fontWeight: 800, border: 'none', boxShadow: '0 4px 20px rgba(229,122,151,0.4)' }}>
              {t('hero.cta')} →
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Hero (split layout: text left + product visual right) ───────────────────
function HeroSection({ onOrderClick }: { onOrderClick: () => void }) {
  const t = useTranslations('landing');
  return (
    <section style={{ background: '#fff', padding: 'clamp(52px,8vw,100px) clamp(20px,5vw,60px) clamp(40px,5vw,70px)', borderBottom: '1px solid #e4e4ec' }}>
      <div className="land-hero-inner" style={{ maxWidth: 1160, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 48, flexWrap: 'wrap' }}>

        {/* Left: text */}
        <div style={{ maxWidth: 580, flex: '1 1 300px', minWidth: 0 }}>
          <div className="fade-up" style={{ marginBottom: 20 }}>
            <Badge>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: 1 }}>
                <ShieldIcon size={12} color="#E57A97" />
                <span>{t('hero.badge')}</span>
              </span>
            </Badge>
          </div>
          <p className="sr-only">{t('hero.srBrand')}</p>
          <h1 className="fade-up" style={{ fontSize: 'clamp(36px, 5.5vw, 72px)', fontWeight: 900, lineHeight: 0.96, letterSpacing: '-0.04em', color: '#111118', marginBottom: 20, animationDelay: '60ms' }}>
            {t('hero.h1a')}<br />{t('hero.h1b')}<br />
            <span style={{ color: '#E57A97' }}>{t('hero.h1c')}</span>
          </h1>
          <ul className="fade-up" style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480, animationDelay: '130ms' }}>
            {[t('hero.b1'), t('hero.b2'), t('hero.b3'), t('hero.b4')].map((b, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#FEF1F4', border: '1.5px solid #FBDAE3', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <CheckIcon size={13} color="#E57A97" />
                </span>
                <span style={{ fontSize: 15.5, color: '#3a3b4f', lineHeight: 1.5, fontWeight: 500 }}>{b}</span>
              </li>
            ))}
          </ul>
          <div className="fade-up land-hero-btns" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28, animationDelay: '200ms' }}>
            <button onClick={onOrderClick} className="land-hero-btn btn-accent" style={{ padding: '15px 32px', borderRadius: 11, cursor: 'pointer', background: '#E57A97', color: '#fff', fontSize: 16, fontWeight: 800, border: 'none', boxShadow: '0 4px 24px rgba(229,122,151,0.42)', transition: 'all 140ms', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {t('hero.cta')} →
            </button>
            <a href="#comment-ca-marche" className="land-hero-btn btn-ghost" style={{ padding: '15px 24px', borderRadius: 11, textDecoration: 'none', border: '1.5px solid #e4e4ec', color: '#3a3b4f', fontSize: 15, fontWeight: 600, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {t('howItWorks.title')}
            </a>
          </div>
          <div className="fade-up" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', animationDelay: '280ms' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#74748a' }}>{t('hero.social')}</span>
            <span style={{ color: '#e4e4ec' }}>·</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#74748a' }}>{t('trust.freeShippingShort')}</span>
            <span style={{ color: '#e4e4ec' }}>·</span>
            <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
              {SHIPPING_COUNTRIES.map((c) => <CountryFlag key={c} code={c} size={22} />)}
            </span>
          </div>
        </div>

        {/* Right: product visual — hidden on mobile */}
        <div className="fade-up land-hero-visual" style={{ flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', animationDelay: '160ms' }}>
          <div style={{ position: 'relative', width: 300, height: 300 }}>
            <div style={{ width: 300, height: 300, borderRadius: 24, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.06)', position: 'relative' }}>
              <Image src="/products/duo-double.jpg" alt="Plaques époxy NFC Digitip" fill sizes="300px" style={{ objectFit: 'cover' }} priority />
            </div>
            <div style={{ position: 'absolute', top: -12, right: 10, background: '#fff', border: '1.5px solid #e4e4ec', borderRadius: 10, padding: '6px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: 12, fontWeight: 700, color: '#E57A97', display: 'flex', alignItems: 'center', gap: 5 }}>
              <BoltIcon size={12} color="#E57A97" /> {t('product.get3s')}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Stats strip ──────────────────────────────────────────────────────────────
function StatsStrip() {
  const t = useTranslations('landing');
  // Product facts only — never customer counts or ratings. Digitip has no
  // customer base to cite yet, and unverifiable social proof is both a
  // trust problem and an L121-2 exposure.
  const stats = [
    { n: t('stats.s1n'), label: t('stats.s1l') },
    { n: t('stats.s2n'), label: t('stats.s2l') },
    { n: t('stats.s3n'), label: t('stats.s3l') },
    { n: t('stats.s4n'), label: t('stats.s4l') },
  ];
  return (
    <div style={{ background: '#f9f9f7', borderBottom: '1px solid #e4e4ec', padding: '0 clamp(16px,4vw,48px)' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
        {stats.map((s, i) => (
          <div key={i} className="land-stat-item" style={{ flex: '1 1 140px', padding: '20px 16px', textAlign: 'center', borderRight: i < stats.length - 1 ? '1px solid #e4e4ec' : 'none' }}>
            <div style={{ fontFamily: 'var(--font-poppins), sans-serif', fontSize: 26, fontWeight: 900, color: '#111118', letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}><CountUp value={s.n} /></div>
            <div style={{ fontSize: 12.5, color: '#74748a', marginTop: 4, fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Key advantages (tip distribution + no subscription) ──────────────────────
function KeyAdvantagesSection() {
  const t = useTranslations('landing');
  return (
    <section style={{ background: '#f9f9f7', padding: 'clamp(60px,7vw,100px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 'clamp(36px,6vw,80px)', flexWrap: 'wrap' }}>

        {/* Left: copy */}
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <Reveal>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#E57A97', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 14 }}>{t('keyAdv.kicker')}</div>
            <h2 style={{ fontSize: 'clamp(28px,3.8vw,46px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.04em', lineHeight: 1.08, marginBottom: 18 }}>
              {t('keyAdv.split.title')}<br />
              <span style={{ color: '#E57A97' }}>{t('keyAdv.split.titleAccent')}</span>
            </h2>
            <p style={{ fontSize: 15.5, color: '#74748a', lineHeight: 1.8, maxWidth: 460, marginBottom: 0 }}>{t('keyAdv.split.body')}</p>
          </Reveal>
        </div>

        {/* Right: phone mockup */}
        <Reveal delay={120} style={{ flex: '0 1 300px', display: 'flex', justifyContent: 'center', alignSelf: 'flex-end' }}>
          <div style={{ position: 'relative' }}>
            <div style={{ borderRadius: 36, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.18), 0 8px 24px rgba(0,0,0,0.10)', width: 260, lineHeight: 0 }}>
              <Image src="/mockup-app.jpg" alt="Digitip — choisir à qui va le pourboire" width={260} height={520} style={{ objectFit: 'cover', display: 'block', width: '100%', height: 'auto' }} />
            </div>
            {/* Floating badge */}
            <div style={{ position: 'absolute', bottom: -14, left: -20, background: '#fff', border: '1.5px solid #e4e4ec', borderRadius: 12, padding: '10px 16px', boxShadow: '0 8px 24px rgba(0,0,0,0.10)', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#FEF1F4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <UsersIcon size={15} color="#E57A97" />
              </div>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: '#111118', lineHeight: 1 }}>Répartition libre</div>
                <div style={{ fontSize: 10.5, color: '#74748a', marginTop: 2 }}>Chaque tip va à la bonne personne</div>
              </div>
            </div>
          </div>
        </Reveal>

      </div>
    </section>
  );
}

// ─── Product section (Digifeel-style full e-commerce) ─────────────────────────
function ProductSection({ onOrderClick, pricing }: { onOrderClick: (p: 'solo' | 'duo') => void; pricing: PricingMap | null }) {
  const t = useTranslations('landing');
  return (
    <section id="produit" style={{ background: '#fff', padding: 'clamp(60px,7vw,90px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto' }}>
        <Reveal style={{ marginBottom: 44 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#E57A97', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 8 }}>{t('product.kicker')}</div>
              <h2 style={{ fontSize: 'clamp(26px,3.5vw,40px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.04em', lineHeight: 1 }}>{t('product.name')}</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldIcon size={17} color="#E57A97" />
              <span style={{ fontSize: 15, fontWeight: 800, color: '#111118' }}>{t('product.claim')}</span>
            </div>
          </div>
        </Reveal>
        <Reveal delay={60}>
          <ProductCard onAddToCart={onOrderClick} locale="fr" pricing={pricing} />
        </Reveal>
      </div>
    </section>
  );
}

// ─── How it works ─────────────────────────────────────────────────────────────
function HowItWorksSection() {
  const t = useTranslations('landing');
  const steps: { n: string; title: string; body: string; icon: React.ReactNode }[] = [
    { n: '01', title: t('howItWorks.step1t'), body: t('howItWorks.step1b'), icon: <BoxIcon size={22} color="#E57A97" /> },
    { n: '02', title: t('howItWorks.step2t'), body: t('howItWorks.step2b'), icon: <BoltIcon size={22} color="#E57A97" /> },
    { n: '03', title: t('howItWorks.step3t'), body: t('howItWorks.step3b'), icon: <CoinIcon size={22} color="#E57A97" /> },
  ];
  return (
    <section id="comment-ca-marche" style={{ background: '#f9f9f7', padding: 'clamp(60px,7vw,90px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#E57A97', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{t('howItWorks.kicker')}</div>
            <h2 style={{ fontSize: 'clamp(26px,3.5vw,42px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.04em' }}>{t('howItWorks.title')}</h2>
            <p style={{ fontSize: 15, color: '#74748a', marginTop: 12, maxWidth: 460, margin: '12px auto 0' }}>{t('howItWorks.sub')}</p>
          </div>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
          {steps.map((s, i) => (
            <Reveal key={i} delay={i * 80}>
              <div style={{ padding: '32px 28px', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: '#FEF1F4', border: '1.5px solid #FBDAE3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#E57A97', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Étape {s.n}</div>
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: '#111118', letterSpacing: '-0.03em', marginBottom: 10 }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: '#74748a', lineHeight: 1.75 }}>{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Shipping ─────────────────────────────────────────────────────────────────
function ShippingSection() {
  const t = useTranslations('landing');
  const items: { icon: React.ReactNode; text: string }[] = [
    { icon: <BoltIcon size={17} color="#E57A97" />, text: t('shipping.processing') },
    { icon: <PlaneIcon size={17} color="#2563eb" />, text: t('shipping.freeEU') },
    { icon: <CountryFlag code="fr" size={20} />, text: t('shipping.timezoneFR') },
    { icon: <GlobeIcon size={17} color="#16a34a" />, text: t('shipping.timezoneEU') },
    { icon: <BoxIcon size={17} color="#74748a" />, text: t('shipping.tracking') },
  ];
  return (
    <section style={{ background: '#fff', padding: 'clamp(48px,5vw,70px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#E57A97', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{t('shipping.kicker')}</div>
          <h2 style={{ fontSize: 'clamp(22px,2.8vw,34px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.03em' }}>{t('shipping.title')}</h2>
        </Reveal>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          {items.map((item, i) => (
            <Reveal key={i} delay={i * 50}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f9f9f7', border: '1.5px solid #e4e4ec', borderRadius: 12, padding: '14px 22px', fontSize: 14, color: '#3a3b4f', fontWeight: 600 }}>
                {item.icon}{item.text}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Guarantee ────────────────────────────────────────────────────────────────
function GuaranteeSection() {
  const t = useTranslations('landing');
  return (
    <section style={{ background: '#f9f9f7', padding: 'clamp(48px,5vw,70px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <Reveal>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center', background: '#fff', border: '2px solid #FBDAE3', borderRadius: 24, padding: 'clamp(32px,5vw,56px) clamp(24px,5vw,56px)' }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: '#FEF1F4', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldIcon size={30} color="#E57A97" />
          </div>
          <h2 style={{ fontSize: 'clamp(20px,2.5vw,28px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.03em', marginBottom: 14 }}>{t('guarantee.title')}</h2>
          <p style={{ fontSize: 15, color: '#74748a', lineHeight: 1.8 }}>{t('guarantee.sub')}</p>
        </div>
      </Reveal>
    </section>
  );
}

// ─── Product grid ─────────────────────────────────────────────────────────────
function ProductGridSection({ onOrderClick, pricing }: { onOrderClick: (p: 'solo' | 'duo') => void; pricing: PricingMap | null }) {
  const t = useTranslations('landing');
  const locale = useLocale();
  function priceFor(id: PackId): { price: string; full: string | null; save: string | null } {
    const p = pricing?.[id];
    if (!p) return { price: '…', full: null, save: null };
    return {
      price: formatPriceCents(p.unitAmount, p.currency, locale),
      full: p.listAmount != null ? formatPriceCents(p.listAmount, p.currency, locale) : null,
      save: p.savingsPercent != null ? `${p.savingsPercent}%` : null,
    };
  }
  const soloPrice = priceFor('solo');
  const duoPrice = priceFor('duo');
  const packs = [
    { key: 'solo' as const, name: t('grid.packS'), tags: t('grid.packSTag'), price: soloPrice.price, full: soloPrice.full, save: soloPrice.save },
    { key: 'duo'  as const, name: t('grid.packM'), tags: t('grid.packMTag'), price: duoPrice.price, full: duoPrice.full,  save: duoPrice.save,  popular: true },
  ];
  return (
    <section id="packs" style={{ background: '#f9f9f7', padding: 'clamp(60px,7vw,90px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#E57A97', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{t('grid.kicker')}</div>
            <h2 style={{ fontSize: 'clamp(26px,3.5vw,42px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.04em' }}>{t('grid.title')}</h2>
            <p style={{ fontSize: 15, color: '#74748a', marginTop: 10 }}>{t('grid.sub')}</p>
          </div>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
          {packs.map((p, i) => (
            <Reveal key={p.key} delay={i * 80}>
              <div className="land-card-hover" style={{ background: '#fff', border: p.popular ? '2px solid #E57A97' : '1.5px solid #e4e4ec', borderRadius: 18, overflow: 'hidden', boxShadow: p.popular ? '0 8px 32px rgba(229,122,151,0.14)' : '0 2px 8px rgba(0,0,0,0.04)', position: 'relative' }}>
                {p.popular && (
                  <div style={{ position: 'absolute', top: 14, right: 14, background: '#E57A97', color: '#fff', fontSize: 10.5, fontWeight: 800, padding: '4px 12px', borderRadius: 20, letterSpacing: '0.04em' }}>{t('grid.popular')}</div>
                )}
                {/* Product image area */}
                <div style={{ position: 'relative', aspectRatio: '1/1', overflow: 'hidden' }}>
                  <Image
                    src={p.key === 'duo' ? '/products/duo-double.jpg' : '/products/solo-3d.jpg'}
                    alt={p.key === 'duo' ? 'Pack Duo — 2 plaques époxy NFC' : 'Plaque époxy NFC Solo'}
                    fill
                    sizes="(max-width: 600px) 100vw, 320px"
                    style={{ objectFit: 'cover' }}
                  />
                  {p.save && (
                    <div style={{ position: 'absolute', top: 10, left: 10, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 800, color: '#d97706' }}>
                      ÉCONOMISEZ {p.save}
                    </div>
                  )}
                </div>
                {/* Info */}
                <div style={{ padding: '20px 22px 24px' }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111118', letterSpacing: '-0.02em', marginBottom: 4 }}>{p.name}</h3>
                  <p style={{ fontSize: 13, color: '#74748a', marginBottom: 14 }}>{p.tags}</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
                    <span style={{ fontSize: 24, fontWeight: 900, color: '#111118', letterSpacing: '-0.03em' }}>{p.price}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#a0a0b8' }}>{htSuffix(locale)}</span>
                    {p.full && (
                      <span style={{ fontSize: 14, color: '#c4c4d4', textDecoration: 'line-through', fontWeight: 500 }}>{p.full}</span>
                    )}
                  </div>
                  <button onClick={() => onOrderClick(p.key)} className="btn-accent" style={{ width: '100%', padding: '12px', borderRadius: 10, cursor: 'pointer', background: p.popular ? '#E57A97' : '#111118', color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', transition: 'all 140ms' }}>
                    {t('grid.choose')} →
                  </button>
                </div>
              </div>
            </Reveal>
          ))}
          {/* Custom pack */}
          <Reveal delay={3 * 80}>
            <div style={{ background: '#fff', border: '1.5px dashed #e4e4ec', borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ background: '#f9f9f7', padding: '40px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BuildingIcon size={44} color="#c4c4d4" />
              </div>
              <div style={{ padding: '20px 22px 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111118', letterSpacing: '-0.02em', marginBottom: 4 }}>{t('grid.packCustom')}</h3>
                <p style={{ fontSize: 13, color: '#74748a', flex: 1, lineHeight: 1.6, marginBottom: 14 }}>{t('grid.packCustomSub')}</p>
                <p style={{ fontSize: 22, fontWeight: 900, color: '#111118', letterSpacing: '-0.03em', marginBottom: 16 }}>{t('grid.packCustomPrice')}</p>
                <Link href="/contact" style={{ display: 'block', padding: '12px', borderRadius: 10, textDecoration: 'none', textAlign: 'center', background: '#f9f9f7', color: '#111118', fontSize: 14, fontWeight: 700, border: '1.5px solid #e4e4ec' }}>
                  {t('grid.contact')}
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ─── Placements ───────────────────────────────────────────────────────────────
// Digitip has no customer base to cite yet. Rather than invent one, this
// section states commitments that are individually verifiable — each one is
// backed by the CGV, the mentions légales, or the payment stack itself.
// Do NOT reintroduce ratings, review counts or customer numbers here until
// they are real and sourced: unverifiable social proof is an L121-2/L121-4
// exposure and a Google structured-data manual-action risk.
function TrustSection() {
  const t = useTranslations('landing');
  const items = [
    { icon: <ShieldIcon size={22} color="#E57A97" />, title: t('trust.warranty'), body: t('trust.warrantySub') },
    { icon: <CoinIcon size={22} color="#E57A97" />, title: t('trust.noSubscription'), body: t('trust.noSubscriptionSub') },
    { icon: <CardIcon size={22} color="#E57A97" />, title: t('trust.stripe'), body: t('trust.stripeSub') },
    { icon: <UsersIcon size={22} color="#E57A97" />, title: t('trust.directPayout'), body: t('trust.directPayoutSub') },
    { icon: <BuildingIcon size={22} color="#E57A97" />, title: t('trust.frenchCompany'), body: t('trust.frenchCompanySub') },
    { icon: <GlobeIcon size={22} color="#E57A97" />, title: t('trust.euData'), body: t('trust.euDataSub') },
  ];
  return (
    <section id="engagements" style={{ background: '#f9f9f7', padding: 'clamp(60px,7vw,90px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 48, maxWidth: 660, marginInline: 'auto' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#E57A97', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{t('trust.kicker')}</div>
            <h2 style={{ fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.04em', marginBottom: 14 }}>{t('trust.title')}</h2>
            <p style={{ fontSize: 15.5, color: '#74748a', lineHeight: 1.65 }}>{t('trust.sub')}</p>
          </div>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {items.map((it, i) => (
            <Reveal key={i} delay={i * 50}>
              <div className="land-card-hover" style={{ height: '100%', background: '#fff', border: '1.5px solid #e4e4ec', borderRadius: 14, padding: '22px 22px 24px' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FEF1F4', border: '1px solid #FBDAE3', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  {it.icon}
                </div>
                <div style={{ fontSize: 15.5, fontWeight: 800, color: '#111118', marginBottom: 7, letterSpacing: '-0.01em' }}>{it.title}</div>
                <p style={{ fontSize: 13.5, color: '#74748a', lineHeight: 1.65 }}>{it.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA ("Pas encore convaincu?") ──────────────────────────────────────
function FinalCTASection({ onOrderClick }: { onOrderClick: () => void }) {
  const t = useTranslations('landing');
  return (
    <section style={{ background: 'linear-gradient(135deg,#B03860,#E57A97,#EC97B0)', padding: 'clamp(70px,8vw,100px) clamp(16px,4vw,48px)', textAlign: 'center' }}>
      <Reveal>
        <div style={{ maxWidth: 620, margin: '0 auto' }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(255,255,255,0.15)', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageIcon size={28} color="#fff" />
          </div>
          <h2 style={{ fontSize: 'clamp(28px,4.5vw,52px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.04em', lineHeight: 0.97, marginBottom: 14 }}>
            {t('finalCta.title')}
          </h2>
          <p style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.92)', marginBottom: 18 }}>{t('finalCta.sub')}</p>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', marginBottom: 36, lineHeight: 1.7 }}>{t('finalCta.body')}</p>
          <button onClick={onOrderClick} className="btn-accent" style={{ padding: '17px 44px', borderRadius: 13, cursor: 'pointer', background: '#fff', color: '#E57A97', fontSize: 17, fontWeight: 900, border: 'none', boxShadow: '0 6px 28px rgba(0,0,0,0.22)', letterSpacing: '-0.01em' }}>
            {t('finalCta.cta')} →
          </button>
        </div>
      </Reveal>
    </section>
  );
}

// ─── Pricing transparency ─────────────────────────────────────────────────────
function PricingTransparencySection() {
  const t = useTranslations('landing');
  const rows: { label: string; amount: string; detail: string; color: string }[] = [
    { label: t('pricing.row1label'), amount: t('pricing.row1amount'), detail: t('pricing.row1detail'), color: '#16a34a' },
    { label: t('pricing.row2label'), amount: t('pricing.row2amount'), detail: t('pricing.row2detail'), color: '#74748a' },
    { label: t('pricing.row3label'), amount: t('pricing.row3amount'), detail: t('pricing.row3detail'), color: '#E57A97' },
  ];
  return (
    <section style={{ background: '#f9f9f7', padding: 'clamp(60px,7vw,90px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#E57A97', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{t('pricing.kicker')}</div>
            <h2 style={{ fontSize: 'clamp(24px,3vw,36px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.04em', marginBottom: 10 }}>{t('pricing.title')}</h2>
            <p style={{ fontSize: 15, color: '#74748a', lineHeight: 1.7 }}>{t('pricing.sub')}</p>
          </div>
        </Reveal>
        <Reveal delay={60}>
          <div style={{ background: '#fff', border: '1.5px solid #e4e4ec', borderRadius: 20, overflow: 'hidden' }}>
            {rows.map((row, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px', gap: 16, borderBottom: i < rows.length - 1 ? '1px solid #f0f0f5' : 'none', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111118' }}>{row.label}</div>
                    <div style={{ fontSize: 13, color: '#74748a', marginTop: 2 }}>{row.detail}</div>
                  </div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: row.color, letterSpacing: '-0.03em', flexShrink: 0 }}>{row.amount}</div>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={100}>
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13.5, color: '#74748a' }}>
            {t('pricing.footer')} <span style={{ color: '#E57A97' }}>♥</span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────
function FAQSection() {
  const t = useTranslations('landing');
  const items = [
    { q: t('faq.q1'), a: t('faq.a1') },
    { q: t('faq.q2'), a: t('faq.a2') },
    { q: t('faq.q3'), a: t('faq.a3') },
    { q: t('faq.q4'), a: t('faq.a4') },
    { q: t('faq.q5'), a: t('faq.a5') },
    { q: t('faq.q6'), a: t('faq.a6') },
    { q: t('faq.q7'), a: t('faq.a7') },
  ];
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section id="faq" style={{ background: '#fff', padding: 'clamp(60px,7vw,90px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#E57A97', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{t('faq.kicker')}</div>
            <h2 style={{ fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.04em' }}>{t('faq.title')}</h2>
          </div>
        </Reveal>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item, i) => (
            <Reveal key={i} delay={i * 35}>
              <div style={{ border: '1.5px solid #e4e4ec', borderRadius: 14, overflow: 'hidden', background: '#fff', transition: 'border-color 200ms', ...(open === i ? { borderColor: '#FBDAE3' } : {}) }}>
                <button onClick={() => setOpen(open === i ? null : i)} style={{ width: '100%', padding: '18px 20px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', gap: 16 }}>
                  <span style={{ fontSize: 15.5, fontWeight: 700, color: '#111118', lineHeight: 1.4 }}>{item.q}</span>
                  <span style={{ fontSize: 20, color: '#E57A97', transition: 'transform 200ms', transform: open === i ? 'rotate(45deg)' : 'none', flexShrink: 0, lineHeight: 1 }}>+</span>
                </button>
                <div className={`acc-panel${open === i ? ' is-open' : ''}`}>
                  <div>
                    <div style={{ padding: '14px 20px 20px', fontSize: 14.5, color: '#74748a', lineHeight: 1.8, borderTop: '1px solid #f0f0f0' }}>
                      {item.a}
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Double guarantee ─────────────────────────────────────────────────────────
function DoubleGuaranteeSection() {
  const t = useTranslations('landing');
  const items: { icon: React.ReactNode; title: string; body: string; accent: string }[] = [
    { icon: <ShieldIcon size={20} color="#E57A97" />, title: t('doubleGuarantee.g1title'), body: t('doubleGuarantee.g1body'), accent: '#E57A97' },
    { icon: <RefreshIcon size={20} color="#16a34a" />, title: t('doubleGuarantee.g2title'), body: t('doubleGuarantee.g2body'), accent: '#16a34a' },
    { icon: <TruckIcon size={20} color="#2563eb" />, title: t('doubleGuarantee.g3title'), body: t('doubleGuarantee.g3body'), accent: '#2563eb' },
    { icon: <CardIcon size={20} color="#d97706" />, title: t('doubleGuarantee.g4title'), body: t('doubleGuarantee.g4body'), accent: '#d97706' },
  ];
  return (
    <section style={{ background: '#f9f9f7', padding: 'clamp(48px,5vw,70px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
        {items.map((item, i) => (
          <Reveal key={i} delay={i * 60}>
            <div className="land-card-hover" style={{ background: '#fff', border: '1.5px solid #e4e4ec', borderRadius: 16, padding: '24px 22px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${item.accent}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{item.icon}</div>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: '#111118', marginBottom: 6, letterSpacing: '-0.01em' }}>{item.title}</h3>
                <p style={{ fontSize: 13, color: '#74748a', lineHeight: 1.65 }}>{item.body}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function FooterSection() {
  const t = useTranslations('landing');
  const tc = useTranslations('common');
  return (
    <footer style={{ background: '#0d0d1a', color: 'rgba(255,255,255,0.62)', padding: 'clamp(40px,5vw,60px) clamp(16px,4vw,48px) 28px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 32, marginBottom: 40 }}>
          <div>
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontFamily: 'var(--font-poppins), sans-serif', fontWeight: 800, fontSize: 18, color: '#fff', letterSpacing: '-0.02em' }}>DigiTip</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.75, maxWidth: 180 }}>{t('footer.tagline')}</p>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 16 }}>{t('footer.links')}</div>
            {[
              { label: t('grid.kicker'), href: '#packs' },
              { label: t('howItWorks.kicker'), href: '#comment-ca-marche' },
              { label: t('faq.kicker'), href: '#faq' },
              { label: tc('contact'), href: '/contact' },
            ].map((l) => (
              <a key={l.href} href={l.href} className="land-footer-link" style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.55)', textDecoration: 'none', marginBottom: 9, transition: 'color 150ms' }}>{l.label}</a>
            ))}
          </div>
          {/* Content hubs. Without these the guides, trade pages and
              comparisons are orphans: reachable only from the sitemap, so they
              receive no internal link equity and get crawled far less often.
              Internal links from the homepage are the cheapest ranking factor
              available and the easiest one to forget. */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 16 }}>{t('footer.resources')}</div>
            {[
              { label: t('footer.guides'),      href: '/guides' },
              { label: t('footer.solutions'),   href: '/solutions' },
              { label: t('footer.comparatifs'), href: '/comparatif' },
              { label: t('footer.about'),       href: '/a-propos' },
            ].map((l) => (
              <Link key={l.href} href={l.href} className="land-footer-link" style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.55)', textDecoration: 'none', marginBottom: 9, transition: 'color 150ms' }}>{l.label}</Link>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 16 }}>{t('footer.legal')}</div>
            {[
              { label: tc('mentionsLegales'), href: '/mentions-legales' },
              { label: tc('cgv'),             href: '/cgv' },
              { label: tc('terms'),           href: '/terms' },
              { label: tc('privacy'),         href: '/privacy' },
            ].map((l) => (
              <Link key={l.href} href={l.href} className="land-footer-link" style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.55)', textDecoration: 'none', marginBottom: 9, transition: 'color 150ms' }}>{l.label}</Link>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 16 }}>{t('footer.payment')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['VISA', 'MC', 'AMEX', 'Apple Pay', 'Google Pay', 'CB'].map((p) => (
                <span key={p} style={{ padding: '5px 9px', borderRadius: 6, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: '0.02em' }}>{p}</span>
              ))}
              <span style={{ padding: '5px 9px', borderRadius: 6, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', display: 'inline-flex', alignItems: 'center' }}>
                <svg width="34" height="14" viewBox="0 0 60 25" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Stripe">
                  <path d="M8.656 9.682c0-.638.524-1.25 1.56-1.25 1.387 0 2.812.444 4.2 1.138V5.608C12.874 4.94 11.304 4.67 9.734 4.67 5.978 4.67 3.5 6.748 3.5 9.876c0 4.89 6.738 4.114 6.738 6.222 0 .75-.654 1.25-1.75 1.25-1.512 0-3.448-.624-4.978-1.472v3.988c1.694.734 3.406 1.046 4.978 1.046 3.842 0 6.496-1.902 6.496-5.08-.016-5.28-6.328-4.348-6.328-6.148zM24.25 4.67c-2.52 0-4.13 1.194-4.13 3.188V20.91h4.354V8.888h2.618V5.07h-2.618V2h-4.354v2.67h4.13zM32.5 6.53l-.27-1.46h-3.904v15.84h4.354V10.26c1.028-1.346 2.772-1.1 3.318-.908V5.07c-.564-.208-2.618-.556-3.498 1.46zM37.5 20.91h4.354V5.07H37.5v15.84zM37.5 3.62h4.354V0H37.5v3.62zM48.736 4.67c-4.424 0-7.018 3.72-7.018 8.22 0 4.582 2.642 8.12 7.234 8.12 2.076 0 3.654-.57 4.806-1.53v-3.47c-1.06.832-2.316 1.336-3.836 1.336-1.96 0-3.178-1.032-3.506-2.658h8.184c.024-.278.04-.556.04-.846-.008-4.668-2.31-7.172-5.904-7.172zm-2.388 6.504c.272-1.668 1.32-2.7 2.604-2.7 1.26 0 2.228.986 2.42 2.7h-5.024z" fill="rgba(255,255,255,0.5)"/>
                </svg>
              </span>
            </div>
          </div>
        </div>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 24 }} />
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>{t('footer.copyright')}</div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
/**
 * The landing page body.
 *
 * Pricing arrives as a prop, resolved on the server by app/[locale]/page.tsx.
 * It used to be fetched in a useEffect, which meant prices were absent from
 * the initial HTML — a client round-trip on the LCP path, and no real price
 * available to emit as Product/Offer schema.
 */
export function LandingPage({ pricing }: { pricing: PricingMap | null }) {
  const t = useTranslations('landing');
  const locale = useLocale();
  const [cartPack, setCartPack] = useState<'solo' | 'duo' | null>(null);
  const openCart = (pack: 'solo' | 'duo' = 'duo') => setCartPack(pack);


  return (
    <div style={{ ...LIGHT, minHeight: '100vh', fontFamily: 'var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)' }}>
      <PromoBanner />
      <Header onOrderClick={() => openCart()} />
      <HeroSection onOrderClick={() => openCart()} />
      <StatsStrip />
      <KeyAdvantagesSection />
      <ProductSection onOrderClick={openCart} pricing={pricing} />
      <HowItWorksSection />
      <ShippingSection />
      <GuaranteeSection />
      <ProductGridSection onOrderClick={openCart} pricing={pricing} />
      <TrustSection />
      <FinalCTASection onOrderClick={() => openCart()} />
      <PricingTransparencySection />
      <FAQSection />
      <DoubleGuaranteeSection />
      <FooterSection />
      <StickyMobileCTA onOrderClick={() => openCart()} />

      {cartPack && <BuyModal pack={cartPack} onClose={() => setCartPack(null)} pricing={pricing} />}
    </div>
  );
}
