'use client';

import { useEffect, useRef, useState } from 'react';

export function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const match = /^(\d+(?:\.\d+)?)(.*)$/.exec(value.trim());
  const target = match ? parseFloat(match[1]) : 0;
  const decimals = match && match[1].includes('.') ? match[1].split('.')[1].length : 0;
  const suffix = match ? match[2] : '';
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      raf = requestAnimationFrame(() => setVal(target));
      return () => cancelAnimationFrame(raf);
    }
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / 900);
        setVal(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => { obs.disconnect(); cancelAnimationFrame(raf); };
  }, [target]);
  if (!match) return <span ref={ref}>{value}</span>;
  return <span ref={ref}>{val.toFixed(decimals)}{suffix}</span>;
}
