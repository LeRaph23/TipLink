'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { DevDemoButton } from '@/components/DevDemoButton';

const IS_DEV = process.env.NODE_ENV !== 'production';

function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="7" fill="var(--accent)" />
      <path d="M7 12c0-2.8 2.2-5 5-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M17 12c0 2.8-2.2 5-5 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.8" fill="white" />
    </svg>
  );
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const palette = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#3b82f6'];
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  const initials = name.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: palette[idx],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.37, fontWeight: 700, color: '#fff',
      flexShrink: 0, letterSpacing: '-0.02em', userSelect: 'none',
    }}>
      {initials}
    </div>
  );
}

function Reveal({ children, delay = 0, y = 28, style: extra = {} }: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.12 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'none' : `translateY(${y}px)`,
      transition: `opacity 700ms ${delay}ms cubic-bezier(.22,1,.36,1), transform 700ms ${delay}ms cubic-bezier(.22,1,.36,1)`,
      ...extra,
    }}>
      {children}
    </div>
  );
}

function NFCTapVisual() {
  const [tapped, setTapped] = useState(false);
  useEffect(() => {
    const cycle = () => { setTapped(false); setTimeout(() => setTapped(true), 400); };
    cycle();
    const id = setInterval(cycle, 3200);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ position: 'relative', width: 280, height: 280, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', inset: '20%', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,111,238,0.28) 0%, transparent 70%)',
        filter: 'blur(20px)', transition: 'opacity 400ms',
        opacity: tapped ? 1 : 0.35,
      }} />
      {tapped && [0, 1, 2].map(i => (
        <div key={i} style={{
          position: 'absolute',
          top: `calc(50% - ${52 + i * 26}px)`,
          left: `calc(50% - ${52 + i * 26}px)`,
          width: (52 + i * 26) * 2, height: (52 + i * 26) * 2,
          borderRadius: '50%',
          border: '1.5px solid rgba(99,102,241,0.5)',
          animation: `ripple 800ms ${i * 140}ms ease-out both`,
        }} />
      ))}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: 164, height: 92, borderRadius: 16,
        background: 'linear-gradient(135deg, #1e1e2e, #2a2a3e)',
        border: '1px solid rgba(99,102,241,0.3)',
        boxShadow: tapped ? '0 8px 40px rgba(99,102,241,0.4)' : '0 4px 20px rgba(0,0,0,0.45)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 6, transition: 'all 400ms cubic-bezier(.34,1.2,.64,1)',
        transform: `translate(-50%, -50%) scale(${tapped ? 1.05 : 1})`,
      }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>M</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f0f0f8', letterSpacing: '-0.02em' }}>Marco Rossi</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>The Merchant Bar</div>
        </div>
      </div>
      <div style={{
        position: 'absolute',
        top: tapped ? '18%' : '8%',
        right: tapped ? '14%' : '4%',
        transition: 'all 500ms cubic-bezier(.34,1.2,.64,1)',
        width: 52, height: 88, borderRadius: 10,
        background: 'linear-gradient(160deg, #1a1a2e, #16213e)',
        border: '1.5px solid rgba(255,255,255,0.1)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: 28, height: 44, borderRadius: 5, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v10M4 4.5C2.8 5.7 2.8 8.3 4 9.5M10 4.5c1.2 1.2 1.2 3.8 0 5" stroke="rgba(99,102,241,0.8)" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}

const VENUES = ['The Merchant Bar', 'Harbour Kitchen', 'The Liffey Social', 'Saltwater Café', 'Grand Canal Hotel', 'The Porterhouse', 'Fade Street Social', 'Grogans Castle Lounge'];

function Marquee() {
  const items = [...VENUES, ...VENUES];
  return (
    <div style={{
      overflow: 'hidden',
      borderTop: '1px solid rgba(255,255,255,0.05)',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      padding: '14px 0',
      WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
      maskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
    }}>
      <div style={{ display: 'flex', animation: 'marqueeScroll 30s linear infinite', width: 'max-content' }}>
        {items.map((v, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '0 20px', whiteSpace: 'nowrap' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.02em' }}>{v}</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(99,102,241,0.4)', flexShrink: 0, display: 'inline-block' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, body, delay = 0 }: { icon: string; title: string; body: string; delay?: number }) {
  const [hov, setHov] = useState(false);
  return (
    <Reveal delay={delay}>
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          padding: '28px 24px', borderRadius: 16,
          background: hov ? 'var(--surface-2)' : 'var(--surface)',
          border: `1px solid ${hov ? 'var(--border)' : 'var(--border-subtle)'}`,
          transition: 'all 180ms ease',
          transform: hov ? 'translateY(-3px)' : 'none',
          boxShadow: hov ? 'var(--shadow)' : 'none',
        }}
      >
        <div style={{ fontSize: 24, marginBottom: 14 }}>{icon}</div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 8 }}>{title}</h3>
        <p style={{ fontSize: 13.5, color: 'var(--text-3)', lineHeight: 1.75 }}>{body}</p>
      </div>
    </Reveal>
  );
}

export default function LandingPage() {
  const t = useTranslations('landing');
  const tc = useTranslations('common');
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', overflowX: 'hidden' }}>

      <div style={{ position: 'fixed', top: '-10%', right: '-5%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '10%', left: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 48px', height: 64,
        background: scrolled ? 'rgba(8,8,18,0.88)' : 'transparent',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
        transition: 'all 350ms ease',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <LogoMark size={26} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: '#f0f0f8' }}>Digitip</span>
        </Link>
        <nav style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Link href="/pricing" style={{
            padding: '7px 14px', textDecoration: 'none',
            color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: 500,
          }}>{tc('pricing')}</Link>
          <LanguageSwitcher />
          {IS_DEV && <DevDemoButton />}
          <Link href="/login" style={{
            padding: '7px 16px', borderRadius: 8, textDecoration: 'none',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 500,
          }}>{tc('login')}</Link>
          <Link href="/signup" style={{
            padding: '7px 18px', borderRadius: 8, textDecoration: 'none',
            background: 'var(--accent)', color: '#fff',
            fontSize: 13, fontWeight: 600,
            boxShadow: '0 0 20px rgba(99,102,241,0.35)',
          }}>{tc('getStarted')} {tc('arrowRight')}</Link>
        </nav>
      </header>

      <section style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        padding: '100px 48px 60px', position: 'relative', zIndex: 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40, width: '100%', maxWidth: 1200, margin: '0 auto', flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 560, flex: 1, minWidth: 280 }}>
            <div className="fade-up" style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '5px 14px', borderRadius: 100, marginBottom: 32,
              background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
              fontSize: 12, fontWeight: 600, color: '#a5b4fc',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#818cf8', display: 'inline-block', animation: 'shimmer 2s ease infinite' }} />
              {t('badge')}
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(40px, 5.5vw, 64px)', lineHeight: 0.97, letterSpacing: '-0.02em', color: '#f0f0f8', marginBottom: 28 }}>
              <div className="fade-up" style={{ animationDelay: '60ms' }}>{t('h1_leave')}</div>
              <div className="fade-up" style={{ animationDelay: '120ms', color: 'var(--accent)' }}>{t('h1_cashless')}</div>
              <div className="fade-up" style={{ animationDelay: '180ms' }}>{t('h1_tip')}</div>
              <div className="fade-up" style={{ animationDelay: '240ms', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {t('h1_tap')}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 12px', borderRadius: 8, verticalAlign: 'middle',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.35)', marginBottom: 4,
                }}>
                  <span>📲</span> NFC
                </span>
              </div>
            </h1>
            <p className="fade-up" style={{ animationDelay: '320ms', fontSize: 17, color: 'rgba(255,255,255,0.45)', lineHeight: 1.75, maxWidth: 440, marginBottom: 36 }}>
              {t('tagline')}
            </p>
            <div className="fade-up" style={{ animationDelay: '400ms', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href="/signup" style={{
                padding: '13px 28px', borderRadius: 12, textDecoration: 'none',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', fontSize: 15, fontWeight: 700,
                boxShadow: '0 4px 28px rgba(99,102,241,0.45)',
              }}>{t('seePricing')} {tc('arrowRight')}</Link>
              <Link href="/pricing" style={{
                padding: '13px 24px', borderRadius: 12, textDecoration: 'none',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: 500,
              }}>{tc('pricing')}</Link>
            </div>
            <div className="fade-up" style={{ animationDelay: '500ms', display: 'flex', gap: 14, marginTop: 36, alignItems: 'center' }}>
              <div style={{ display: 'flex' }}>
                {[
                  { name: 'Marco Rossi', src: '/avatars/marco.png' },
                  { name: 'Sienna Walsh', src: '/avatars/sienna.png' },
                  { name: 'Luca Brennan', src: '/avatars/luca.png' },
                  { name: 'Aoife Murphy', src: '/avatars/aoife.png' },
                ].map((p, i) => (
                  <div key={p.name} style={{ marginLeft: i === 0 ? 0 : -8, border: '2px solid var(--bg)', borderRadius: '50%', width: 26, height: 26, overflow: 'hidden', flexShrink: 0 }}>
                    <img src={p.src} alt={p.name} width={26} height={26} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ))}
              </div>
              <p
                style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}
                dangerouslySetInnerHTML={{ __html: t.raw('social_proof') as string }}
              />
            </div>
          </div>
          <div className="fade-up" style={{ animationDelay: '200ms', flexShrink: 0 }}>
            <NFCTapVisual />
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, animation: 'fadeIn 1s 1.5s both' }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{t('scroll')}</div>
          <div style={{ width: 1, height: 28, background: 'linear-gradient(to bottom, rgba(255,255,255,0.2), transparent)' }} />
        </div>
      </section>

      <div style={{ position: 'relative', zIndex: 1 }}><Marquee /></div>

      <section style={{ padding: '100px 48px', maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <Reveal>
          <div style={{ marginBottom: 64, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(99,102,241,0.8)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{t('howItWorksKicker')}</div>
              <h2
                style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 3.2vw, 42px)', fontWeight: 800, color: '#f0f0f8', letterSpacing: '-0.03em', lineHeight: 1.05 }}
                dangerouslySetInnerHTML={{ __html: t.raw('howItWorksTitle') as string }}
              />
            </div>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', maxWidth: 260, textAlign: 'right', lineHeight: 1.7 }}>
              {t('howItWorksSub')}
            </p>
          </div>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 2, position: 'relative' }}>
          {[
            { n: '01', title: t('step1Title'), body: t('step1Body') },
            { n: '02', title: t('step2Title'), body: t('step2Body') },
            { n: '03', title: t('step3Title'), body: t('step3Body') },
          ].map((step, i) => (
            <Reveal key={i} delay={i * 80}>
              <div style={{ padding: '32px 28px 28px' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: '#818cf8', marginBottom: 20 }}>
                  {step.n}
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: '#f0f0f8', letterSpacing: '-0.03em', marginBottom: 10 }}>{step.title}</h3>
                <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.75 }}>{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section style={{ padding: '80px 48px 100px', maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <Reveal>
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(99,102,241,0.8)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{t('featuresKicker')}</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 3vw, 38px)', fontWeight: 800, color: '#f0f0f8', letterSpacing: '-0.03em', lineHeight: 1.05 }}>{t('featuresTitle')}</h2>
          </div>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
          <FeatureCard delay={0}   icon="📲" title={t('feat1Title')} body={t('feat1Body')} />
          <FeatureCard delay={80}  icon="⚡" title={t('feat2Title')} body={t('feat2Body')} />
          <FeatureCard delay={160} icon="🎛️" title={t('feat3Title')} body={t('feat3Body')} />
          <FeatureCard delay={240} icon="🌍" title={t('feat4Title')} body={t('feat4Body')} />
          <FeatureCard delay={320} icon="🔒" title={t('feat5Title')} body={t('feat5Body')} />
          <FeatureCard delay={400} icon="📊" title={t('feat6Title')} body={t('feat6Body')} />
        </div>
      </section>

      <section style={{ padding: '0 48px 100px', maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <Reveal>
          <div style={{
            borderRadius: 24, padding: '48px 56px',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)',
            border: '1px solid rgba(99,102,241,0.2)',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 32,
          }}>
            {[
              ['€24k+', t('statTipsProcessed')],
              ['< 2 sec', t('statTapToPay')],
              ['60+', t('statVenues')],
              ['4.9 ★', t('statRating')],
            ].map(([v, l]) => (
              <div key={l} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 800, color: '#f0f0f8', letterSpacing: '-0.03em', marginBottom: 4 }}>{v}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>{l}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <section style={{ padding: '40px 48px 120px', textAlign: 'center', position: 'relative', zIndex: 1, maxWidth: 700, margin: '0 auto' }}>
        <Reveal>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(99,102,241,0.8)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 16 }}>{t('ctaKicker')}</div>
          <h2
            style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(30px, 4vw, 50px)', fontWeight: 800, color: '#f0f0f8', letterSpacing: '-0.03em', lineHeight: 1.0, marginBottom: 20 }}
            dangerouslySetInnerHTML={{ __html: (t.raw('ctaTitle') as string).replace(/<span>/g, '<span style="color:var(--accent)">') }}
          />
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', lineHeight: 1.75, marginBottom: 36 }}>
            {t('ctaBody')}
          </p>
          <Link href="/signup" style={{
            display: 'inline-block', padding: '16px 36px', borderRadius: 14, textDecoration: 'none',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontSize: 16, fontWeight: 700,
            boxShadow: '0 6px 36px rgba(99,102,241,0.45)',
          }}>{t('seePricing')} {tc('arrowRight')}</Link>
        </Reveal>
      </section>

      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.06)', padding: '24px 48px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'relative', zIndex: 1, flexWrap: 'wrap', gap: 16,
        fontSize: 12.5, color: 'rgba(255,255,255,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LogoMark size={18} />
          <span>Digitip · © 2026</span>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <Link href="/privacy" style={{ color: 'rgba(255,255,255,0.25)', textDecoration: 'none' }}>{tc('privacy')}</Link>
          <Link href="/terms" style={{ color: 'rgba(255,255,255,0.25)', textDecoration: 'none' }}>{tc('terms')}</Link>
          <Link href="/contact" style={{ color: 'rgba(255,255,255,0.25)', textDecoration: 'none' }}>{tc('contact')}</Link>
        </div>
      </footer>
    </div>
  );
}
