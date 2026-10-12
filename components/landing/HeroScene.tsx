'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import { Avatar, Band, Headline, Logo, PayColumn, PayIcon, PayTitle, Secured, btnProps } from '@/components/pay/ui';
import { AmountTiles, TipSummary } from '@/components/payment/tip-ui';
import { computeTipFee } from '@/lib/pricing/tip-fees';
import { moneyFormatter } from '@/lib/money';
import s from './HeroScene.module.css';

// The hero's product shot: a phone taps the plaque, the team page opens, the
// customer picks who to thank, and the tip goes through. One 14 s CSS
// timeline, transform and opacity only.
//
// The plaque is the product photo (public/products/solo-3d.jpg), cut out of
// its white background and rectified to face the camera: it is the first
// image of the site, so it has to be the real object, not a drawing of it.
//
// The phone's screen is not a picture of the tip pages, it is the tip pages:
// the same components, laid out at a real phone's 390 px width and zoomed to
// the screen, so they cannot drift from what a customer actually sees. `zoom`,
// not a scale transform: the text is laid out and rasterised at its final size
// and stays sharp. The fee comes from the function the checkout charges with.
//
// Without motion (prefers-reduced-motion, or before the CSS loads) the scene
// rests on the tip page, which is the frame that says the most on its own.

const PLACE = 'Salon Lumière — Paris 11e';
const AMOUNTS = [2, 5, 10, 20];
const TIP = 5;
// Cropped from public/avatars/*.png: 6 KB each instead of 800.
const TEAM = [
  { name: 'Léa Chen', photo: '/avatars/hero-lea.webp' },
  { name: 'Marie Laurent', photo: '/avatars/hero-marie.webp' },
  { name: 'Karim Diallo', photo: '/avatars/hero-karim.webp' },
  { name: 'Antoine Garcia', photo: '/avatars/hero-antoine.webp' },
];
// The one the customer picks.
const PICKED = 1;
const STAFF = TEAM[PICKED].name;
const PHOTO = TEAM[PICKED].photo;

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
        <div className={s.plaque}>
          <div className={s.plaqueEdge} />
          <Image src="/products/plaque-front.webp" alt="" width={640} height={640} sizes="280px" priority className={s.plaqueImg} />
        </div>

        {/* Two movers so the phone travels on a curve: X and Y keep their own
            easing, as a hand does. */}
        <div className={s.phoneTrack}>
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
              {/* Team page: who to thank */}
              <div className={`${s.layer} ${s.web} ${s.groupLayer}`}>
                <StatusBar />
                <Band pb={48} logo={<Logo />}>
                  <Headline>{tp('tipHeadline')}</Headline>
                  <p style={{ font: '600 16px/24px var(--font)', color: 'var(--text-2)', marginTop: 4 }}>{PLACE}</p>
                </Band>
                <PayColumn>
                  <p style={{ font: '400 14px/20px var(--font)', color: 'var(--text-2)', textAlign: 'center', margin: '12px 0 16px' }}>{tp('group.pickStaffSubtitle')}</p>
                  <div className={s.list}>
                    <div className={s.row}>
                      <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent-muted)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <PayIcon name="heart" size={22} color="var(--brand)" />
                      </span>
                      <span className={s.rowName}>{tp('group.wholeTeam')}</span>
                      <span style={{ color: 'var(--text-3)' }}><PayIcon name="chevron" size={20} /></span>
                    </div>
                    {TEAM.map((m, i) => (
                      <div key={m.name} className={`${s.row} ${i === PICKED ? s.rowPicked : ''}`}>
                        <Avatar src={m.photo} name={m.name} size={48} ring={0} />
                        <span className={s.rowName}>{m.name}</span>
                        <span style={{ color: 'var(--text-3)' }}><PayIcon name="chevron" size={20} /></span>
                      </div>
                    ))}
                  </div>
                  <p style={{ textAlign: 'center', font: '500 12px/16px var(--font)', color: 'var(--text-3)', marginTop: 24 }}>{tp('group.poweredBy')}</p>
                </PayColumn>
                <SafariBar />
              </div>

              {/* Tip page */}
              <div className={`${s.layer} ${s.web} ${s.payLayer}`}>
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
                <SafariBar />
              </div>

              {/* Receipt */}
              <div className={`${s.layer} ${s.web} ${s.successLayer}`}>
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
                <SafariBar />
              </div>

              {/* Lock screen, with the system's NFC banner */}
              <div className={`${s.layer} ${s.lockLayer}`}>
                <StatusBar light />
                <div className={s.lockDate}>{t('lockDate')}</div>
                <div className={s.lockTime}>9:41</div>
                <span className={`${s.lockButton} ${s.lockButtonLeft}`}><LockGlyph name="torch" /></span>
                <span className={`${s.lockButton} ${s.lockButtonRight}`}><LockGlyph name="camera" /></span>
                <span className={s.homeBar} />
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

              {/* Where the finger lands, as a screen recording shows touches. */}
              <span className={`${s.touch} ${s.touchBanner}`} />
              <span className={`${s.touch} ${s.touchRow}`} />
              <span className={`${s.touch} ${s.touchPay}`} />
            </div>
            <span className={s.glass} />
            <span className={s.island} />
          </div>
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

// Safari's address bar, floating at the bottom as on iOS 26.
function SafariBar() {
  return (
    <div className={s.safari}>
      <PayIcon name="lock" size={14} />
      <span>digitip.app</span>
      <span className={s.homeBar} style={{ bottom: -22 }} />
    </div>
  );
}

function LockGlyph({ name }: { name: 'torch' | 'camera' }) {
  const p = { fill: 'none', stroke: '#fff', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      {name === 'torch'
        ? <><path d="M8 3h8v4l-2 3v11h-4V10L8 7z" {...p} /><path d="M12 13v2" {...p} /></>
        : <><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" {...p} /><circle cx="12" cy="13" r="3.5" {...p} /></>}
    </svg>
  );
}
