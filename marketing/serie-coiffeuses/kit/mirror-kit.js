// Mirror kit for "Juste les Pointes": the camera is the salon mirror. The
// client sits facing us, Chloé works behind her, Nadia steps into the frame.
// Semi-realistic flat illustration: real proportions, soft shading, thin
// coloured outlines.
//
//   Mirror.build({ client: {...}, chloe: {...}, nadia: {...}, insert: {...} })
//
// Each state option is a single value or a map { 'start-end': value } in
// seconds (same windows as cartoon.js data-on). Load after base.js and
// cartoon.js, with an empty <svg class="stage" id="stage" viewBox="0 0 1080 1920">.
(function () {
  const NS = 'http://www.w3.org/2000/svg';

  function when(states, value) {
    if (states == null) return null;
    if (typeof states === 'string') return states === value ? '0-999' : null;
    const wins = Object.entries(states).filter(([, v]) => v === value).map(([w]) => w);
    return wins.length ? wins.join(',') : null;
  }
  const part = (states, value, svg) => { const w = when(states, value); return w ? `<g data-on="${w}">${svg}</g>` : ''; };
  const inWin = (w, t) => !!w && w.split(',').some((x) => { const [a, b] = x.split('-').map(Number); return t >= a && t < b; });
  const LINE = '#4a3440';

  const DEFS = `
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6ddd6"/><stop offset="1" stop-color="#ecc9c0"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset=".55" stop-color="#fff" stop-opacity=".12"/><stop offset=".62" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="skinA" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9b896"/><stop offset=".35" stop-color="#f6d3b8"/><stop offset="1" stop-color="#e3ad89"/></linearGradient>
    <linearGradient id="skinB" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f0c7ad"/><stop offset=".4" stop-color="#fbe0cd"/><stop offset="1" stop-color="#eab999"/></linearGradient>
    <linearGradient id="skinC" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9c6444"/><stop offset=".4" stop-color="#b87a55"/><stop offset="1" stop-color="#8f5a3c"/></linearGradient>
    <linearGradient id="hairA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9b7048"/><stop offset=".5" stop-color="#b98a58"/><stop offset="1" stop-color="#d4a86f"/></linearGradient>
    <linearGradient id="hairB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b4532a"/><stop offset="1" stop-color="#d66f38"/></linearGradient>
    <linearGradient id="cape" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#231f2a"/><stop offset=".45" stop-color="#3a3444"/><stop offset="1" stop-color="#211d27"/></linearGradient>
    <radialGradient id="blush"><stop offset="0" stop-color="#f08a8a" stop-opacity=".45"/><stop offset="1" stop-color="#f08a8a" stop-opacity="0"/></radialGradient>
    <linearGradient id="menace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d1020" stop-opacity=".55"/><stop offset=".45" stop-color="#1d1020" stop-opacity=".25"/><stop offset=".6" stop-color="#1d1020" stop-opacity="0"/></linearGradient>
    <radialGradient id="bulb"><stop offset="0" stop-color="#fffdf0"/><stop offset=".6" stop-color="#ffe9a8"/><stop offset="1" stop-color="#ffd66e" stop-opacity="0"/></radialGradient>
    <linearGradient id="plaque" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f29bb4"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient>
    <path id="heart" d="M0,12 C-30,-8 -22,-34 0,-20 C22,-34 30,-8 0,12 Z"/>
    <clipPath id="mirror"><rect x="56" y="150" width="968" height="1640" rx="34"/></clipPath>`;

  // ------------------------------------------------------------ the room seen in the mirror
  const room = () => `
    <rect x="0" y="0" width="1080" height="1920" fill="url(#wall)"/>
    <rect x="600" y="300" width="300" height="330" rx="10" fill="#fdf6ee" stroke="#e5cfc4" stroke-width="10"/>
    <path d="M750,300 V630 M600,465 H900" stroke="#e5cfc4" stroke-width="8"/>
    <rect x="80" y="610" width="360" height="16" rx="4" fill="#c79a74"/>
    <rect x="100" y="540" width="34" height="70" rx="10" fill="#f3a6c0"/><rect x="146" y="520" width="28" height="90" rx="9" fill="#b9a4f5"/>
    <rect x="186" y="556" width="40" height="54" rx="10" fill="#8fd3c7"/><rect x="238" y="530" width="30" height="80" rx="9" fill="#f7c873"/>
    <g transform="translate(300 556)"><rect width="54" height="54" rx="8" fill="url(#plaque)"/><use href="#heart" transform="translate(27 23) scale(.45)" fill="none" stroke="#fff" stroke-width="5"/></g>
    <path d="M960,760 q-60,-80 -20,-170 q40,60 20,170 M960,760 q10,-100 70,-140 q0,90 -70,140 M960,760 q-90,-30 -110,-100 q80,10 110,100" fill="#7fb38a"/>
    <path d="M920,760 h80 l-12,90 h-56 Z" fill="#d98a5a"/>`;

  const frame = () => `
    <rect x="40" y="134" width="1000" height="1672" rx="44" fill="none" stroke="#d9d4de" stroke-width="22"/>
    <rect x="40" y="134" width="1000" height="1672" rx="44" fill="none" stroke="#b9b2c0" stroke-width="3"/>
    ${[110, 250, 390, 530, 670, 810, 950].map((x) => `<circle cx="${x}" cy="118" r="30" fill="url(#bulb)"/><circle cx="${x}" cy="118" r="12" fill="#fffdf0"/>`).join('')}
    ${[330, 560, 790, 1020, 1250, 1480, 1710].map((y) => `<circle cx="22" cy="${y}" r="30" fill="url(#bulb)"/><circle cx="22" cy="${y}" r="11" fill="#fffdf0"/><circle cx="1058" cy="${y}" r="30" fill="url(#bulb)"/><circle cx="1058" cy="${y}" r="11" fill="#fffdf0"/>`).join('')}`;

  // ------------------------------------------------------------ client (seated, facing the mirror)
  // face: 'neutral' | 'stern' | 'menace' | 'shock' | 'sad'
  function client(o = {}) {
    const face = o.face || 'neutral';
    const eyes = (lid, iris = 10) => `
      <path d="M404,982 Q428,964 452,982 Q428,996 404,982 Z" fill="#fff"/>
      <path d="M488,982 Q512,964 536,982 Q512,996 488,982 Z" fill="#fff"/>
      <circle cx="428" cy="982" r="${iris}" fill="#6a4a2e"/><circle cx="512" cy="982" r="${iris}" fill="#6a4a2e"/>
      <circle cx="428" cy="982" r="${iris / 2}" fill="#1d1418"/><circle cx="512" cy="982" r="${iris / 2}" fill="#1d1418"/>
      <circle cx="432" cy="978" r="3" fill="#fff"/><circle cx="516" cy="978" r="3" fill="#fff"/>
      ${lid ? `<path d="M400,${982 - lid} Q428,${962 - lid} 456,${982 - lid} L456,${982 + lid - 12} Q428,${970 + lid - 12} 400,${982 + lid - 12} Z" fill="#efc3a4"/>` : ''}
      <path d="M402,982 Q428,${lid ? 976 : 962} 454,982 M486,982 Q512,${lid ? 976 : 962} 538,982" fill="none" stroke="#2a1a1e" stroke-width="4" stroke-linecap="round"/>`;
    return `<g id="client">
      <path d="M470,1112 C380,1116 262,1160 176,1262 C126,1330 104,1530 96,1800 L846,1800 C836,1530 814,1330 764,1262 C678,1160 560,1116 470,1112 Z" fill="url(#cape)"/>
      <path d="M300,1300 Q280,1520 300,1790 M640,1300 Q660,1520 640,1790 M470,1180 Q460,1480 470,1790" stroke="#4a4356" stroke-width="5" fill="none"/>
      <g id="client-hair-sides">
        <path d="M372,930 Q334,1080 324,1230 Q314,1380 356,1490 Q392,1456 402,1320 Q408,1160 398,1050 Z" fill="url(#hairA)"/>
        <path d="M568,930 Q606,1080 616,1230 Q626,1380 584,1490 Q548,1456 538,1320 Q532,1160 542,1050 Z" fill="url(#hairA)"/>
        <path d="M352,1060 Q334,1250 356,1460 M380,1080 Q372,1260 382,1420 M588,1060 Q606,1250 584,1460 M560,1080 Q568,1260 558,1420" stroke="#e2bd87" stroke-width="4" fill="none" opacity=".8"/>
      </g>
      <path d="M440,1060 L440,1122 Q470,1136 500,1122 L500,1060 Z" fill="#e2ad8b"/>
      <path d="M426,1112 Q470,1134 514,1112" stroke="#15121a" stroke-width="16" fill="none" stroke-linecap="round"/>
      <ellipse cx="364" cy="990" rx="14" ry="24" fill="#eab896"/><ellipse cx="576" cy="990" rx="14" ry="24" fill="#eab896"/>
      <path id="client-face" d="M368,960 Q368,852 470,852 Q572,852 572,960 Q572,1046 522,1090 Q470,1122 418,1090 Q368,1046 368,960 Z" fill="url(#skinA)" stroke="${LINE}" stroke-width="3"/>
      <ellipse cx="410" cy="1030" rx="34" ry="20" fill="url(#blush)"/><ellipse cx="530" cy="1030" rx="34" ry="20" fill="url(#blush)"/>
      <path d="M470,992 Q464,1022 456,1032 Q470,1040 484,1032" stroke="#c98f6e" stroke-width="4" fill="none" stroke-linecap="round"/>
      ${part(face, 'neutral', `${eyes(0)}
        <path d="M400,946 Q426,934 456,944 M484,944 Q514,934 540,946" stroke="#6a4a2e" stroke-width="8" fill="none" stroke-linecap="round"/>
        <path d="M444,1062 Q458,1054 470,1059 Q482,1054 496,1062 Q470,1068 444,1062 Z" fill="#c05c69"/><path d="M444,1062 Q470,1080 496,1062 Q470,1070 444,1062 Z" fill="#d6707b"/>`)}
      ${part(face, 'stern', `${eyes(9)}
        <path d="M400,940 Q428,946 456,958 M484,958 Q512,946 540,940" stroke="#5a3a22" stroke-width="9" fill="none" stroke-linecap="round"/>
        <path d="M446,1066 H494" stroke="#b0505c" stroke-width="7" stroke-linecap="round"/>`)}
      ${part(face, 'menace', `${eyes(7, 7)}
        <path d="M398,936 Q428,950 456,962 M484,962 Q512,950 542,936" stroke="#3a2416" stroke-width="10" fill="none" stroke-linecap="round"/>
        <path d="M448,1066 Q470,1060 492,1066" stroke="#8a3844" stroke-width="7" fill="none" stroke-linecap="round"/>
        <path d="M368,960 Q368,852 470,852 Q572,852 572,960 Q572,1046 522,1090 Q470,1122 418,1090 Q368,1046 368,960 Z" fill="url(#menace)"/>`)}
      ${part(face, 'shock', `${eyes(0, 6)}
        <path d="M398,932 Q426,918 456,928 M484,928 Q514,918 542,932" stroke="#6a4a2e" stroke-width="8" fill="none" stroke-linecap="round"/>
        <ellipse cx="470" cy="1066" rx="12" ry="15" fill="#7a2f3c"/>`)}
      ${part(face, 'sad', `${eyes(0, 9)}
        <path d="M404,992 Q428,1000 452,992 M488,992 Q512,1000 536,992" stroke="#9fd6f2" stroke-width="5" fill="none"/>
        <path d="M400,944 Q420,928 454,934 M486,934 Q520,928 540,944" stroke="#6a4a2e" stroke-width="8" fill="none" stroke-linecap="round"/>
        <path d="M446,1070 Q458,1058 470,1066 Q482,1058 494,1070" stroke="#b0505c" stroke-width="6" fill="none" stroke-linecap="round"/>
        <path id="client-tear" d="M430,998 Q438,1020 430,1030 Q422,1020 430,998 Z" fill="#8fd3ff"/>`)}
      <path d="M362,968 Q346,830 470,818 Q594,830 578,968 Q566,890 500,872 Q470,900 440,872 Q382,890 372,944 Z" fill="url(#hairA)" stroke="${LINE}" stroke-width="2"/>
      <path d="M470,826 Q466,850 470,874 M420,836 Q392,866 382,930 M520,836 Q548,866 558,930" stroke="#e2bd87" stroke-width="4" fill="none" opacity=".8"/>
    </g>`;
  }

  // ------------------------------------------------------------ Chloé (standing behind, to the right)
  // face: 'grin' | 'worried' | 'proud' | 'panic'; tool: 'scissors' | 'tweezers' | 'none'
  function chloe(o = {}) {
    const face = o.face || 'grin', tool = o.tool || 'scissors';
    const eyes = (r = 9, look = 0) => `
      <ellipse cx="740" cy="752" rx="17" ry="11" fill="#fff"/><ellipse cx="806" cy="752" rx="17" ry="11" fill="#fff"/>
      <circle cx="${740 + look}" cy="752" r="${r}" fill="#3f7a4a"/><circle cx="${806 + look}" cy="752" r="${r}" fill="#3f7a4a"/>
      <circle cx="${740 + look}" cy="752" r="${r / 2}" fill="#1d1418"/><circle cx="${806 + look}" cy="752" r="${r / 2}" fill="#1d1418"/>
      <circle cx="${743 + look}" cy="748" r="3" fill="#fff"/><circle cx="${809 + look}" cy="748" r="3" fill="#fff"/>
      <path d="M722,750 Q740,736 758,750 M788,750 Q806,736 824,750" stroke="#2a1a1e" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    return `<g id="chloe">
      <path d="M636,900 Q772,850 910,900 Q940,1000 944,1300 L620,1300 Q622,1000 636,900 Z" fill="#221e29"/>
      <path d="M716,905 L716,1300 M830,905 L830,1300" stroke="#E57A97" stroke-width="16"/>
      <path d="M700,1000 H846 V1300 H700 Z" fill="#E57A97"/>
      <path d="M752,830 L752,890 Q772,904 792,890 L792,830 Z" fill="#e8b89a"/>
      <g id="pony">
        <circle cx="772" cy="600" r="54" fill="url(#hairB)"/><circle cx="730" cy="620" r="36" fill="url(#hairB)"/><circle cx="814" cy="620" r="36" fill="url(#hairB)"/><circle cx="772" cy="556" r="38" fill="url(#hairB)"/>
        <path d="M740,590 q14,-20 28,0 q14,20 28,0 M748,560 q12,-14 24,0 q12,14 24,0 M724,628 q10,-12 20,0" stroke="#f0955a" stroke-width="5" fill="none"/>
      </g>
      <ellipse cx="772" cy="648" rx="36" ry="12" fill="#ff5fa2"/>
      <path d="M690,760 Q690,660 772,660 Q854,660 854,760 Q854,830 812,864 Q772,890 732,864 Q690,830 690,760 Z" fill="url(#skinB)" stroke="${LINE}" stroke-width="3"/>
      <g fill="#d88b5e"><circle cx="724" cy="790" r="3.5"/><circle cx="738" cy="798" r="3.5"/><circle cx="752" cy="792" r="3.5"/><circle cx="794" cy="792" r="3.5"/><circle cx="808" cy="798" r="3.5"/><circle cx="822" cy="790" r="3.5"/></g>
      <path d="M773,770 Q768,792 762,800 Q773,806 784,800" stroke="#d29a7c" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      ${part(face, 'grin', `${eyes()}
        <path d="M720,724 Q740,712 760,720 M786,720 Q806,712 826,724" stroke="#a24d25" stroke-width="7" fill="none" stroke-linecap="round"/>
        <path d="M740,820 Q773,856 806,820 Q773,830 740,820 Z" fill="#fff" stroke="#9c3a4a" stroke-width="4"/>`)}
      ${part(face, 'worried', `${eyes(7)}
        <path d="M720,716 Q742,722 760,712 M786,712 Q804,722 826,716" stroke="#a24d25" stroke-width="7" fill="none" stroke-linecap="round"/>
        <path d="M750,832 q6,-6 12,0 q6,6 12,0 q6,-6 12,0 q6,6 12,0" stroke="#9c3a4a" stroke-width="4" fill="none"/>
        <path d="M862,708 Q874,734 862,744 Q850,734 862,708 Z" fill="#8fd3ff"/><path d="M680,730 Q690,752 680,760 Q670,752 680,730 Z" fill="#8fd3ff"/>`)}
      ${part(face, 'proud', `
        <path d="M722,752 Q740,740 758,752 M788,752 Q806,740 824,752" stroke="#2a1a1e" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path d="M720,718 Q740,706 760,714 M786,714 Q806,706 826,718" stroke="#a24d25" stroke-width="7" fill="none" stroke-linecap="round"/>
        <path d="M744,822 Q773,846 802,822" stroke="#9c3a4a" stroke-width="5" fill="none" stroke-linecap="round"/>
        <ellipse cx="722" cy="800" rx="22" ry="12" fill="url(#blush)"/><ellipse cx="824" cy="800" rx="22" ry="12" fill="url(#blush)"/>`)}
      ${part(face, 'panic', `${eyes(5)}
        <path d="M718,712 Q740,700 760,708 M786,708 Q806,700 828,712" stroke="#a24d25" stroke-width="7" fill="none" stroke-linecap="round"/>
        <ellipse cx="773" cy="830" rx="16" ry="18" fill="#7a2f3c"/>`)}
      <path d="M692,752 Q684,664 772,652 Q860,664 852,752 Q836,700 780,690 Q740,700 716,690 Q700,712 692,752 Z" fill="url(#hairB)" stroke="${LINE}" stroke-width="2"/>
      <!-- working arm -->
      <path d="M660,930 Q600,1010 590,1060" stroke="#221e29" stroke-width="58" fill="none" stroke-linecap="round"/>
      <path d="M592,1050 Q580,1000 598,${tool === 'tweezers' ? 900 : 960}" stroke="#e8b89a" stroke-width="40" fill="none" stroke-linecap="round"/>
      ${part(tool, 'scissors', `<g transform="translate(600 930) rotate(-35)">
        <ellipse cx="-14" cy="34" rx="12" ry="16" fill="none" stroke="#8a8fa0" stroke-width="7"/><ellipse cx="16" cy="34" rx="12" ry="16" fill="none" stroke="#8a8fa0" stroke-width="7"/>
        <path class="blade1" d="M-4,20 L-10,-80 L4,18 Z" fill="#d7dbe4" stroke="#8a8fa0" stroke-width="3"/>
        <path class="blade2" d="M6,20 L12,-80 L-2,18 Z" fill="#d7dbe4" stroke="#8a8fa0" stroke-width="3"/></g>`)}
      ${part(tool, 'tweezers', `<g transform="translate(600 880)">
        <path d="M-6,20 L-3,-70 M6,20 L3,-70" stroke="#a7acba" stroke-width="7" stroke-linecap="round"/>
        <path d="M0,-78 l4,-10" stroke="#b98a58" stroke-width="3"/>
        <circle cx="4" cy="-96" r="18" fill="none" stroke="#ffe27a" stroke-width="3" opacity=".9"/>
        <path d="M4,-126 v-12 M30,-110 l8,-8 M-22,-110 l-8,-8" stroke="#ffe27a" stroke-width="4" stroke-linecap="round"/></g>`)}
      <circle cx="598" cy="${tool === 'tweezers' ? 896 : 956}" r="24" fill="#e8b89a"/>
    </g>`;
  }

  // ------------------------------------------------------------ Nadia (steps into the frame)
  function nadia() {
    return `<g id="nadia">
      <path d="M860,960 Q960,910 1080,940 L1080,1400 L850,1400 Z" fill="#2b2733"/>
      <path d="M922,880 L922,950 Q944,962 966,950 L966,880 Z" fill="#9c6444"/>
      <path d="M852,700 Q850,610 944,604 Q1040,610 1036,700 L1040,880 Q944,900 848,880 Z" fill="#15121a"/>
      <path d="M864,760 Q864,668 944,668 Q1024,668 1024,760 Q1024,830 984,862 Q944,884 904,862 Q864,830 864,760 Z" fill="url(#skinC)" stroke="${LINE}" stroke-width="3"/>
      <path d="M858,730 Q858,640 944,636 Q1030,640 1030,730 L1030,712 Q944,700 858,712 Z" fill="#15121a"/>
      <path d="M892,650 L884,712 L904,712 L912,646 Z" fill="#d6337a"/>
      <circle cx="862" cy="822" r="18" fill="none" stroke="#e5b33a" stroke-width="6"/>
      <path d="M896,752 H930 M958,752 H992" stroke="#1d1418" stroke-width="5" stroke-linecap="round"/>
      <circle cx="913" cy="760" r="7" fill="#1d1418"/><circle cx="975" cy="760" r="7" fill="#1d1418"/>
      <path d="M894,734 H932 M956,728 Q975,718 994,730" stroke="#15121a" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M930,824 Q950,830 966,820" stroke="#6b2a3a" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M880,1000 Q820,1000 760,990" stroke="#2b2733" stroke-width="56" fill="none" stroke-linecap="round"/>
      <path d="M770,990 L720,986" stroke="#9c6444" stroke-width="40" stroke-linecap="round"/>
      <g transform="translate(690 960) rotate(-8)">
        <rect x="-44" y="-150" width="88" height="190" rx="18" fill="#fff" stroke="#8a8494" stroke-width="5"/>
        <rect x="-44" y="-190" width="88" height="54" rx="14" fill="#8b5cf6"/>
        <text x="0" y="-40" text-anchor="middle" font-family="PJS" font-weight="800" font-size="30" fill="#8b5cf6" transform="rotate(-90 0 -52)">COLLE</text>
      </g>
      <circle cx="730" cy="986" r="30" fill="#9c6444"/>
    </g>`;
  }

  // ------------------------------------------------------------ extreme close-up on one hair
  function insert() {
    let strands = '';
    for (let i = 0; i < 26; i++) {
      const x = 40 + i * 40, c = ['#9b7048', '#b98a58', '#c99a64', '#a87c4e'][i % 4];
      strands += `<path d="M${x},0 C${x + 30},500 ${x - 30},1100 ${x + 10},1920" stroke="${c}" stroke-width="22" fill="none" opacity=".9"/>`;
    }
    return `<g id="insert">
      <rect width="1080" height="1920" fill="#6e4f33"/>${strands}
      <path d="M560,0 C590,500 530,1100 570,1920" stroke="#ffd98a" stroke-width="26" fill="none"/>
      <g id="big-scissors">
        <path class="bigblade1" d="M1100,760 L600,905 L1100,830 Z" fill="#dfe3ea" stroke="#7d8394" stroke-width="6"/>
        <path class="bigblade2" d="M1100,1050 L600,905 L1100,980 Z" fill="#cfd4dd" stroke="#7d8394" stroke-width="6"/>
      </g>
      <g id="snipped"><rect x="548" y="890" width="44" height="26" rx="6" fill="#ffd98a" stroke="#8a6440" stroke-width="4"/><path d="M570,850 v-24 M610,866 l16,-16 M530,866 l-16,-16" stroke="#fff3b0" stroke-width="6" stroke-linecap="round"/></g>
    </g>`;
  }

  window.Mirror = {
    build(o = {}) {
      const stage = document.getElementById('stage');
      stage.innerHTML = `<defs>${DEFS}</defs>
        <g data-on="${o.mirrorOn || '0-999'}">
          <rect width="1080" height="1920" fill="#efe3d6"/>
          <g clip-path="url(#mirror)">
            ${room()}
            ${client(o.client)}
            ${chloe(o.chloe)}
            ${o.nadia ? `<g data-on="${o.nadia.on}">${nadia()}</g>` : ''}
            <rect x="56" y="150" width="968" height="1640" fill="url(#glass)"/>
          </g>
          ${frame()}
        </g>
        ${o.insert ? `<g data-on="${o.insert.on}">${insert()}</g>` : ''}`;

      const c = o.chloe || {}, n = o.nadia || {}, ins = o.insert || {};
      onTick((t) => {
        const open = inWin(c.snips, t) ? (Math.sin(t * 36) > 0 ? 12 : 0) : 6;
        stage.querySelectorAll('.blade1').forEach((b) => b.setAttribute('transform', `rotate(${-open} 0 20)`));
        stage.querySelectorAll('.blade2').forEach((b) => b.setAttribute('transform', `rotate(${open} 0 20)`));
        stage.querySelector('#pony').setAttribute('transform', `rotate(${Math.sin(t * 5) * 3} 772 648)`);
        // Chloé trembles when nervous, jumps when proud
        const shake = inWin(c.tremble, t) ? Math.sin(t * 70) * 4 : 0;
        const dy = (c.jumps || []).reduce((s, j) => s + cartoon.jump(t, j, 40, 0.35), 0);
        stage.querySelector('#chloe').setAttribute('transform', `translate(${shake} ${dy})`);
        // The client leans in when she threatens
        const lean = inWin((o.client || {}).lean, t) ? 1 : 0;
        stage.querySelector('#client').setAttribute('transform', lean ? 'translate(470 1000) scale(1.06) translate(-470 -1000)' : '');
        const tear = stage.querySelector('#client-tear');
        if (tear) tear.setAttribute('transform', `translate(0 ${((t * 40) % 60)})`);
        // Nadia slides in from the right
        if (n.on) {
          const a = Number(n.on.split('-')[0]);
          const s = cartoon.clamp((t - a) / 0.35);
          stage.querySelector('#nadia').setAttribute('transform', `translate(${(1 - s) * 420} 0)`);
        }
        // Insert: the giant scissors close on one hair, the bit drifts down
        if (ins.snip) {
          const close = cartoon.clamp((t - ins.snip + 0.25) / 0.25);
          stage.querySelector('.bigblade1').setAttribute('transform', `rotate(${close * 7} 600 905)`);
          stage.querySelector('.bigblade2').setAttribute('transform', `rotate(${-close * 7} 600 905)`);
          const fall = cartoon.clamp((t - ins.snip) / 1.6);
          stage.querySelector('#snipped').setAttribute('transform', `translate(${Math.sin(fall * 9) * 30} ${fall * 500}) rotate(${fall * 120} 570 903)`);
        }
      });
    },
  };
})();
