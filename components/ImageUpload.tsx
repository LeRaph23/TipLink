'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
  folder: 'avatars' | 'logos';
  shape?: 'circle' | 'square';
  maxSizeBytes?: number;
  maxDim?: number;
}

async function compressImage(file: File, maxDim: number): Promise<Blob> {
  if (file.type === 'image/svg+xml') return file;

  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      0.88
    )
  );
}

export function ImageUpload({
  value,
  onChange,
  folder,
  shape = 'circle',
  maxSizeBytes = 2 * 1024 * 1024,
  maxDim = 512,
}: Props) {
  const t = useTranslations('imageUpload');
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const blob = file.size > maxSizeBytes || /^image\/(png|jpe?g|webp)$/.test(file.type)
        ? await compressImage(file, maxDim)
        : file;

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('notAuthenticated'));

      const ext = blob.type === 'image/svg+xml' ? 'svg' : 'jpg';
      const path = `${folder}/${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('public-media')
        .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from('public-media').getPublicUrl(path);
      onChange(pub.publicUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('uploadFailed');
      setError(msg);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const preview = value;
  const size = 72;
  const radius = shape === 'circle' ? '50%' : 'var(--radius)';

  const primaryBtn: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    fontSize: 12.5, fontWeight: 600,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.6 : 1,
    fontFamily: 'var(--font)',
    whiteSpace: 'nowrap',
    transition: 'background 120ms, border-color 120ms',
  };

  const secondaryBtn: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    border: '1px solid transparent',
    color: 'var(--text-3)',
    fontSize: 12.5, fontWeight: 500,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.6 : 1,
    fontFamily: 'var(--font)',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div
        aria-hidden
        style={{
          width: size, height: size,
          borderRadius: radius, overflow: 'hidden',
          background: 'var(--surface-2)',
          border: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-3)', fontSize: 20, flexShrink: 0,
        }}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M12 16V4M12 4l-5 5M12 4l5 5M5 20h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          style={{ display: 'none' }}
          onChange={onFile}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={onPick} disabled={busy} style={primaryBtn}>
            {busy ? t('uploading') : preview ? t('replace') : t('upload')}
          </button>
          {preview && (
            <button type="button" onClick={() => onChange(null)} disabled={busy} style={secondaryBtn}>
              {t('remove')}
            </button>
          )}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>{t('hint')}</p>
        {error && <p style={{ fontSize: 11.5, color: 'var(--error)', margin: 0 }}>{error}</p>}
      </div>
    </div>
  );
}
