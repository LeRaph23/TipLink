// Salon kit for the "Juste les Pointes" series: the salon set and the three
// characters (Nadia, Chloé, the client), drawn once and driven per episode.
//
//   Salon.build({ nadia: {...}, chloe: {...}, client: {...}, tufts: [...] })
//
// Every "state" option is either a single value for the whole video or a map
// of time windows to values, e.g. { '0-4': 'smile', '4-9.5': 'fake' }.
// Windows use the data-on syntax of cartoon.js ("a-b", seconds). Load after
// base.js and cartoon.js, with an empty <svg class="stage" id="stage">.
(function () {
  const NS = 'http://www.w3.org/2000/svg';

  // { window: value } → "w1,w2" for every window holding `value`, or null.
  function when(states, value, dflt) {
    if (states == null) states = dflt;
    if (typeof states === 'string') return states === value ? '0-999' : null;
    const wins = Object.entries(states).filter(([, v]) => v === value).map(([w]) => w);
    return wins.length ? wins.join(',') : null;
  }
  // Wraps svg in a <g> shown only while `states` equals `value`.
  const part = (states, value, dflt, svg) => {
    const w = when(states, value, dflt);
    return w ? `<g data-on="${w}">${svg}</g>` : '';
  };
  const windows = (w) => (w ? `<g data-on="${w}">` : '<g>');
  const inWin = (w, t) => !!w && w.split(',').some((x) => { const [a, b] = x.split('-').map(Number); return t >= a && t < b; });

  const DEFS = `
    <filter id="boil" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence id="boil-noise" type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="1"/>
      <feDisplacementMap in="SourceGraphic" scale="6"/>
    </filter>
    <filter id="glow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <pattern id="tiles" width="120" height="120" patternUnits="userSpaceOnUse">
      <rect width="120" height="120" fill="#fbf7f2"/><rect width="60" height="60" fill="#2a2733"/><rect x="60" y="60" width="60" height="60" fill="#2a2733"/>
    </pattern>
    <pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse">
      <rect width="40" height="40" fill="#9fd6e9"/><circle cx="12" cy="12" r="5" fill="#fff" opacity=".7"/><circle cx="32" cy="30" r="5" fill="#fff" opacity=".7"/>
    </pattern>
    <linearGradient id="plaque" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f29bb4"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient>
    <path id="heart" d="M0,12 C-30,-8 -22,-34 0,-20 C22,-34 30,-8 0,12 Z"/>
    <path id="tuft" d="M-18,0 q10,-14 20,0 q10,14 20,0" fill="none" stroke="#e0b44a" stroke-width="9" stroke-linecap="round"/>`;

  // ---------------------------------------------------------------- set
  const salon = () => `
    <rect x="0" y="0" width="1080" height="1310" fill="#fde8e4"/>
    <path d="M0,1180 H1080" stroke="#f5cfc8" stroke-width="10"/>
    <rect x="0" y="1310" width="1080" height="610" fill="url(#tiles)" opacity=".22"/>
    <path class="ink-t" d="M0,1310 H1080"/>
    <g transform="rotate(-3 520 660)" filter="url(#glow)">
      <text x="520" y="675" text-anchor="middle" font-family="Hand" font-size="64" fill="#ff5fa2">Juste les Pointes</text>
    </g>
    <rect class="ink" x="950" y="880" width="140" height="18" fill="#c98b52" stroke-width="5"/>
    <rect class="ink" x="962" y="820" width="30" height="60" rx="8" fill="#ffb3cf" stroke-width="5"/>
    <rect class="ink" x="1000" y="800" width="26" height="80" rx="8" fill="#b9a4f5" stroke-width="5"/>
    <g transform="translate(1034 826)">
      <rect class="ink" x="0" y="0" width="52" height="52" rx="8" fill="url(#plaque)" stroke-width="4"/>
      <use href="#heart" transform="translate(26 22) scale(.45)" fill="none" stroke="#fff" stroke-width="5"/>
    </g>`;

  const chair = () => `
    <ellipse class="ink" cx="520" cy="1420" rx="112" ry="22" fill="#55505f"/>
    <rect class="ink" x="505" y="1300" width="30" height="120" fill="#8a8494"/>
    <rect class="ink" x="420" y="930" width="200" height="280" rx="34" fill="#7a4a8a"/>
    <rect class="ink" x="395" y="1235" width="250" height="66" rx="24" fill="#7a4a8a"/>`;

  // ---------------------------------------------------------------- Nadia
  // face: 'blasee' | 'surprise'; brow: windows with her eyebrow raised;
  // sip: times she drinks from her mug.
  function nadia(o = {}) {
    const face = o.face || 'blasee';
    return `<g id="nadia">
      <rect class="ink" x="128" y="1150" width="44" height="290" fill="#2a2733" stroke-width="6"/>
      <rect class="ink" x="186" y="1150" width="44" height="290" fill="#2a2733" stroke-width="6"/>
      <ellipse class="ink" cx="148" cy="1446" rx="46" ry="18" fill="#1d1a24" stroke-width="6"/>
      <ellipse class="ink" cx="210" cy="1446" rx="46" ry="18" fill="#1d1a24" stroke-width="6"/>
      <path class="ink" d="M96,915 Q178,878 260,915 L270,1165 Q178,1185 86,1165 Z" fill="#3a3644"/>
      <rect x="166" y="872" width="26" height="40" fill="#c68a5e"/>
      <rect class="ink" x="72" y="690" width="212" height="198" rx="80" fill="#16131c"/>
      <circle class="ink" cx="178" cy="800" r="90" fill="#c68a5e"/>
      <path class="ink" d="M90,768 Q92,700 178,700 Q264,700 266,768 Z" fill="#16131c"/>
      <path d="M124,706 L114,766 L136,766 L146,704 Z" fill="#d6337a"/>
      <circle cx="88" cy="846" r="20" fill="none" stroke="#e5b33a" stroke-width="7"/>
      <circle cx="268" cy="846" r="20" fill="none" stroke="#e5b33a" stroke-width="7"/>
      ${part(face, 'blasee', null, `
        <path class="ink-t" d="M130,786 H162" stroke-width="7"/>
        <g id="nadia-brow"><path class="ink-t" d="M192,778 Q210,764 228,780" stroke-width="7"/></g>
        <circle cx="148" cy="816" r="9" fill="#1d1a24"/><circle cx="210" cy="816" r="9" fill="#1d1a24"/>
        <path d="M132,808 H164 M194,808 H226" stroke="#c68a5e" stroke-width="10"/>
        <path class="ink-t" d="M132,806 H164 M194,806 H226" stroke-width="6"/>
        <path d="M160,852 Q182,860 198,846" stroke="#7a2848" stroke-width="7" fill="none" stroke-linecap="round"/>`)}
      ${part(face, 'surprise', null, `
        <path class="ink-t" d="M128,772 Q146,760 164,772 M192,772 Q210,760 228,772" stroke-width="7"/>
        <circle class="ink" cx="148" cy="812" r="16" fill="#fff" stroke-width="5"/><circle class="ink" cx="210" cy="812" r="16" fill="#fff" stroke-width="5"/>
        <circle cx="148" cy="814" r="6" fill="#1d1a24"/><circle cx="210" cy="814" r="6" fill="#1d1a24"/>
        <ellipse cx="180" cy="856" rx="10" ry="13" fill="#7a2848"/>`)}
      <g id="nadia-mug">
        <rect class="ink" x="196" y="948" width="56" height="64" rx="8" fill="#fff" stroke-width="6"/>
        <path class="ink-t" d="M252,962 q22,0 22,18 q0,18 -22,18" stroke-width="6"/>
        <text x="224" y="988" text-anchor="middle" font-family="PJS" font-weight="800" font-size="18">NON</text>
      </g>
      <path d="M100,1020 L240,1010" stroke="#1d1a24" stroke-width="52" stroke-linecap="round"/>
      <path d="M100,1020 L240,1010" stroke="#3a3644" stroke-width="38" stroke-linecap="round"/>
      <circle class="ink" cx="236" cy="1004" r="24" fill="#c68a5e" stroke-width="6"/>
    </g>`;
  }

  // ---------------------------------------------------------------- client
  // hair: 'long' | 'shoulder' | 'bob' | 'pixie'
  // face: 'smile' | 'neutral' | 'fake' | 'annoyed' | 'wow' | 'hot'
  // red: windows where she turns red (hot water, anger)
  function client(o = {}) {
    const hair = o.hair || 'long', face = o.face || 'smile';
    const BACK = {
      long: 'M434,830 Q434,745 520,745 Q606,745 606,830 L616,1000 Q604,1016 590,1002 Q584,1018 570,1004 L566,905 H474 L470,1004 Q456,1018 450,1002 Q436,1016 424,1000 Z',
      shoulder: 'M432,830 Q432,745 520,745 Q608,745 608,830 L614,940 Q600,952 588,940 L566,905 H474 L452,940 Q440,952 426,940 Z',
      bob: 'M430,830 Q430,745 520,745 Q610,745 610,830 L614,900 Q520,922 426,900 Z',
    };
    const TOP = {
      long: 'M438,832 Q440,755 520,755 Q600,755 602,832 Q578,790 520,794 Q462,790 438,832 Z',
      shoulder: 'M438,832 Q440,755 520,755 Q600,755 602,832 Q578,790 520,794 Q462,790 438,832 Z',
      bob: 'M436,826 Q440,752 520,752 Q600,752 604,826 Z',
      pixie: 'M440,828 Q440,756 520,756 Q600,756 600,828 Q596,800 572,796 L566,812 L552,794 L536,810 L520,792 L504,810 L488,794 L474,812 L468,796 Q444,800 440,828 Z',
    };
    const backs = Object.entries(BACK).map(([k, d]) => part(hair, k, null, `<path class="ink" d="${d}" fill="#f2cf6b"/>`)).join('');
    const tops = Object.entries(TOP).map(([k, d]) => part(hair, k, null, `<path class="ink" d="${d}" fill="#f2cf6b"/>`)).join('');
    const redW = o.red ? `<circle id="client-red" data-win="${o.red}" cx="520" cy="850" r="80" fill="#ff5a5a" opacity="0"/>` : '';
    return `<g id="client">
      <rect class="ink" x="450" y="1290" width="42" height="110" fill="#5a7fc7" stroke-width="6"/>
      <rect class="ink" x="548" y="1290" width="42" height="110" fill="#5a7fc7" stroke-width="6"/>
      <ellipse class="ink" cx="462" cy="1404" rx="40" ry="16" fill="#e5484d" stroke-width="6"/>
      <ellipse class="ink" cx="578" cy="1404" rx="40" ry="16" fill="#e5484d" stroke-width="6"/>
      <path class="ink" d="M520,912 L352,1292 Q520,1316 688,1292 Z" fill="url(#dots)"/>
      ${backs}
      <rect x="506" y="902" width="28" height="22" fill="#f3cfb3"/>
      <circle class="ink" cx="520" cy="850" r="84" fill="#f3cfb3"/>
      ${redW}
      ${tops}
      ${part(face, 'smile', null, `<circle cx="494" cy="858" r="9" fill="#1d1a24"/><circle cx="546" cy="858" r="9" fill="#1d1a24"/><path class="ink-t" d="M494,892 Q520,910 546,892"/>`)}
      ${part(face, 'neutral', null, `<circle cx="494" cy="858" r="9" fill="#1d1a24"/><circle cx="546" cy="858" r="9" fill="#1d1a24"/><path class="ink-t" d="M502,898 H538"/>`)}
      ${part(face, 'annoyed', null, `<path class="ink-t" d="M478,834 L508,846 M562,834 L532,846" stroke-width="7"/><circle cx="494" cy="860" r="9" fill="#1d1a24"/><circle cx="546" cy="860" r="9" fill="#1d1a24"/><path class="ink-t" d="M500,904 Q520,890 540,904"/>`)}
      ${part(face, 'wow', null, `<circle class="ink" cx="494" cy="856" r="16" fill="#fff" stroke-width="5"/><circle class="ink" cx="546" cy="856" r="16" fill="#fff" stroke-width="5"/><circle cx="494" cy="858" r="5" fill="#1d1a24"/><circle cx="546" cy="858" r="5" fill="#1d1a24"/><ellipse class="ink" cx="520" cy="898" rx="12" ry="16" fill="#7a2848" stroke-width="5"/>`)}
      ${part(face, 'hot', null, `<path class="ink-t" d="M482,850 l16,8 l-16,8 M558,850 l-16,8 l16,8" stroke-width="6"/><rect class="ink" x="486" y="882" width="68" height="28" rx="10" fill="#fff" stroke-width="5"/><path class="ink-t" d="M503,884 V908 M520,884 V908 M537,884 V908" stroke-width="3"/>`)}
      ${part(face, 'fake', null, `<ellipse class="client-twitch ink" cx="494" cy="856" rx="16" ry="16" fill="#fff" stroke-width="5"/><circle class="ink" cx="546" cy="856" r="16" fill="#fff" stroke-width="5"/><circle cx="494" cy="858" r="5" fill="#1d1a24"/><circle cx="546" cy="858" r="5" fill="#1d1a24"/><rect class="ink" x="474" y="880" width="92" height="30" rx="12" fill="#fff" stroke-width="5"/><path class="ink-t" d="M497,882 V908 M520,882 V908 M543,882 V908" stroke-width="3"/>`)}
      ${o.sweat ? `<g data-on="${o.sweat}"><path d="M604,800 Q618,830 604,842 Q590,830 604,800 Z" fill="#8fd3ff" class="ink" stroke-width="4"/></g>` : ''}
    </g>`;
  }

  // ---------------------------------------------------------------- Chloé
  // eyes: 'happy' | 'focus' | 'panic'; mouth: 'grin' | 'o' | 'tongue' | 'wobbly'
  // tool: 'scissors' | 'ruler' | 'shower' | 'mirror' | 'none'
  // cheer: windows with her free arm up; sweat: windows; jumps: [times]; snips: windows
  function chloe(o = {}) {
    const eyes = o.eyes || 'happy', mouth = o.mouth || 'grin', tool = o.tool || 'scissors';
    return `<g id="chloe">
      <rect class="ink" x="770" y="1180" width="42" height="260" fill="#f59ac0" stroke-width="6"/>
      <rect class="ink" x="830" y="1180" width="42" height="260" fill="#f59ac0" stroke-width="6"/>
      <ellipse class="ink" cx="786" cy="1446" rx="44" ry="18" fill="#fff" stroke-width="6"/>
      <ellipse class="ink" cx="856" cy="1446" rx="44" ry="18" fill="#fff" stroke-width="6"/>
      <path class="ink" d="M712,935 Q822,895 932,935 L938,1195 H706 Z" fill="#fff"/>
      <path class="ink" d="M750,990 H894 L900,1195 H744 Z" fill="#f59ac0"/>
      <path class="ink-t" d="M760,992 L745,935 M884,992 L899,935" stroke-width="6"/>
      <rect class="ink" x="790" y="1030" width="64" height="50" rx="8" fill="#f07aa9" stroke-width="5"/>
      <g id="pony">
        <circle class="ink" cx="822" cy="690" r="56" fill="#d9793a"/>
        <circle class="ink" cx="775" cy="702" r="40" fill="#d9793a"/>
        <circle class="ink" cx="869" cy="702" r="40" fill="#d9793a"/>
        <circle class="ink" cx="822" cy="640" r="44" fill="#d9793a"/>
        <circle cx="822" cy="690" r="50" fill="#d9793a"/>
        <circle cx="822" cy="648" r="38" fill="#d9793a"/>
      </g>
      <ellipse class="ink" cx="822" cy="742" rx="42" ry="16" fill="#ff5fa2" stroke-width="6"/>
      <rect x="808" y="892" width="28" height="30" fill="#f7d6bf"/>
      <circle class="ink" cx="822" cy="822" r="84" fill="#f7d6bf"/>
      <path class="ink" d="M739,818 Q740,742 822,742 Q904,742 905,818 Q882,774 822,776 Q762,774 739,818 Z" fill="#d9793a"/>
      <g fill="#c9763f"><circle cx="784" cy="850" r="4"/><circle cx="798" cy="858" r="4"/><circle cx="846" cy="858" r="4"/><circle cx="860" cy="850" r="4"/></g>
      ${part(eyes, 'happy', null, `
        <ellipse cx="796" cy="822" rx="13" ry="17" fill="#1d1a24"/><ellipse cx="848" cy="822" rx="13" ry="17" fill="#1d1a24"/>
        <circle cx="800" cy="815" r="5" fill="#fff"/><circle cx="852" cy="815" r="5" fill="#fff"/>
        <path class="ink-t" d="M778,790 Q796,780 812,788 M832,788 Q848,780 866,790" stroke-width="6"/>`)}
      ${part(eyes, 'focus', null, `
        <path class="ink-t" d="M782,824 H812 M834,824 H864" stroke-width="7"/>
        <path class="ink-t" d="M780,800 L812,810 M866,800 L834,810" stroke-width="6"/>`)}
      ${part(eyes, 'panic', null, `
        <circle class="ink" cx="796" cy="822" r="18" fill="#fff" stroke-width="5"/><circle class="ink" cx="848" cy="822" r="18" fill="#fff" stroke-width="5"/>
        <circle cx="796" cy="824" r="5" fill="#1d1a24"/><circle cx="848" cy="824" r="5" fill="#1d1a24"/>
        <path class="ink-t" d="M778,786 Q796,774 812,784 M832,784 Q848,774 866,786" stroke-width="6"/>`)}
      ${part(mouth, 'grin', null, `<path class="ink" d="M796,864 Q822,900 848,864 Z" fill="#b3364f" stroke-width="5"/>`)}
      ${part(mouth, 'o', null, `<ellipse class="ink" cx="822" cy="874" rx="12" ry="15" fill="#b3364f" stroke-width="5"/>`)}
      ${part(mouth, 'tongue', null, `<path class="ink-t" d="M802,868 Q822,876 842,868"/><ellipse class="ink" cx="840" cy="878" rx="11" ry="9" fill="#ff7a8a" stroke-width="4"/>`)}
      ${part(mouth, 'wobbly', null, `<path class="ink-t" d="M798,872 l8,-6 l8,6 l8,-6 l8,6 l8,-6 l8,6"/>`)}
      ${o.sweat ? `<g data-on="${o.sweat}"><path d="M910,770 Q924,800 910,812 Q896,800 910,770 Z" fill="#8fd3ff" class="ink" stroke-width="4"/></g>` : ''}
      ${windows(o.cheer ? invert(o.cheer) : null)}
        <path d="M915,965 L935,1150" stroke="#1d1a24" stroke-width="48" stroke-linecap="round"/>
        <path d="M915,965 L935,1150" stroke="#fff" stroke-width="34" stroke-linecap="round"/>
        <circle class="ink" cx="936" cy="1166" r="24" fill="#f7d6bf" stroke-width="6"/>
      </g>
      ${o.cheer ? `<g data-on="${o.cheer}">
        <path d="M915,965 L975,840" stroke="#1d1a24" stroke-width="48" stroke-linecap="round"/>
        <path d="M915,965 L975,840" stroke="#fff" stroke-width="34" stroke-linecap="round"/>
        <circle class="ink" cx="980" cy="826" r="24" fill="#f7d6bf" stroke-width="6"/></g>` : ''}
      <path d="M728,965 L650,880" stroke="#1d1a24" stroke-width="48" stroke-linecap="round"/>
      <path d="M728,965 L650,880" stroke="#fff" stroke-width="34" stroke-linecap="round"/>
      ${part(tool, 'scissors', null, `<g transform="translate(632 830)">
        <circle class="ink" cx="-14" cy="40" r="14" fill="none" stroke-width="6"/><circle class="ink" cx="16" cy="40" r="14" fill="none" stroke-width="6"/>
        <path class="blade1 ink" d="M-6,30 L-20,-50 L-2,24 Z" fill="#cfd3da" stroke-width="5"/>
        <path class="blade2 ink" d="M8,30 L22,-50 L2,24 Z" fill="#cfd3da" stroke-width="5"/></g>`)}
      ${part(tool, 'ruler', null, `<g transform="rotate(-8 640 860)">
        <rect class="ink" x="560" y="842" width="170" height="36" rx="4" fill="#ffd84a" stroke-width="5"/>
        <path class="ink-t" d="M580,842 v14 M600,842 v9 M620,842 v14 M640,842 v9 M660,842 v14 M680,842 v9 M700,842 v14" stroke-width="3"/></g>`)}
      ${part(tool, 'shower', null, `
        <rect class="ink" x="600" y="830" width="30" height="80" rx="10" fill="#cfd3da" stroke-width="6" transform="rotate(30 615 870)"/>
        <ellipse class="ink" cx="592" cy="812" rx="32" ry="18" fill="#cfd3da" stroke-width="6"/>
        <path d="M575,826 L545,780 M592,830 L575,775 M610,828 L605,772" stroke="#6cc3f5" stroke-width="7" stroke-linecap="round"/>`)}
      ${part(tool, 'mirror', null, `
        <rect class="ink" x="636" y="820" width="22" height="80" rx="8" fill="#b9a4f5" stroke-width="6"/>
        <circle class="ink" cx="647" cy="775" r="56" fill="#dff1fb" stroke-width="7"/>
        <path d="M620,760 l22,-22 M630,785 l34,-34" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`)}
      <circle class="ink" cx="650" cy="880" r="24" fill="#f7d6bf" stroke-width="6"/>
    </g>`;
  }

  // The complement of a set of windows over [0, 999).
  function invert(w) {
    const iv = w.split(',').map((x) => x.split('-').map(Number)).sort((a, b) => a[0] - b[0]);
    const out = []; let cur = 0;
    for (const [a, b] of iv) { if (a > cur) out.push(`${cur}-${a}`); cur = Math.max(cur, b); }
    out.push(`${cur}-999`);
    return out.join(',');
  }

  // ---------------------------------------------------------------- build
  window.Salon = {
    build(o = {}) {
      const stage = document.getElementById('stage');
      const salonOn = o.salon || '0-999';
      stage.innerHTML = `<defs>${DEFS}</defs><g filter="url(#boil)">
        <g data-on="${salonOn}">
          ${salon()}${nadia(o.nadia)}${chair()}${client(o.client)}
          <g id="pile"></g><g id="tufts"></g>
          ${chloe(o.chloe)}
          <g id="hearts" fill="#E57A97" stroke="#1d1a24" stroke-width="3"></g>
        </g>
        ${o.extra || ''}
      </g>`;

      const tuftTimes = o.tufts || [];
      const tuftsG = stage.querySelector('#tufts'), pileG = stage.querySelector('#pile');
      const tufts = tuftTimes.map(() => { const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#tuft'); tuftsG.appendChild(u); return u; });
      const pile = tuftTimes.map((_, i) => {
        const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#tuft');
        u.setAttribute('transform', `translate(${560 + ((i * 53) % 190) - 60} ${1335 + ((i * 29) % 40)}) rotate(${(i * 67) % 180})`);
        pileG.appendChild(u); return u;
      });
      const heartsG = stage.querySelector('#hearts');
      const hearts = (o.hearts ? [[720, 600], [940, 640], [1000, 760]] : []).map(([x, y]) => {
        const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#heart'); u.dataset.x = x; u.dataset.y = y; heartsG.appendChild(u); return u;
      });

      const c = o.chloe || {}, n = o.nadia || {}, cl = o.client || {};
      onTick((t) => {
        // Scissors open and close while she cuts
        const open = inWin(c.snips, t) ? (Math.sin(t * 36) > 0 ? 14 : 0) : 8;
        stage.querySelectorAll('.blade1').forEach((b) => b.setAttribute('transform', `rotate(${-open} -4 28)`));
        stage.querySelectorAll('.blade2').forEach((b) => b.setAttribute('transform', `rotate(${open} 4 28)`));
        // Hair tufts fly to the floor, then join the pile
        tufts.forEach((el, i) => {
          const t0 = tuftTimes[i];
          cartoon.arc(el, t, t0, 0.6, [600, 840], [560 + ((i * 53) % 190) - 60, 1335], 60, i % 2 ? 300 : -260);
          el.style.display = t >= t0 + 0.6 ? 'none' : '';
          pile[i].style.display = t >= t0 + 0.6 ? '' : 'none';
        });
        // Chloé: ponytail bounce, jumps
        stage.querySelector('#pony').setAttribute('transform', `rotate(${Math.sin(t * 5) * 4} 822 742)`);
        const dy = (c.jumps || []).reduce((s, j) => s + cartoon.jump(t, j, 70, 0.4), 0);
        stage.querySelector('#chloe').setAttribute('transform', `translate(0 ${dy})`);
        hearts.forEach((h, k) => {
          const s = cartoon.clamp((t - o.hearts - k * 0.12) / 0.3);
          h.setAttribute('transform', `translate(${h.dataset.x} ${Number(h.dataset.y) + Math.sin(t * 6 + k) * 8}) scale(${1.3 * s})`);
        });
        // Nadia: raised eyebrow, coffee sips
        const brow = stage.querySelector('#nadia-brow');
        if (brow) brow.setAttribute('transform', inWin(n.brow, t) ? 'translate(0 -14)' : '');
        const sip = (n.sip || []).reduce((s, t0) => s + (t > t0 && t < t0 + 1 ? Math.sin((t - t0) * Math.PI) : 0), 0);
        stage.querySelector('#nadia-mug').setAttribute('transform', `translate(${-48 * sip} ${-150 * sip}) rotate(${-25 * sip} 224 980)`);
        // Client: turning red, twitching eye
        const red = stage.querySelector('#client-red');
        if (red) red.setAttribute('opacity', inWin(red.dataset.win, t) ? 0.4 : 0);
        const tw = (t * 2.8) % 1 < 0.16;
        stage.querySelectorAll('.client-twitch').forEach((e) => e.setAttribute('ry', tw ? 3 : 16));
      });
    },
  };
})();
