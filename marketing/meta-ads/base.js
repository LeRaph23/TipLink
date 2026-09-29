// Timeline driver shared by every ad. `window.seek(ms)` puts every CSS
// animation and every scripted counter at the same instant, so render.mjs can
// capture exact frames. Opened in a browser without ?capture, it loops live.
(function () {
  const ticks = [];
  window.onTick = (fn) => ticks.push(fn);

  window.seek = (ms) => {
    for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms; }
    for (const fn of ticks) fn(ms / 1000);
  };

  const ease = (x) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
  const eur = (v) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  window.fx = { ease, eur, lerp: (a, b, x) => a + (b - a) * ease(x) };

  window.addEventListener('load', () => {
    if (new URLSearchParams(location.search).has('capture')) { window.seek(0); return; }
    const dur = Number(document.body.dataset.duration) * 1000;
    const t0 = performance.now();
    const loop = () => { window.seek((performance.now() - t0) % dur); requestAnimationFrame(loop); };
    loop();
  });
})();
