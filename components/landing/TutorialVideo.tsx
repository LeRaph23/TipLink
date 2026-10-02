'use client';

import { useEffect, useRef } from 'react';

type Props = {
  /** Base path without extension: `${src}.mp4`, `${src}.webm`, `${src}-poster.jpg`. */
  src: string;
  label: string;
};

/**
 * A short silent tutorial loop. It only plays while it is on screen, so three
 * of them side by side do not all download and decode at once.
 */
export function TutorialVideo({ src, label }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // React sets `muted` as a property only, which autoplay policies ignore.
    video.muted = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.5 },
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      poster={`${src}-poster.jpg`}
      aria-label={label}
      muted loop playsInline preload="none"
      // Low-power mode can refuse autoplay: a tap starts it.
      onClick={(e) => { void e.currentTarget.play().catch(() => {}); }}
      style={{ display: 'block', width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', background: '#fdf9fa' }}
    >
      {/* MP4 first (lighter); WebM for browsers without H.264. */}
      <source src={`${src}.mp4`} type="video/mp4" />
      <source src={`${src}.webm`} type="video/webm" />
    </video>
  );
}
