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
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } }, { threshold: 0.07 });
    obs.observe(el); return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(22px)', transition: `opacity 600ms ${delay}ms cubic-bezier(.22,1,.36,1), transform 600ms ${delay}ms cubic-bezier(.22,1,.36,1)`, ...s }}>
      {children}
    </div>
  );
}

// Animated number that counts up once scrolled into view. Parses the leading
// numeric part of a label ("3 sec", "2 min", "0 €") and re-appends the suffix.
