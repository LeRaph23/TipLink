'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { updateStaffMember, deactivateStaffMember } from '@/actions/staff';
import { ImageUpload } from '@/components/ImageUpload';

interface Labels {
  fullName: string;
  fullNameHint: string;
  avatar: string;
  save: string;
  saving: string;
  saved: string;
  deactivate: string;
  deactivateConfirm: string;
  inactive: string;
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11.5, fontWeight: 600,
  color: 'var(--text-2)', textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: 8,
};

const inputStyle = (focused: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '9px 12px', borderRadius: 'var(--radius-sm)',
  background: 'var(--surface-2)',
  border: `1.5px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
  color: 'var(--text)', fontSize: 13.5, outline: 'none',
  boxShadow: focused ? '0 0 0 3px var(--accent-muted)' : 'none',
  transition: 'border-color 120ms, box-shadow 120ms',
  fontFamily: 'var(--font)',
});

export function StaffDetailForm({
  staffId,
  initialFullName,
  initialAvatarUrl,
  isActive,
  labels,
}: {
  staffId: string;
  initialFullName: string;
  initialAvatarUrl: string | null;
  isActive: boolean;
  labels: Labels;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialFullName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await updateStaffMember(staffId, { fullName: fullName.trim(), avatarUrl });
    setSaving(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    setSavedAt(Date.now());
    router.refresh();
  };

  const onDeactivate = async () => {
    if (!confirm(labels.deactivateConfirm)) return;
    setSaving(true);
    setError(null);
    const res = await deactivateStaffMember(staffId);
    setSaving(false);
    // Deactivation is blocked when the member still has pending tips — surface
    // that instead of silently redirecting as if it succeeded.
    if ('error' in res) {
      setError(res.error);
      return;
    }
    router.push('/dashboard/staff');
  };

  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <label style={labelStyle}>{labels.avatar}</label>
        <ImageUpload
          value={avatarUrl}
          onChange={setAvatarUrl}
          folder="avatars"
          shape="circle"
        />
      </div>

      <div>
        <label style={labelStyle}>{labels.fullName}</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Alice"
          required
          style={inputStyle(focus === 'name')}
          onFocus={() => setFocus('name')}
          onBlur={() => setFocus(null)}
        />
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
          {labels.fullNameHint}
        </p>
      </div>

      {error && <p style={{ fontSize: 12.5, color: 'var(--error)' }}>{error}</p>}
      {savedAt && <p style={{ fontSize: 12.5, color: 'var(--success)' }}>{labels.saved}</p>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '9px 18px', borderRadius: 'var(--radius)',
            background: 'var(--accent)', color: 'var(--accent-fg)',
            fontSize: 13, fontWeight: 600, border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1, fontFamily: 'var(--font)',
          }}
        >
          {saving ? labels.saving : labels.save}
        </button>

        {isActive && (
          <button
            type="button"
            onClick={onDeactivate}
            disabled={saving}
            style={{
              padding: '9px 18px', borderRadius: 'var(--radius)',
              background: 'transparent',
              border: '1px solid color-mix(in oklch, var(--error) 40%, transparent)',
              color: 'var(--error)', fontSize: 13, fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1, fontFamily: 'var(--font)',
            }}
          >
            {labels.deactivate}
          </button>
        )}
      </div>
    </form>
  );
}
