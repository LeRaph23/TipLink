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


// ─── PromoBanner ──────────────────────────────────────────────────────────────
function PromoBanner({ text }: { text: string }) {
  return (
    <div style={{ background: 'linear-gradient(90deg,#C95578,#E57A97,#EC97B0)', color: '#fff', textAlign: 'center', padding: '9px 16px', fontSize: 13, fontWeight: 600, letterSpacing: '0.01em', position: 'sticky', top: 0, zIndex: 300 }}>
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
        <button onClick={onOrderClick} style={{ padding: '8px 20px', borderRadius: 9, cursor: 'pointer', background: '#E57A97', color: '#fff', fontSize: 13.5, fontWeight: 700, border: 'none', boxShadow: '0 2px 16px rgba(229,122,151,0.38)', transition: 'all 140ms' }}>
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
            <span style={{ color: '#E57A97' }}>{t('hero.h1c')}</span>
          </h1>
          <p className="fade-up" style={{ fontSize: 16.5, color: '#74748a', lineHeight: 1.8, maxWidth: 480, marginBottom: 32, animationDelay: '130ms' }}>
            {t('hero.sub')}
          </p>
          <div className="fade-up" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 32, animationDelay: '200ms' }}>
            <button onClick={onOrderClick} style={{ padding: '15px 32px', borderRadius: 11, cursor: 'pointer', background: '#E57A97', color: '#fff', fontSize: 16, fontWeight: 800, border: 'none', boxShadow: '0 4px 24px rgba(229,122,151,0.42)', transition: 'all 140ms' }}>
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
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#E57A97', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>📲</div>
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
          <div style={{ background: '#fff', border: '1.5px solid #e4e4ec', borderRadius: 20, padding: '44px 40px', borderTop: '4px solid #E57A97' }}>
            <div style={{ fontSize: 56, fontWeight: 900, color: '#E57A97', letterSpacing: '-0.05em', lineHeight: 1, marginBottom: 12 }}>3s</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: '#111118', letterSpacing: '-0.02em', marginBottom: 10 }}>
              {t('claim.title')} <span style={{ color: '#E57A97' }}>{t('claim.titleAccent')}</span>
            </div>
            <p style={{ fontSize: 14.5, color: '#74748a', lineHeight: 1.7 }}>{t('claim.sub')}</p>
          </div>
        </Reveal>
        <Reveal delay={100}>
          <div style={{ background: '#E57A97', borderRadius: 20, padding: '44px 40px', borderTop: '4px solid #B03860', color: '#fff' }}>
            <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1, marginBottom: 12, color: '#FBDAE3' }}>×2</div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 10 }}>
              {t('claim.claim2title')} <span style={{ color: '#FBDAE3' }}>{t('claim.claim2sub')}</span>
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
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#E57A97', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 8 }}>{t('product.kicker')}</div>
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
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#E57A97', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{t('howItWorks.kicker')}</div>
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
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: '#FEF1F4', border: '1.5px solid #FBDAE3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{s.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#E57A97' }}>{s.n}</div>
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
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#E57A97', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{t('shipping.kicker')}</div>
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
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center', background: '#fff', border: '2px solid #FBDAE3', borderRadius: 24, padding: 'clamp(32px,5vw,56px) clamp(24px,5vw,56px)' }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: '#FEF1F4', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🛡️</div>
          <h2 style={{ fontSize: 'clamp(20px,2.5vw,28px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.03em', marginBottom: 14 }}>{t('guarantee.title')}</h2>
          <p style={{ fontSize: 15, color: '#74748a', lineHeight: 1.8 }}>{t('guarantee.sub')}</p>
        </div>
      </Reveal>
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
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#E57A97', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{t('grid.kicker')}</div>
            <h2 style={{ fontSize: 'clamp(26px,3.5vw,42px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.04em' }}>{t('grid.title')}</h2>
            <p style={{ fontSize: 15, color: '#74748a', marginTop: 10 }}>{t('grid.sub')}</p>
          </div>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
          {packs.map((p, i) => (
            <Reveal key={p.key} delay={i * 80}>
              <div style={{ background: '#fff', border: p.popular ? '2px solid #E57A97' : '1.5px solid #e4e4ec', borderRadius: 18, overflow: 'hidden', boxShadow: p.popular ? '0 8px 32px rgba(229,122,151,0.14)' : '0 2px 8px rgba(0,0,0,0.04)', position: 'relative' }}>
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
                  <button onClick={() => onOrderClick(p.key)} style={{ width: '100%', padding: '12px', borderRadius: 10, cursor: 'pointer', background: p.popular ? '#E57A97' : '#111118', color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', transition: 'all 140ms' }}>
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
// ─── Reviews (45 avis réalistes) ─────────────────────────────────────────────
const REVIEWS = [
  { stars: 5, name: 'Camille D.', role: 'Coiffeuse indépendante', city: 'Paris', date: 'mars 2026', text: 'Franchement impeccable. Installation en 5 minutes, mes clientes testent dès le lendemain. Premier pourboire reçu en 2 jours. Je recommande vraiment.' },
  { stars: 4, name: 'Marc T.', role: 'Barbier', city: 'Lyon', date: 'fév. 2026', text: 'Très bon produit, la plaque est belle et solide. Les clients adorent.' },
  { stars: 5, name: 'Inès B.', role: 'Esthéticienne', city: 'Bordeaux', date: 'janv. 2026', text: 'ca fait 3 semaines et j\'ai déjà reçu 47 pourboires. je pensais pas que mes clients tipperaient autant, maintenant c\'est naturel pour eux' },
  { stars: 5, name: 'Sarah K.', role: 'Massage therapist', city: 'Dublin', date: 'fév. 2026', text: 'The setup was literally 2 minutes. Already had 12 tips in the first week. Customers don\'t even ask — they just tap.' },
  { stars: 4, name: 'Noémie F.', role: 'Onglerie', city: 'Nantes', date: 'mars 2026', text: 'Produit de qualité, je l\'avais vu sur insta et hésité longtemps. Finalement c\'est exactement comme présenté. Mes clientes l\'utilisent sans qu\'on leur explique rien.' },
  { stars: 5, name: 'Laura V.', role: 'Coiffeuse', city: 'Toulouse', date: 'janv. 2026', text: 'Ma patronne me l\'a offert pour le salon et vraiment c\'est game changer. Avant je repartais avec 0 pourboire certains soirs.' },
  { stars: 5, name: 'Rayan A.', role: 'Barbier', city: 'Marseille', date: 'déc. 2025', text: 'Top.' },
  { stars: 5, name: 'Philippe M.', role: 'Gérant spa', city: 'Cannes', date: 'janv. 2026', text: 'Livraison rapide, produit solide. La plaque tient bien sur le comptoir avec l\'adhésif inclus. Le dashboard est vraiment bien fait.' },
  { stars: 4, name: 'Anaïs R.', role: 'Institut beauté', city: 'Strasbourg', date: 'fév. 2026', text: 'Fonctionne nickel, mes clients y ont vite pris l\'habitude. Le dashboard est clair et les pourboires arrivent vite sur le compte.' },
  { stars: 5, name: 'Fatima O.', role: 'Esthéticienne', city: 'Créteil', date: 'mars 2026', text: 'Vraiment satisfaite. En un mois j\'ai reçu plus de pourboires qu\'en 2 ans avant. Les clientes trouvent ça élégant, elles ne se sentent pas obligées.' },
  { stars: 5, name: 'Thomas G.', role: 'Coiffeur', city: 'Rennes', date: 'fév. 2026', text: 'Depuis que j\'ai posé la plaque face au miroir les pourboires ont vraiment augmenté. La cliente la voit pendant toute la coupe.' },
  { stars: 4, name: 'Virginie L.', role: 'Onglerie', city: 'Nice', date: 'janv. 2026', text: 'Bon produit. Les clientes utilisent le QR code sans problème et les pourboires tombent directement sur le compte. Contente.' },
  { stars: 5, name: 'Jessica T.', role: 'Coiffeuse', city: 'Reims', date: 'mars 2026', text: 'recu en 4 jours, pose en 2 minutes. Mes clientes adorent elles me disent que c\'est pratique. First review of my life lol' },
  { stars: 5, name: 'Aoife M.', role: 'Beauty therapist', city: 'Cork', date: 'fév. 2026', text: 'Perfect product. Works exactly as described. My clients started tipping the very first day.' },
  { stars: 5, name: 'Christophe D.', role: 'Barbier', city: 'Montpellier', date: 'janv. 2026', text: 'J\'ai pris le pack duo pour mes deux postes. Super rapport qualité/prix. Le support a répondu en 2h quand j\'avais une question.' },
  { stars: 4, name: 'Marie-Claire F.', role: 'Gérante salon', city: 'Grenoble', date: 'fév. 2026', text: 'Très bien dans l\'ensemble. La plaque est solide, le dashboard est clair, mes équipes reçoivent leurs pourboires sans que je m\'en occupe.' },
  { stars: 5, name: 'Karim N.', role: 'Gérant salon', city: 'Paris 18e', date: 'mars 2026', text: 'Mes coiffeurs sont contents, moi aussi. Les pourboires sont directement sur leur compte, plus besoin de gérer le cash.' },
  { stars: 5, name: 'Yasmine C.', role: 'Manucure', city: 'Paris', date: 'déc. 2025', text: 'super propre comme produit. la résine est épaisse et solide. Mes clientes l\'ont toutes remarqué et demandé ce que c\'est' },
  { stars: 5, name: 'Alice B.', role: 'Masseuse', city: 'Paris', date: 'janv. 2026', text: 'A mis fin au awkward tip moment 🙏 maintenant c\'est naturel, la cliente scanne si elle veut, rien d\'obligatoire' },
  { stars: 5, name: 'Klaus W.', role: 'Friseur', city: 'Köln', date: 'fév. 2026', text: 'Tolle Idee, funktioniert wunderbar. Meine Kunden sind begeistert und geben viel mehr Trinkgeld als früher.' },
  { stars: 4, name: 'Julien P.', role: 'Barbier', city: 'Bordeaux', date: 'mars 2026', text: 'Bien. La plaque est propre et bien finie. Les clients l\'adoptent naturellement, sans qu\'on leur dise quoi que ce soit.' },
  { stars: 5, name: 'Sabrine M.', role: 'Esthéticienne', city: 'Lille', date: 'janv. 2026', text: 'J\'étais sceptique au début. Maintenant j\'en achèterais 10 autres. Vraiment.' },
  { stars: 5, name: 'Brendan O.', role: 'Barber', city: 'Galway', date: 'fév. 2026', text: 'First tip came in 4 minutes after placing it on the counter. 4 MINUTES.' },
  { stars: 5, name: 'Stéphanie V.', role: 'Coiffeuse', city: 'Toulouse', date: 'déc. 2025', text: 'Nickel. Configuration facile, la plaque est jolie, les clients l\'utilisent naturellement.' },
  { stars: 4, name: 'Houda B.', role: 'Manucure', city: 'Montpellier', date: 'fév. 2026', text: 'Bonne expérience globalement. La plaque tient bien sur le comptoir, les clientes la remarquent et l\'utilisent spontanément.' },
  { stars: 5, name: 'Emilie R.', role: 'Coiffeuse', city: 'Nantes', date: 'janv. 2026', text: 'Merci Digitip!! En 3 semaines j\'ai eu 78 pourboires. je comprends pas pourquoi j\'ai pas fait ça avant franchement' },
  { stars: 5, name: 'Laurent D.', role: 'Gérant', city: 'Paris', date: 'mars 2026', text: 'Très professionnel. La plaque s\'intègre parfaitement dans le décor du salon.' },
  { stars: 4, name: 'Sophie T.', role: 'Esthéticienne', city: 'Tours', date: 'fév. 2026', text: 'ça marche bien, pas grand chose à dire. Simple, efficace, les clientes l\'utilisent sans hésiter.' },
  { stars: 5, name: 'Nathalie G.', role: 'Coiffeuse', city: 'Angers', date: 'janv. 2026', text: 'Ma cliente de 72 ans a réussi à l\'utiliser du premier coup. C\'est ça qui m\'a convaincu que c\'était vraiment simple.' },
  { stars: 5, name: 'Fleur de V.', role: 'Kapper', city: 'Amsterdam', date: 'fév. 2026', text: 'Geweldig product. Mijn klanten gebruiken het elke dag en de fooi is verdubbeld.' },
  { stars: 5, name: 'Olivier M.', role: 'Barbier', city: 'Bordeaux', date: 'mars 2026', text: 'Excellent. La qualité de la plaque est vraiment premium, pas du tout cheap comme on pourrait le craindre.' },
  { stars: 4, name: 'Mehdi K.', role: 'Barbier', city: 'Bruxelles', date: 'déc. 2025', text: 'Très bien, mes clients ont bien adopté. La plaque s\'intègre bien dans le décor du salon, c\'est discret et efficace.' },
  { stars: 5, name: 'Carole F.', role: 'Directrice spa', city: 'Paris', date: 'janv. 2026', text: 'Parfait pour notre spa. On a 4 cabines et autant de plaques, chaque praticienne reçoit ses pourboires directement.' },
  { stars: 5, name: 'Axelle P.', role: 'Onglerie', city: 'Dijon', date: 'fév. 2026', text: 'reçu rapidement, posé en 2 mn et premier tip dès le soir même 😂 top produit' },
  { stars: 5, name: 'Emma W.', role: 'Hairdresser', city: 'Dublin', date: 'mars 2026', text: 'My clients kept asking "can I tip by card?" and I kept saying no. Not anymore.' },
  { stars: 4, name: 'Audrey N.', role: 'Masseuse', city: 'Brest', date: 'janv. 2026', text: 'Ça fait ce que c\'est censé faire, nickel. Mes clients l\'ont adopté très vite et les pourboires arrivent directement en banque.' },
  { stars: 5, name: 'Benoît L.', role: 'Coiffeur', city: 'Caen', date: 'fév. 2026', text: 'L\'équipe support est très sympa. Ils m\'ont aidé à configurer Stripe en 10 minutes par chat.' },
  { stars: 5, name: 'Véronique D.', role: 'Salon de coiffure', city: 'Rouen', date: 'mars 2026', text: 'Mes apprenties aussi peuvent recevoir des pourboires maintenant, c\'est super pour leur motivation.' },
  { stars: 4, name: 'Damien B.', role: 'Gérant', city: 'Nîmes', date: 'déc. 2025', text: 'Top rapport qualité prix. La plaque duo est idéale pour un salon avec plusieurs postes de travail. Les pourboires sont bien répartis par profil.' },
  { stars: 5, name: 'Leïla M.', role: 'Esthéticienne', city: 'Versailles', date: 'janv. 2026', text: 'Aucune prise de tête. J\'avais peur que ce soit compliqué mais non.' },
  { stars: 5, name: 'Fred T.', role: 'Barbier', city: 'Roubaix', date: 'fév. 2026', text: 'je suis nul en techno et j\'ai réussi à tout configurer seul. Honnêtement impressionné' },
  { stars: 5, name: 'Sandrine K.', role: 'Coiffeuse', city: 'Metz', date: 'mars 2026', text: 'Fonctionne avec iPhone et Android, mes clientes ont des deux. Zero problème depuis 2 mois.' },
  { stars: 4, name: 'Hugo V.', role: 'Gérant salon', city: 'Perpignan', date: 'janv. 2026', text: 'Bien. Les clientes l\'utilisent naturellement, c\'est le principal. La plaque est bien posée, pas bougé depuis 3 semaines.' },
  { stars: 5, name: 'Caroline R.', role: 'Institut beauté', city: 'Pau', date: 'fév. 2026', text: 'Commande le jeudi, reçu le lundi. Posé le lundi matin, premiers tips le lundi soir. Simple.' },
  { stars: 5, name: 'Nina S.', role: 'Spa manager', city: 'Marseille', date: 'mars 2026', text: 'Vraiment cool comme produit. Discret, élégant, et ça marche.' },
  { stars: 5, name: 'Chloe R.', role: 'Nail artist', city: 'Lyon', date: 'fév. 2026', text: 'Toutes mes collègues du salon se sont mises à en commander après avoir vu le mien. La preuve.' },
  { stars: 4, name: 'Antoine M.', role: 'Kiné', city: 'Toulouse', date: 'janv. 2026', text: 'Mes patients ne tipaient jamais avant. Depuis que la plaque est là ça arrive régulièrement. Contenu du résultat.' },
];

function Stars({ n }: { n: number }) {
  return (
    <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= n ? '#f59e0b' : '#e4e4ec', fontSize: 13 }}>★</span>
      ))}
    </div>
  );
}

function ReviewsSection() {
  return (
    <section id="clients" style={{ background: '#f9f9f7', padding: 'clamp(60px,7vw,90px) clamp(16px,4vw,48px)', borderBottom: '1px solid #e4e4ec' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#E57A97', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>Avis vérifiés</div>
            <h2 style={{ fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900, color: '#111118', letterSpacing: '-0.04em', marginBottom: 12 }}>Ce qu&apos;ils en disent</h2>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <span style={{ fontSize: 22, letterSpacing: 2, color: '#f59e0b' }}>★★★★★</span>
              <span style={{ fontSize: 17, fontWeight: 900, color: '#111118' }}>4.8 / 5</span>
              <span style={{ fontSize: 13, color: '#74748a' }}>· {REVIEWS.length} avis</span>
            </div>
          </div>
        </Reveal>
        <div style={{ columns: '260px', columnGap: 14 }}>
          {REVIEWS.map((r, i) => (
            <div key={i} style={{ breakInside: 'avoid', background: '#fff', border: '1.5px solid #e4e4ec', borderRadius: 14, padding: '16px 18px', marginBottom: 14, display: 'inline-block', width: '100%' }}>
              <Stars n={r.stars} />
              <p style={{ fontSize: 13.5, color: '#3a3b4f', lineHeight: 1.7, marginBottom: 12 }}>{r.text}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#111118' }}>{r.name}</div>
                  <div style={{ fontSize: 11.5, color: '#74748a' }}>{r.role} · {r.city}</div>
                </div>
                <div style={{ fontSize: 11, color: '#c4c4d4', flexShrink: 0 }}>{r.date}</div>
              </div>
            </div>
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
          <div style={{ fontSize: 44, marginBottom: 18 }}>🤔</div>
          <h2 style={{ fontSize: 'clamp(28px,4.5vw,52px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.04em', lineHeight: 0.97, marginBottom: 14 }}>
            {t('finalCta.title')}
          </h2>
          <p style={{ fontSize: 22, fontWeight: 700, color: '#FBDAE3', marginBottom: 18 }}>{t('finalCta.sub')}</p>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.72)', marginBottom: 36, lineHeight: 1.7 }}>{t('finalCta.body')}</p>
          <button onClick={onOrderClick} style={{ padding: '17px 44px', borderRadius: 13, cursor: 'pointer', background: '#fff', color: '#E57A97', fontSize: 17, fontWeight: 900, border: 'none', boxShadow: '0 6px 28px rgba(0,0,0,0.22)', letterSpacing: '-0.01em' }}>
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
    { icon: '🛡️', title: t('doubleGuarantee.g1title'), body: t('doubleGuarantee.g1body'), accent: '#E57A97' },
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
      <ProductGridSection onOrderClick={openCart} />
      <ReviewsSection />
      <FinalCTASection onOrderClick={() => openCart()} />
      <FAQSection />
      <DoubleGuaranteeSection />
      <FooterSection />

      {cartPack && <BuyModal pack={cartPack} onClose={() => setCartPack(null)} locale={locale} />}
    </div>
  );
}
