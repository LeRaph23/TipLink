'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ProgressBar } from './ProgressBar';
import { OrderSummary } from './OrderSummary';
import type { PackId } from '@/lib/env';
import type { Step } from '@/lib/order-validation';

function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="7" fill="var(--accent)" />
      <path d="M7 12c0-2.8 2.2-5 5-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M17 12c0 2.8-2.2 5-5 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.8" fill="white" />
    </svg>
  );
}

export function OrderLayout({
  pack,
  locale,
  step,
  reachable,
  title,
  subtitle,
  children,
  footer,
  onStepClick,
  onExit,
  showSummary = true,
}: {
  pack: PackId;
  locale: string;
  step: Step;
  reachable: Step;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  onStepClick: (s: Step) => void;
  onExit: () => void;
  showSummary?: boolean;
}) {
  const t = useTranslations('order');

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)',
      overflowX: 'hidden',
      position: 'relative',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Ambient gradients */}
      <div style={{ position: 'fixed', top: '-10%', right: '-5%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-20%', left: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 20,
        padding: '14px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'color-mix(in oklch, var(--bg) 80%, transparent)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <LogoMark size={24} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>TipLink</span>
        </Link>

        <div style={{
          fontSize: 12, color: 'var(--text-3)', fontWeight: 500,
          display: 'none',
        }} className="order-pack-badge">
          {t('selectedPack', { pack: pack.toUpperCase() })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LanguageSwitcher compact />
          <button
            type="button" onClick={onExit}
            style={{
              padding: '6px 12px', borderRadius: 8,
              background: 'transparent', color: 'var(--text-3)',
              border: '1px solid var(--border-subtle)',
              fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
              fontFamily: 'var(--font)',
            }}
          >
            {t('exit')}
          </button>
        </div>
      </header>

      {/* Progress bar */}
      <div style={{
        padding: '18px 32px 10px', zIndex: 10, position: 'relative',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <ProgressBar current={step} onStepClick={onStepClick} reachable={reachable} />
      </div>

      {/* Body */}
      <main style={{
        flex: 1, zIndex: 1, position: 'relative',
        padding: '40px 32px 60px',
        maxWidth: 1100, width: '100%', margin: '0 auto',
      }}>
        <div className="order-grid" style={{
          display: 'grid',
          gridTemplateColumns: showSummary ? '1fr 340px' : '1fr',
          gap: 40,
          alignItems: 'start',
        }}>
          {/* Left: step content */}
          <section>
            <div style={{ marginBottom: 28 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--accent)',
                textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10,
              }}>
                {t('stepOf', { current: 1, total: 5 }).replace('1', String(['pack', 'shipping', 'billing', 'account', 'review'].indexOf(step) + 1))}
              </div>
              <h1 style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 800,
                color: 'var(--text)', letterSpacing: '-0.035em', lineHeight: 1.15,
                margin: 0, marginBottom: 10,
              }}>
                {title}
              </h1>
              <p style={{
                fontSize: 14.5, color: 'var(--text-3)', lineHeight: 1.6,
                margin: 0, maxWidth: 520,
              }}>
                {subtitle}
              </p>
            </div>

            <div key={step} style={{
              animation: 'orderStepFade 260ms ease-out',
            }}>
              {children}
            </div>

            <div style={{ marginTop: 28 }}>
              {footer}
            </div>
          </section>

          {/* Right: live summary (hidden on step 1) */}
          {showSummary && (
            <aside className="order-summary-col" style={{
              position: 'sticky', top: 110,
            }}>
              <OrderSummary pack={pack} locale={locale} />
            </aside>
          )}
        </div>
      </main>

      <style>{`
        @keyframes orderStepFade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 900px) {
          .order-grid {
            grid-template-columns: 1fr !important;
          }
          .order-summary-col {
            position: static !important;
            order: -1;
          }
          .order-pack-badge {
            display: none !important;
          }
        }
        @media (min-width: 640px) {
          .order-pack-badge {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}
