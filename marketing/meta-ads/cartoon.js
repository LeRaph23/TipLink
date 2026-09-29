// Helpers for the hand-drawn sketches, driven by base.js's timeline.
//   data-on="1.2-3.5,8-9"  → visible only inside those windows (seconds)
//   data-pop="1.2"         → springs in at 1.2 s (put it on an inner element:
//                            it owns the CSS transform)
// Motion helpers (arc, jump, shake) work from the current time; arc sets the
// SVG transform attribute, so give it an element drawn around (0,0).
(function () {
  const clamp = (x) => Math.min(Math.max(x, 0), 1);
  const spring = (x) => (x >= 1 ? 1 : 1 - Math.cos(x * Math.PI * 2.2) * Math.exp(-x * 5.5));

  window.cartoon = {
    clamp,
    // Parabolic throw from (x0,y0) to (x1,y1), peaking h px above the start.
    arc(el, t, t0, dur, [x0, y0], [x1, y1], h, spin = 360) {
      const s = clamp((t - t0) / dur);
      const x = x0 + (x1 - x0) * s;
      const y = y0 + (y1 - y0) * s - 4 * h * s * (1 - s);
      el.setAttribute('visibility', t < t0 ? 'hidden' : 'visible');
      el.setAttribute('transform', `translate(${x} ${y}) rotate(${spin * s})`);
    },
    jump(t, t0, height = 80, dur = 0.45) {
      const s = (t - t0) / dur;
      return s > 0 && s < 1 ? -4 * height * s * (1 - s) : 0;
    },
    shake(t, t0, t1, amp = 8, freq = 18) {
      return t > t0 && t < t1 ? amp * Math.sin(t * freq * Math.PI * 2) : 0;
    },
    between: (t, a, b) => t >= a && t < b,
  };

  onTick((t) => {
    for (const el of document.querySelectorAll('[data-on]')) {
      const on = el.dataset.on.split(',').some((w) => { const [a, b] = w.split('-').map(Number); return t >= a && t < b; });
      el.style.display = on ? '' : 'none';
    }
    for (const el of document.querySelectorAll('[data-pop]')) {
      const s = clamp((t - Number(el.dataset.pop)) / 0.4);
      el.style.transform = `scale(${spring(s)})`;
      el.style.opacity = s > 0 ? 1 : 0;
    }
    // Line boil: the ink wobbles a little, four drawings a second, like a hand-drawn cartoon.
    const turb = document.getElementById('boil-noise');
    if (turb) turb.setAttribute('seed', String(1 + (Math.floor(t * 8) % 4)));
  });
})();
