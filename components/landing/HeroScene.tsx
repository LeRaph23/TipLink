'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { Avatar, Band, Headline, Logo, PayColumn, PayIcon, PayTitle, Secured, btnProps } from '@/components/pay/ui';
import { AmountTiles, TipSummary } from '@/components/payment/tip-ui';
import { computeTipFee } from '@/lib/pricing/tip-fees';
import { moneyFormatter } from '@/lib/money';
import s from './HeroScene.module.css';

// The hero's product shot: a phone taps the plaque, the tip page opens, a tip
// goes through. One 10 s CSS timeline, transform and opacity only.
//
// The phone's screen is not a picture of the tip page, it is the tip page: the
// same components, rendered at a real phone's 390 px width and scaled down, so
// it cannot drift from what a customer actually sees. The fee comes from the
// same function the checkout charges with.
//
// Without motion (prefers-reduced-motion, or before the CSS loads) the scene
// rests on the tip page, which is the frame that says the most on its own.

const STAFF = 'Marie Laurent';
const PLACE = 'Salon Lumière — Paris 11e';
const AMOUNTS = [2, 5, 10, 20];
const TIP = 5;
// Cropped from public/avatars/sienna.png: 7 KB instead of 900.
const PHOTO = '/avatars/hero-staff.webp';

export function HeroScene() {
  const t = useTranslations('landing.heroScene');
  const tp = useTranslations('pay');
  const locale = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  // A loop nobody is looking at still costs frames: hold it while off screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setPaused(!e.isIntersecting));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const fmt = moneyFormatter(locale, 'EUR', 0);
  const fmtCents = moneyFormatter(locale, 'EUR', 2);
  const tipCents = TIP * 100;
  const feeCents = computeTipFee(tipCents);
  const tip = fmtCents.format(tipCents / 100);
  const fee = fmtCents.format(feeCents / 100);
  const total = fmtCents.format((tipCents + feeCents) / 100);
  const pay = btnProps('primary', 'L', { full: true });

  return (
    <div ref={ref} className={s.frame} role="img" aria-label={t('alt')}>
      <div className={s.stage} data-paused={paused || undefined}>
        <Plaque />

        <div className={s.phoneShadow} />
        <div className={s.phone}>
          <span className={`${s.side} ${s.sideAction}`} />
          <span className={`${s.side} ${s.sideVolUp}`} />
          <span className={`${s.side} ${s.sideVolDown}`} />
          <span className={`${s.side} ${s.sidePower}`} />

          {/* The screen. `inert` keeps the real buttons inside out of the tab
              order and the accessibility tree: the label above says it all. */}
          <div className={s.screen} data-theme="light" inert>
            <div className={s.viewport}>
              {/* Tip page */}
              <div className={`${s.layer} ${s.payLayer}`}>
                <StatusBar />
                <Band logo={<Logo />}>
                  <Headline>{tp('tipHeadline')}</Headline>
                  <p style={{ font: '400 14px/20px var(--font)', color: 'var(--text-2)', marginTop: 4 }}>{tp('tipSubhead')}</p>
                </Band>
                <PayColumn>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: -56, position: 'relative' }}>
                    <Avatar src={PHOTO} name={STAFF} size={80} />
                    <p style={{ font: '400 14px/20px var(--font)', color: 'var(--text-2)', marginTop: 12 }}>{tp('tipFor')}</p>
                    <PayTitle>{STAFF}</PayTitle>
                    <p style={{ font: '400 14px/20px var(--font)', color: 'var(--text-3)', marginTop: 2 }}>{PLACE}</p>
                  </div>
                  <AmountTiles amounts={AMOUNTS} isActive={a => a === TIP} onPick={() => {}} format={a => fmt.format(a)} label={tp('tipFor')} />
                  <p style={{ textAlign: 'center', marginTop: 12, font: '600 14px/20px var(--font)', color: 'var(--text-2)', textDecoration: 'underline', textUnderlineOffset: 3 }}>{tp('customAmount')}</p>
                  <TipSummary
                    labels={{ tip: tp('summaryTip'), fee: tp('summaryFee'), total: tp('summaryTotal') }}
                    tip={tip} fee={fee} total={total}
                    info="" infoLabel="" marginTop={20}
                  />
                  <div style={{ marginTop: 16 }}>
                    <button type="button" tabIndex={-1} className={`${pay.className} ${s.payBtn}`} style={pay.style}>
                      {t('payButton', { amount: total })}
                    </button>
                  </div>
                  <Secured>{tp('secured')}</Secured>
                </PayColumn>
              </div>

              {/* Receipt */}
              <div className={`${s.layer} ${s.successLayer}`}>
                <StatusBar />
                <Band pb={48} logo={<Logo />}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px', background: 'var(--success-bg)', color: 'var(--success)', display: 'grid', placeItems: 'center' }}>
                    <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
                      <path className={s.check} d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <PayTitle>{tp('success')}</PayTitle>
                  <p style={{ font: '400 16px/24px var(--font)', color: 'var(--text-2)', marginTop: 8 }}>{tp('successBodyNamed', { name: STAFF })}</p>
                </Band>
                <PayColumn>
                  <div style={{ marginTop: 16, padding: '4px 20px', borderRadius: 'var(--radius-lg)', background: 'var(--surface)', border: '1px solid var(--border-subtle)' }}>
                    {[
                      [tp('successTip'), tip],
                      [tp('successFee'), fee],
                      [tp('successTotal'), total],
                      [tp('sentTo'), STAFF],
                    ].map(([k, v], i, rows) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none', font: '400 14px/20px var(--font)', color: 'var(--text-2)' }}>
                        <span>{k}</span>
                        <span style={{ color: 'var(--text)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </PayColumn>
              </div>

              {/* Lock screen, with the system's NFC banner */}
              <div className={`${s.layer} ${s.lockLayer}`}>
                <StatusBar light />
                <div className={s.lockTime}>9:41</div>
                <div className={s.banner}>
                  <span className={s.bannerIcon}><PayIcon name="heart" size={22} color="#fff" /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className={s.bannerHead}>
                      <b>Digitip</b>
                      <span>{t('now')}</span>
                    </span>
                    <span className={s.bannerBody}>{t('nfcBanner')}</span>
                  </span>
                </div>
              </div>
            </div>
            <span className={s.island} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBar({ light = false }: { light?: boolean }) {
  const c = light ? '#fff' : '#171213';
  return (
    <div className={s.statusBar} style={{ color: c }}>
      <span>9:41</span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><g fill={c}><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></g></svg>
        <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0L8 11.5zM3.5 6.9a6.4 6.4 0 0 1 9 0l-1.4 1.4a4.4 4.4 0 0 0-6.2 0L3.5 6.9zM1.3 4.7a9.5 9.5 0 0 1 13.4 0l-1.4 1.4a7.5 7.5 0 0 0-10.6 0L1.3 4.7z" fill={c} /></svg>
        <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden="true"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke={c} strokeOpacity=".4" /><rect x="2" y="2" width="18" height="9" rx="2" fill={c} /><path d="M25 4.5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2z" fill={c} fillOpacity=".5" /></svg>
      </span>
    </div>
  );
}

// The plaque, drawn rather than photographed, so it shares the phone's light
// and flat projection: the product shot is one scene, not two pictures stacked.
// Its artwork follows the printed plaque (public/products/solo-3d.jpg), which
// is French whatever the page's language, as the object itself is.
function Plaque() {
  return (
    <div className={s.plaque} aria-hidden="true">
      <div className={s.plaqueEdge} />
      <div className={s.plaqueFace}>
        <div className={s.plaqueField}>
          <svg className={s.plaqueHeart} viewBox="0 0 24 22" aria-hidden="true">
            <path d="M12 20.5S2 14.4 2 7.6C2 4.5 4.4 2 7.3 2c2 0 3.7 1.1 4.7 2.8C13 3.1 14.7 2 16.7 2 19.6 2 22 4.5 22 7.6c0 6.8-10 12.9-10 12.9z" fill="none" stroke="#fff" strokeWidth="1.1" strokeLinejoin="round" />
          </svg>
          <p className={s.plaqueTitle}>ENVIE DE <b>DIRE MERCI</b> ?</p>
          <p className={s.plaqueSub}>LAISSEZ UN <b>POURBOIRE</b> EN UN <b>CLIN D’OEIL</b></p>
        </div>
        <svg className={s.plaqueWave} viewBox="0 0 280 40" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 22 C 70 4, 150 4, 200 20 S 262 36, 280 30 L280 40 L0 40 Z" fill="rgba(255,255,255,.55)" />
          <path d="M0 26 C 70 8, 150 8, 200 24 S 262 40, 280 34 L280 40 L0 40 Z" fill="#fff" />
        </svg>
        <div className={s.plaqueLower}>
          <p className={s.plaqueCta}><b>APPROCHEZ</b> VOTRE TÉLÉPHONE</p>
          <div className={s.plaqueRow}>
            <svg className={s.plaqueNfc} viewBox="0 0 92 54" aria-hidden="true">
              <g fill="none" stroke="#141414" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M50 8.5C46 6.3 40.8 5 35 5 18.4 5 5 15.3 5 28s13.4 23 30 23c5.8 0 11-1.3 15-3.5" />
                <path d="M19 21.5c1.6 2 2.5 4 2.5 6.5s-.9 4.5-2.5 6.5M25 17.5c2.6 3 4 6.5 4 10.5s-1.4 7.5-4 10.5M31 13.5c3.5 4 5.5 9 5.5 14.5S34.5 38.5 31 42.5" />
                <rect x="54" y="4" width="22" height="38" rx="4" />
                <path d="M62 8h6" />
                <path d="M54 26c-3 0-5 2-5 4.5s2 4.5 5 4.5M76 30l8 6.5c2 1.6 2.4 4.4.8 6.4L80 49" />
              </g>
              <text x="65" y="27" textAnchor="middle" fontSize="8.5" fontWeight="800" fontFamily="var(--font-poppins), sans-serif" fill="#141414">NFC</text>
            </svg>
            <div className={s.plaqueQr}>
              <span>OU</span>
              <b>SCANNEZ-MOI</b>
              <span className={s.plaqueQrCode}><QRCodeSVG value="https://digitip.app" size={44} level="L" marginSize={0} /></span>
            </div>
          </div>
          <p className={s.plaqueFoot}>propulsé par <b>Digitip.app</b></p>
        </div>
        <div className={s.plaqueGloss} />
      </div>
    </div>
  );
}
