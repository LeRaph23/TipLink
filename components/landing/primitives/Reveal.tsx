'use client';

import { useEffect, useRef, useState } from 'react';

// Scroll-reveal wrapper. Stays a client component — it is the one thing that
// pins parts of the landing tree client-side, and rewriting it in CSS is a
// visual-regression risk with no test net to catch it.
export function Reveal({ children, delay = 0, style: s = {} }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    // Fires a little before the block enters the screen, so a fast scroll
    // does not land on empty space (UI/UX audit, UX-11).
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } }, { threshold: 0, rootMargin: '0px 0px 10% 0px' });
    obs.observe(el); return () => obs.disconnect();
  }, []);
  return (
    // 320 ms and 12 px, delay capped at 120 ms: the 600 ms reveals with up to
    // 280 ms of delay left whole screens blank while scrolling.
    <div ref={ref} style={{ opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(12px)', transition: `opacity 320ms ${Math.min(delay, 120)}ms cubic-bezier(.22,1,.36,1), transform 320ms ${Math.min(delay, 120)}ms cubic-bezier(.22,1,.36,1)`, ...s }}>
      {children}
    </div>
  );
}

// Animated number that counts up once scrolled into view. Parses the leading
// numeric part of a label ("3 sec", "2 min", "0 €") and re-appends the suffix.
