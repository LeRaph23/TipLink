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
 * With a mouse the preview only plays while the pointer is over it: three
 * screens moving side by side at once is too much, and the visitor would not
 * know where to look. Touch screens have no hover, and there the tiles stack,
 * so the preview plays while it is on screen, one at a time.
 *
 * A still preview does not look like a video, so a pill on it says so, with
 * its length. While the preview plays the pill shrinks to a corner button,
 * which opens it full size, so it does not hide the captions at the bottom.
 */
export function TutorialVideo({ src, label }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const en = useLocale() === 'en';

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // The metadata often lands before hydration, when React would miss the event.
    const read = () => setDuration(video.duration);
    if (video.readyState >= 1) read();
    else video.addEventListener('loadedmetadata', read, { once: true });
    return () => video.removeEventListener('loadedmetadata', read);
  }, []);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // React sets `muted` as a property only, which autoplay policies ignore.
    video.muted = true;
    if (open) { video.pause(); return; }
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const play = () => void video.play().catch(() => {});
      const pause = () => video.pause();
      const tile = video.parentElement!;
      tile.addEventListener('mouseenter', play);
      tile.addEventListener('mouseleave', pause);
      tile.addEventListener('focus', play);
      tile.addEventListener('blur', pause);
      return () => {
        tile.removeEventListener('mouseenter', play);
        tile.removeEventListener('mouseleave', pause);
        tile.removeEventListener('focus', play);
        tile.removeEventListener('blur', pause);
        video.pause();
      };
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void video.play().catch(() => {});
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
          muted loop playsInline preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          style={{ display: 'block', width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', background: '#fdf9fa', pointerEvents: 'none' }}
        >
          {/* MP4 first (lighter); WebM for browsers without H.264. */}
          <source src={`${src}.mp4`} type="video/mp4" />
          <source src={`${src}.webm`} type="video/webm" />
        </video>
        {playing ? (
          // While it plays, step out of the way: the bottom of the screens carries captions.
          <span
            aria-hidden
            title={en ? 'Watch full size' : 'Voir en grand'}
            style={{
              position: 'absolute', right: 10, bottom: 10, width: 34, height: 34, borderRadius: '50%',
              background: 'rgba(15,15,18,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"><path d="M7.5 1.5h3v3M4.5 10.5h-3v-3M10.5 1.5 7 5M1.5 10.5 5 7" /></svg>
          </span>
        ) : (
          <span
            aria-hidden
            style={{
              position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)',
              display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
              padding: '9px 16px 9px 12px', borderRadius: 999, background: 'rgba(15,15,18,0.82)',
              color: '#fff', fontSize: 13.5, fontWeight: 700, boxShadow: '0 6px 18px -6px rgba(0,0,0,0.45)',
            }}
          >
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#E57A97', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="10" height="10" viewBox="0 0 12 12"><path d="M3 1.5v9l7.5-4.5z" fill="#fff" /></svg>
            </span>
            {en ? 'Watch the video' : 'Voir la vidéo'}
            {duration !== null && Number.isFinite(duration) && (
              <span style={{ fontWeight: 500, opacity: 0.7 }}>{`${Math.floor(Math.round(duration) / 60)}:${String(Math.round(duration) % 60).padStart(2, '0')}`}</span>
            )}
          </span>
        )}
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
