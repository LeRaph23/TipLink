'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';

type Props = {
  /** Base path without extension: `${src}.mp4`, `${src}.webm`, `${src}-poster.jpg`. */
  src: string;
  label: string;
};

/**
 * A short silent tutorial: a looping preview in the page, and the full video,
 * large and with its controls, one tap away.
 *
 * The preview alone was not enough. On a phone the three tiles are about a
 * hundred pixels wide, and tapping one only restarted the loop it was already
 * playing, so the video could not actually be watched.
 *
 * The preview only plays while it is on screen, so three of them side by side
 * do not all download and decode at once.
 */
export function TutorialVideo({ src, label }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const en = useLocale() === 'en';

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // React sets `muted` as a property only, which autoplay policies ignore.
    video.muted = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !open) void video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.5 },
    );
    io.observe(video);
    return () => io.disconnect();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={en ? `${label} (open full size)` : `${label} (ouvrir en grand)`}
        style={{
          position: 'relative', display: 'block', width: '100%', padding: 0, border: 0,
          background: 'none', cursor: 'pointer', touchAction: 'manipulation',
        }}
      >
        <video
          ref={ref}
          poster={`${src}-poster.jpg`}
          aria-hidden
          muted loop playsInline preload="none"
          style={{ display: 'block', width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', background: '#fdf9fa', pointerEvents: 'none' }}
        >
          {/* MP4 first (lighter); WebM for browsers without H.264. */}
          <source src={`${src}.mp4`} type="video/mp4" />
          <source src={`${src}.webm`} type="video/webm" />
        </video>
        <span
          aria-hidden
          style={{
            position: 'absolute', right: 8, bottom: 8, width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(15,15,18,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1.5v9l7.5-4.5z" fill="#fff" /></svg>
        </span>
      </button>
      {open && <VideoViewer src={src} label={label} closeLabel={en ? 'Close the video' : 'Fermer la vidéo'} onClose={() => setOpen(false)} />}
    </>
  );
}

function VideoViewer({ src, label, closeLabel, onClose }: { src: string; label: string; closeLabel: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Lock the page behind the viewer, and always give it back exactly as it
    // was: a lock that outlives its overlay is a page that no longer scrolls.
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => {
      root.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        style={{
          position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', right: 12,
          width: 44, height: 44, borderRadius: '50%', border: 0, cursor: 'pointer',
          background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 22, lineHeight: 1,
        }}
      >
        ×
      </button>
      <video
        controls autoPlay muted loop playsInline
        poster={`${src}-poster.jpg`}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', borderRadius: 12, background: '#000' }}
      >
        <source src={`${src}.mp4`} type="video/mp4" />
        <source src={`${src}.webm`} type="video/webm" />
      </video>
    </div>
  );
}
