'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import Image from 'next/image';
import { ProductCard } from '@/components/landing/ProductCard';
import { BuyModal } from '@/components/landing/BuyModal';

// ─── Light theme ──────────────────────────────────────────────────────────────
const LIGHT: React.CSSProperties = {
  '--lbg': '#f9f9f7',
  '--lsurface': '#ffffff',
  '--ltext': '#111118',
  '--ltext-2': '#3a3b4f',
  '--lmuted': '#74748a',
  '--laccent': '#7c3aed',
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

function Badge({ children, variant = 'accent' }: { children: React.ReactNode; variant?: 'accent' | 'success' | 'warn' }) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    accent: { bg: '#f5f3ff', text: '#7c3aed', border: '#e9d5ff' },
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


// ─── PromoBanner ──────────────────────────────────────────────────────────────
function PromoBanner({ text }: { text: string }) {
  return (
    <div style={{ background: 'linear-gradient(90deg,#6d28d9,#7c3aed,#8b5cf6)', color: '#fff', textAlign: 'center', padding: '9px 16px', fontSize: 13, fontWeight: 600, letterSpacing: '0.01em', position: 'sticky', top: 0, zIndex: 300 }}>
      {text}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header({ onOrderClick }: { onOrderClick: () => void }) {
  const t = useTranslations('landing');
  const tc = useTranslations('common');
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);
  return (
    <header style={{ position: 'sticky', top: 38, zIndex: 200, height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 clamp(16px, 4vw, 48px)', background: scrolled ? 'rgba(255,255,255,0.96)' : '#fff', backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: '1px solid #e4e4ec', transition: 'background 300ms' }}>
      <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
        <span style={{ fontFamily: 'var(--font-poppins), sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', color: '#111118' }}>DigiTip</span>
      </Link>

      <nav style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        {[
          { key: 'packs', href: '#packs' },
          { key: 'clients', href: '#clients' },
          { key: 'faq', href: '#faq' },
          { key: 'contact', href: '/contact' },
        ].map(({ key, href }) => (
          <a key={key} href={href} style={{ padding: '6px 14px', textDecoration: 'none', color: '#74748a', fontSize: 13.5, fontWeight: 500, borderRadius: 7, transition: 'color 150ms' }}>
            {t(`nav.${key}` as Parameters<typeof t>[0])}
          </a>
        ))}
      </nav>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <LanguageSwitcher />
        <Link href="/login" style={{ padding: '7px 16px', borderRadius: 8, textDecoration: 'none', border: '1px solid #e4e4ec', color: '#3a3b4f', fontSize: 13, fontWeight: 500, background: '#fff' }}>{tc('login')}</Link>
        <button onClick={onOrderClick} style={{ padding: '8px 20px', borderRadius: 9, cursor: 'pointer', background: '#7c3aed', color: '#fff', fontSize: 13.5, fontWeight: 700, border: 'none', boxShadow: '0 2px 16px rgba(124,58,237,0.38)', transition: 'all 140ms' }}>
          {t('hero.cta')} →
        </button>
      </div>
    </header>
  );
}

// ─── Hero (split layout: text left + product visual right) ───────────────────
function HeroSection({ onOrderClick }: { onOrderClick: () => void }) {
  const t = useTranslations('landing');
  return (
    <section style={{ background: '#fff', padding: 'clamp(60px,8vw,100px) clamp(16px,5vw,60px) clamp(40px,5vw,70px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 48, flexWrap: 'wrap' }}>

        {/* Left: text */}
        <div style={{ maxWidth: 580, flex: '1 1 320px' }}>
          <div className="fade-up" style={{ marginBottom: 22 }}>
            <Badge>{t('hero.badge')}</Badge>
          </div>
          <h1 className="fade-up" style={{ fontSize: 'clamp(38px, 5.5vw, 72px)', fontWeight: 900, lineHeight: 0.96, letterSpacing: '-0.04em', color: '#111118', marginBottom: 22, animationDelay: '60ms' }}>
            {t('hero.h1a')}<br />{t('hero.h1b')}<br />
            <span style={{ color: '#7c3aed' }}>{t('hero.h1c')}</span>
          </h1>
          <p className="fade-up" style={{ fontSize: 16.5, color: '#74748a', lineHeight: 1.8, maxWidth: 480, marginBottom: 32, animationDelay: '130ms' }}>
            {t('hero.sub')}
          </p>
          <div className="fade-up" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 32, animationDelay: '200ms' }}>
            <button onClick={onOrderClick} style={{ padding: '15px 32px', borderRadius: 11, cursor: 'pointer', background: '#7c3aed', color: '#fff', fontSize: 16, fontWeight: 800, border: 'none', boxShadow: '0 4px 24px rgba(124,58,237,0.42)', transition: 'all 140ms' }}>
              {t('hero.cta')} →
            </button>
            <a href="#comment-ca-marche" style={{ padding: '15px 24px', borderRadius: 11, textDecoration: 'none', border: '1.5px solid #e4e4ec', color: '#3a3b4f', fontSize: 15, fontWeight: 600, background: '#fff', display: 'inline-flex', alignItems: 'center' }}>
              {t('howItWorks.title')}
            </a>
          </div>
          <div className="fade-up" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', animationDelay: '280ms' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 18, letterSpacing: 2, color: '#f59e0b' }}>★★★★★</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#111118' }}>4.8</span>
              <span style={{ fontSize: 13, color: '#74748a' }}>/ 5</span>
            </div>
            <span style={{ color: '#e4e4ec' }}>·</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#74748a' }}>{t('hero.social')}</span>
            <span style={{ color: '#e4e4ec' }}>·</span>
            <span style={{ fontSize: 17 }}>{t('hero.countries')}</span>
          </div>
        </div>

        {/* Right: product visual */}
        <div className="fade-up" style={{ flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', animationDelay: '160ms' }}>
          <div style={{ position: 'relative', width: 300, height: 340 }}>
            <div style={{ width: 300, height: 300, borderRadius: 24, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.06)', position: 'relative' }}>
              <Image src="/products/duo-double.jpg" alt="Plaques époxy NFC Digitip" fill sizes="300px" style={{ objectFit: 'cover' }} priority />
            </div>
            <div style={{ position: 'absolute', bottom: 0, right: -10, background: '#fff', border: '1.5px solid #e4e4ec', borderRadius: 14, padding: '10px 14px', boxShadow: '0 8px 28px rgba(0,0,0,0.10)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>📲</div>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#111118' }}>+5,00 €</div>
                <div style={{ fontSize: 10, color: '#74748a' }}>→ Léa C.</div>
              </div>
            </div>
            <div style={{ position: 'absolute', top: -12, right: 10, background: '#fff', border: '1.5px solid #e4e4ec', borderRadius: 10, padding: '6px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: 12, fontWeight: 700, color: '#d97706' }}>
              ★★★★★ 4.8
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Stats strip ──────────────────────────────────────────────────────────────
function StatsStrip() {
  const stats = [
    { n: '400+', label: 'équipes actives' },
    { n: '4.8/5', label: '+150 avis vérifiés' },
    { n: '3 sec', label: 'pour recevoir un pourboire' },
    { n: '0 €', label: 'frais mensuel' },
  ];
  return (
    <div style={{ background: '#f9f9f7', borderBottom: '1px solid #e4e4ec', padding: '0 clamp(16px,4vw,48px)' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
        {stats.map((s, i) => (
          <div key={i} style={{ flex: '1 1 140px', padding: '20px 16px', textAlign: 'center', borderRight: i < stats.length - 1 ? '1px solid #e4e4ec' : 'none' }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#111118', letterSpacing: '-0.04em', lineHeight: 1 }}>{s.n}</div>
            <div style={{ fontSize: 12.5, color: '#74748a', marginTop: 4, fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Marquee ──────────────────────────────────────────────────────────────────
const VENUES = ['Salon Éclat Beauté', 'L\'Atelier Coiffure', 'Institut Harmonie', 'Coupe & Style', 'Beauty Lab Paris', 'The Hair Studio', 'Ô Beauté', 'Nails & Co.', 'Salon Lumière', 'Spa Sérénité', 'L\'Artiste Coiffure', 'Glam Institut'];

function Marquee() {
  const items = [...VENUES, ...VENUES];
  return (
    <div style={{ overflow: 'hidden', borderBottom: '1px solid #e4e4ec', padding: '13px 0', background: '#fff', WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)', maskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)' }}>
      <div style={{ display: 'flex', animation: 'marqueeScroll 32s linear infinite', width: 'max-content' }}>
        {items.map((v, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '0 18px', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#c4c4d4', letterSpacing: '0.01em' }}>{v}</span>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#e4e4ec', flexShrink: 0, display: 'inline-block' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Claim section (doublez + 3 secondes) ─────────────────────────────────────
function ClaimSection() {
  const t = useTranslations('landing');
  return (
    <section style={{ background: '#f9f9f7', padding: 'clamp(60px,7vw,90px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        <Reveal>
          <div style={{ background: '#fff', border: '1.5px solid #e4e4ec', borderRadius: 20, padding: '44px 40px', borderTop: '4px solid #7c3aed' }}>
            <div style={{ fontSize: 56, fontWeight: 900, color: '#7c3aed', letterSpacing: '-0.05em', lineHeight: 1, marginBottom: 12 }}>3s</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: '#111118', letterSpacing: '-0.02em', marginBottom: 10 }}>
              {t('claim.title')} <span style={{ color: '#7c3aed' }}>{t('claim.titleAccent')}</span>
            </div>
            <p style={{ fontSize: 14.5, color: '#74748a', lineHeight: 1.7 }}>{t('claim.sub')}</p>
          </div>
        </Reveal>
        <Reveal delay={100}>
          <div style={{ background: '#7c3aed', borderRadius: 20, padding: '44px 40px', borderTop: '4px solid #5b21b6', color: '#fff' }}>
            <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1, marginBottom: 12, color: '#e9d5ff' }}>×2</div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 10 }}>
              {t('claim.claim2title')} <span style={{ color: '#e9d5ff' }}>{t('claim.claim2sub')}</span>
            </div>
            <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.72)', lineHeight: 1.7 }}>{t('claim.sub')}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─── Product section (Digifeel-style full e-commerce) ─────────────────────────
function ProductSection({ onOrderClick }: { onOrderClick: (p: 'solo' | 'duo') => void }) {
  const t = useTranslations('landing');
  return (
    <section id="produit" style={{ background: '#fff', padding: 'clamp(60px,7vw,90px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto' }}>
        <Reveal style={{ marginBottom: 44 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 8 }}>{t('product.kicker')}</div>
              <h2 style={{ fontSize: 'clamp(26px,3.5vw,40px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.04em', lineHeight: 1 }}>{t('product.name')}</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, color: '#f59e0b', letterSpacing: 2 }}>★★★★★</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#111118' }}>{t('product.rating')}</span>
              <span style={{ fontSize: 13, color: '#74748a' }}>{t('product.reviewCount')}</span>
            </div>
          </div>
        </Reveal>
        <Reveal delay={60}>
          <ProductCard onAddToCart={onOrderClick} locale="fr" />
        </Reveal>
      </div>
    </section>
  );
}

// ─── How it works ─────────────────────────────────────────────────────────────
function HowItWorksSection() {
  const t = useTranslations('landing');
  const steps = [
    { n: '01', title: t('howItWorks.step1t'), body: t('howItWorks.step1b'), icon: '📦' },
    { n: '02', title: t('howItWorks.step2t'), body: t('howItWorks.step2b'), icon: '⚡' },
    { n: '03', title: t('howItWorks.step3t'), body: t('howItWorks.step3b'), icon: '💸' },
  ];
  return (
    <section id="comment-ca-marche" style={{ background: '#f9f9f7', padding: 'clamp(60px,7vw,90px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{t('howItWorks.kicker')}</div>
            <h2 style={{ fontSize: 'clamp(26px,3.5vw,42px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.04em' }}>{t('howItWorks.title')}</h2>
            <p style={{ fontSize: 15, color: '#74748a', marginTop: 12, maxWidth: 460, margin: '12px auto 0' }}>{t('howItWorks.sub')}</p>
          </div>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 4 }}>
          {steps.map((s, i) => (
            <Reveal key={i} delay={i * 80}>
              <div style={{ padding: '32px 28px', position: 'relative' }}>
                {i < steps.length - 1 && (
                  <div style={{ position: 'absolute', top: 52, right: -2, width: 24, height: 2, background: '#e4e4ec', display: 'none' }} />
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: '#f5f3ff', border: '1.5px solid #e9d5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{s.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#7c3aed' }}>{s.n}</div>
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
  const items = [
    { icon: '⚡', text: t('shipping.processing') },
    { icon: '🚀', text: t('shipping.freeEU') },
    { icon: '🇫🇷', text: t('shipping.timezoneFR') },
    { icon: '🌍', text: t('shipping.timezoneEU') },
    { icon: '📦', text: t('shipping.tracking') },
  ];
  return (
    <section style={{ background: '#fff', padding: 'clamp(48px,5vw,70px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{t('shipping.kicker')}</div>
          <h2 style={{ fontSize: 'clamp(22px,2.8vw,34px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.03em' }}>{t('shipping.title')}</h2>
        </Reveal>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          {items.map((item, i) => (
            <Reveal key={i} delay={i * 50}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f9f9f7', border: '1.5px solid #e4e4ec', borderRadius: 12, padding: '14px 22px', fontSize: 14, color: '#3a3b4f', fontWeight: 600 }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>{item.text}
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
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center', background: '#fff', border: '2px solid #e9d5ff', borderRadius: 24, padding: 'clamp(32px,5vw,56px) clamp(24px,5vw,56px)' }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: '#f5f3ff', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🛡️</div>
          <h2 style={{ fontSize: 'clamp(20px,2.5vw,28px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.03em', marginBottom: 14 }}>{t('guarantee.title')}</h2>
          <p style={{ fontSize: 15, color: '#74748a', lineHeight: 1.8 }}>{t('guarantee.sub')}</p>
        </div>
      </Reveal>
    </section>
  );
}

// ─── Press ────────────────────────────────────────────────────────────────────
function PressSection() {
  const t = useTranslations('landing');
  const logos = [
    { text: t('press.p1'), emoji: '📺' },
    { text: t('press.p2'), emoji: '📰' },
    { text: t('press.p3'), emoji: '📰' },
    { text: t('press.p4'), emoji: '🏨' },
  ];
  return (
    <section style={{ background: '#fff', padding: 'clamp(40px,4vw,56px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#c4c4d4', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 24 }}>{t('press.kicker')}</p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
          {logos.map((l) => (
            <div key={l.text} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', border: '1.5px solid #e4e4ec', borderRadius: 12, background: '#f9f9f7', fontSize: 14, fontWeight: 700, color: '#74748a', letterSpacing: '0.04em' }}>
              <span>{l.emoji}</span>{l.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Product grid ─────────────────────────────────────────────────────────────
function ProductGridSection({ onOrderClick }: { onOrderClick: (p: 'solo' | 'duo') => void }) {
  const t = useTranslations('landing');
  const packs = [
    { key: 'solo' as const, name: t('grid.packS'), tags: t('grid.packSTag'), price: t('grid.packSPrice'), full: t('grid.packSFull'), save: '22%' },
    { key: 'duo'  as const, name: t('grid.packM'), tags: t('grid.packMTag'), price: t('grid.packMPrice'), full: t('grid.packMFull'), save: '28%', popular: true },
  ];
  return (
    <section id="packs" style={{ background: '#f9f9f7', padding: 'clamp(60px,7vw,90px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{t('grid.kicker')}</div>
            <h2 style={{ fontSize: 'clamp(26px,3.5vw,42px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.04em' }}>{t('grid.title')}</h2>
            <p style={{ fontSize: 15, color: '#74748a', marginTop: 10 }}>{t('grid.sub')}</p>
          </div>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
          {packs.map((p, i) => (
            <Reveal key={p.key} delay={i * 80}>
              <div style={{ background: '#fff', border: p.popular ? '2px solid #7c3aed' : '1.5px solid #e4e4ec', borderRadius: 18, overflow: 'hidden', boxShadow: p.popular ? '0 8px 32px rgba(124,58,237,0.14)' : '0 2px 8px rgba(0,0,0,0.04)', position: 'relative' }}>
                {p.popular && (
                  <div style={{ position: 'absolute', top: 14, right: 14, background: '#7c3aed', color: '#fff', fontSize: 10.5, fontWeight: 800, padding: '4px 12px', borderRadius: 20, letterSpacing: '0.04em' }}>{t('grid.popular')}</div>
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
                  <div style={{ position: 'absolute', top: 10, left: 10, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 800, color: '#d97706' }}>
                    ÉCONOMISEZ {p.save}
                  </div>
                </div>
                {/* Info */}
                <div style={{ padding: '20px 22px 24px' }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111118', letterSpacing: '-0.02em', marginBottom: 4 }}>{p.name}</h3>
                  <p style={{ fontSize: 13, color: '#74748a', marginBottom: 14 }}>{p.tags}</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
                    <span style={{ fontSize: 24, fontWeight: 900, color: '#111118', letterSpacing: '-0.03em' }}>{p.price}</span>
                    <span style={{ fontSize: 14, color: '#c4c4d4', textDecoration: 'line-through', fontWeight: 500 }}>{p.full}</span>
                  </div>
                  <button onClick={() => onOrderClick(p.key)} style={{ width: '100%', padding: '12px', borderRadius: 10, cursor: 'pointer', background: p.popular ? '#7c3aed' : '#111118', color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', transition: 'all 140ms' }}>
                    {t('grid.choose')} →
                  </button>
                </div>
              </div>
            </Reveal>
          ))}
          {/* Custom pack */}
          <Reveal delay={3 * 80}>
            <div style={{ background: '#fff', border: '1.5px dashed #e4e4ec', borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ background: '#f9f9f7', padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <div style={{ fontSize: 48 }}>🏢</div>
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
function PlacementsSection() {
  const t = useTranslations('landing');
  const items = [
    { img: '/products/solo-table.jpg', title: t('placements.p1'), sub: t('placements.p1sub') },
    { img: '/products/solo-3d.jpg',    title: t('placements.p2'), sub: t('placements.p2sub') },
    { img: '/products/solo-wall.jpg',  title: t('placements.p3'), sub: t('placements.p3sub') },
    { img: '/products/duo-double.jpg', title: t('placements.p4'), sub: t('placements.p4sub') },
  ];
  return (
    <section style={{ background: '#fff', padding: 'clamp(60px,7vw,90px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{t('placements.kicker')}</div>
            <h2 style={{ fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.04em' }}>{t('placements.title')}</h2>
          </div>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {items.map((item, i) => (
            <Reveal key={i} delay={i * 70}>
              <div style={{ borderRadius: 18, overflow: 'hidden', border: '1.5px solid #e4e4ec' }}>
                <div style={{ position: 'relative', height: 160 }}>
                  <Image src={item.img} alt={item.title} fill sizes="280px" style={{ objectFit: 'cover' }} />
                </div>
                <div style={{ background: '#fff', padding: '18px 20px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 800, color: '#111118', marginBottom: 6, letterSpacing: '-0.01em' }}>{item.title}</h3>
                  <p style={{ fontSize: 13, color: '#74748a', lineHeight: 1.6 }}>{item.sub}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────
function TestimonialsSection() {
  const t = useTranslations('landing');
  const cards = [
    { name: t('testimonials.t1name'), role: t('testimonials.t1role'), quote: t('testimonials.t1quote'), accent: '#7c3aed' },
    { name: t('testimonials.t2name'), role: t('testimonials.t2role'), quote: t('testimonials.t2quote'), accent: '#16a34a' },
    { name: t('testimonials.t3name'), role: t('testimonials.t3role'), quote: t('testimonials.t3quote'), accent: '#d97706' },
  ];
  return (
    <section id="clients" style={{ background: '#f9f9f7', padding: 'clamp(60px,7vw,90px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{t('testimonials.kicker')}</div>
            <h2 style={{ fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.04em' }}>{t('testimonials.title')}</h2>
          </div>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 16 }}>
          {cards.map((c, i) => (
            <Reveal key={i} delay={i * 80}>
              <div style={{ background: '#fff', border: '1.5px solid #e4e4ec', borderRadius: 18, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: 4, background: c.accent }} />
                <div style={{ padding: '24px 24px 28px', flex: 1 }}>
                  <div style={{ fontSize: 18, letterSpacing: 2, color: '#f59e0b', marginBottom: 16 }}>★★★★★</div>
                  <p style={{ fontSize: 14.5, color: '#3a3b4f', lineHeight: 1.8, fontStyle: 'italic', marginBottom: 20 }}>
                    &ldquo;{c.quote}&rdquo;
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                      {c.name[0]}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#111118' }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: '#74748a', marginTop: 1 }}>{c.role}</div>
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

// ─── Final CTA ("Pas encore convaincu?") ──────────────────────────────────────
function FinalCTASection({ onOrderClick }: { onOrderClick: () => void }) {
  const t = useTranslations('landing');
  return (
    <section style={{ background: 'linear-gradient(135deg,#5b21b6,#7c3aed,#8b5cf6)', padding: 'clamp(70px,8vw,100px) clamp(16px,4vw,48px)', textAlign: 'center' }}>
      <Reveal>
        <div style={{ maxWidth: 620, margin: '0 auto' }}>
          <div style={{ fontSize: 44, marginBottom: 18 }}>🤔</div>
          <h2 style={{ fontSize: 'clamp(28px,4.5vw,52px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.04em', lineHeight: 0.97, marginBottom: 14 }}>
            {t('finalCta.title')}
          </h2>
          <p style={{ fontSize: 22, fontWeight: 700, color: '#e9d5ff', marginBottom: 18 }}>{t('finalCta.sub')}</p>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.72)', marginBottom: 36, lineHeight: 1.7 }}>{t('finalCta.body')}</p>
          <button onClick={onOrderClick} style={{ padding: '17px 44px', borderRadius: 13, cursor: 'pointer', background: '#fff', color: '#7c3aed', fontSize: 17, fontWeight: 900, border: 'none', boxShadow: '0 6px 28px rgba(0,0,0,0.22)', letterSpacing: '-0.01em' }}>
            {t('finalCta.cta')} →
          </button>
        </div>
      </Reveal>
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
  ];
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section id="faq" style={{ background: '#fff', padding: 'clamp(60px,7vw,90px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{t('faq.kicker')}</div>
            <h2 style={{ fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.04em' }}>{t('faq.title')}</h2>
          </div>
        </Reveal>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item, i) => (
            <Reveal key={i} delay={i * 35}>
              <div style={{ border: '1.5px solid #e4e4ec', borderRadius: 14, overflow: 'hidden', background: '#fff', transition: 'border-color 200ms', ...(open === i ? { borderColor: '#e9d5ff' } : {}) }}>
                <button onClick={() => setOpen(open === i ? null : i)} style={{ width: '100%', padding: '18px 20px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', gap: 16 }}>
                  <span style={{ fontSize: 15.5, fontWeight: 700, color: '#111118', lineHeight: 1.4 }}>{item.q}</span>
                  <span style={{ fontSize: 20, color: '#7c3aed', transition: 'transform 200ms', transform: open === i ? 'rotate(45deg)' : 'none', flexShrink: 0, lineHeight: 1 }}>+</span>
                </button>
                {open === i && (
                  <div style={{ padding: '0 20px 20px', fontSize: 14.5, color: '#74748a', lineHeight: 1.8, borderTop: '1px solid #f0f0f0' }}>
                    <div style={{ paddingTop: 14 }}>{item.a}</div>
                  </div>
                )}
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
  const items = [
    { icon: '🛡️', title: t('doubleGuarantee.g1title'), body: t('doubleGuarantee.g1body'), accent: '#7c3aed' },
    { icon: '🔁', title: t('doubleGuarantee.g2title'), body: t('doubleGuarantee.g2body'), accent: '#16a34a' },
    { icon: '🚚', title: t('doubleGuarantee.g3title'), body: t('doubleGuarantee.g3body'), accent: '#2563eb' },
    { icon: '💳', title: t('doubleGuarantee.g4title'), body: t('doubleGuarantee.g4body'), accent: '#d97706' },
  ];
  return (
    <section style={{ background: '#f9f9f7', padding: 'clamp(48px,5vw,70px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
        {items.map((item, i) => (
          <Reveal key={i} delay={i * 60}>
            <div style={{ background: '#fff', border: '1.5px solid #e4e4ec', borderRadius: 16, padding: '24px 22px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${item.accent}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{item.icon}</div>
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
    <footer style={{ background: '#0d0d1a', color: 'rgba(255,255,255,0.45)', padding: 'clamp(40px,5vw,60px) clamp(16px,4vw,48px) 28px' }}>
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
              <a key={l.href} href={l.href} style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.4)', textDecoration: 'none', marginBottom: 9, transition: 'color 150ms' }}>{l.label}</a>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 16 }}>{t('footer.legal')}</div>
            {[
              { label: tc('privacy'), href: '/legal/privacy' },
              { label: tc('terms'), href: '/legal/terms' },
            ].map((l) => (
              <Link key={l.href} href={l.href} style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.4)', textDecoration: 'none', marginBottom: 9 }}>{l.label}</Link>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 16 }}>{t('footer.payment')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {/* Payment method badges with card-style */}
              {['VISA', 'MC', 'AMEX', 'Apple Pay', 'Google Pay', 'CB'].map((p) => (
                <span key={p} style={{ padding: '5px 9px', borderRadius: 6, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: '0.02em' }}>{p}</span>
              ))}
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
export default function LandingPage() {
  const t = useTranslations('landing');
  const locale = useLocale();
  const [cartPack, setCartPack] = useState<'solo' | 'duo' | null>(null);
  const openCart = (pack: 'solo' | 'duo' = 'duo') => setCartPack(pack);

  return (
    <div style={{ ...LIGHT, minHeight: '100vh', fontFamily: 'var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)' }}>
      <PromoBanner text={t('promoBanner')} />
      <Header onOrderClick={() => openCart()} />
      <HeroSection onOrderClick={() => openCart()} />
      <StatsStrip />
      <Marquee />
      <ClaimSection />
      <ProductSection onOrderClick={openCart} />
      <HowItWorksSection />
      <ShippingSection />
      <GuaranteeSection />
      <PressSection />
      <ProductGridSection onOrderClick={openCart} />
      <PlacementsSection />
      <TestimonialsSection />
      <FinalCTASection onOrderClick={() => openCart()} />
      <FAQSection />
      <DoubleGuaranteeSection />
      <FooterSection />

      {cartPack && <BuyModal pack={cartPack} onClose={() => setCartPack(null)} locale={locale} />}
    </div>
  );
}
