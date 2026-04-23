'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { ImageUpload } from '@/components/ImageUpload';
import { updateGroup } from '@/actions/group';

interface Initial {
  name: string;
  logoUrl: string | null;
  legalName: string | null;
  vatNumber: string | null;
  tipThresholds: number[];
}

interface Labels {
  sectionBranding: string;
  logo: string;
  logoHelp: string;
  teamName: string;
  sectionTips: string;
  tipsHelp: string;
  sectionLegal: string;
  legalName: string;
  vatNumber: string;
  save: string;
  saving: string;
  saved: string;
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11.5, fontWeight: 600,
  color: 'var(--text-2)', textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: 8,
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 700,
  color: 'var(--text-3)', textTransform: 'uppercase',
  letterSpacing: '0.08em', marginBottom: 14,
};

const fieldStyle = (focused: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '9px 12px', borderRadius: 'var(--radius-sm)',
  background: 'var(--surface-2)',
  border: `1.5px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
  color: 'var(--text)', fontSize: 13.5, outline: 'none',
  boxShadow: focused ? '0 0 0 3px var(--accent-muted)' : 'none',
  transition: 'border-color 120ms, box-shadow 120ms',
  fontFamily: 'var(--font)',
});

const sectionStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius)',
  padding: 20, marginBottom: 16,
};

export function SettingsForm({
  groupId,
  initial,
  labels,
}: {
  groupId: string;
  initial: Initial;
  labels: Labels;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [legalName, setLegalName] = useState(initial.legalName ?? '');
  const [vatNumber, setVatNumber] = useState(initial.vatNumber ?? '');
  const [thresholds, setThresholds] = useState<string[]>(
    initial.tipThresholds.map((v) => String(v))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    const parsed = thresholds.map((v) => Number.parseFloat(v));
    if (parsed.some((v) => !Number.isFinite(v) || v <= 0)) {
      setError('Invalid tip amounts');
      setSaving(false);
      return;
    }

    const res = await updateGroup({
      groupId,
      name: name.trim(),
      logoUrl,
      legalName: legalName.trim() || null,
      vatNumber: vatNumber.trim() || null,
      tipThresholds: parsed,
    });
    setSaving(false);
    if ('error' in res) {
      setError(res.error);
    } else {
      setSaved(true);
      router.refresh();
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <section style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>{labels.sectionBranding}</h2>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>{labels.logo}</label>
          <ImageUpload value={logoUrl} onChange={setLogoUrl} folder="logos" shape="square" />
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>{labels.logoHelp}</p>
        </div>

        <div>
          <label style={labelStyle}>{labels.teamName}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={fieldStyle(focus === 'name')}
            onFocus={() => setFocus('name')}
            onBlur={() => setFocus(null)}
          />
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>{labels.sectionTips}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.6 }}>
          {labels.tipsHelp}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {thresholds.map((v, i) => (
            <input
              key={i}
              type="number"
              min="0"
              step="0.5"
              value={v}
              onChange={(e) => {
                const next = [...thresholds];
                next[i] = e.target.value;
                setThresholds(next);
              }}
              style={fieldStyle(focus === `thr-${i}`)}
              onFocus={() => setFocus(`thr-${i}`)}
              onBlur={() => setFocus(null)}
              required
            />
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>{labels.sectionLegal}</h2>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{labels.legalName}</label>
          <input
            type="text"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            style={fieldStyle(focus === 'legal')}
            onFocus={() => setFocus('legal')}
            onBlur={() => setFocus(null)}
          />
        </div>
        <div>
          <label style={labelStyle}>{labels.vatNumber}</label>
          <input
            type="text"
            value={vatNumber}
            onChange={(e) => setVatNumber(e.target.value)}
            placeholder="FR12345678901"
            style={fieldStyle(focus === 'vat')}
            onFocus={() => setFocus('vat')}
            onBlur={() => setFocus(null)}
          />
        </div>
      </section>

      {error && <p style={{ fontSize: 12.5, color: 'var(--error)', marginBottom: 12 }}>{error}</p>}
      {saved && <p style={{ fontSize: 12.5, color: 'var(--success)', marginBottom: 12 }}>{labels.saved}</p>}

      <button
        type="submit"
        disabled={saving}
        style={{
          padding: '10px 18px', borderRadius: 'var(--radius)',
          background: 'var(--accent)', color: 'var(--accent-fg)',
          fontSize: 13.5, fontWeight: 600, border: 'none',
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.6 : 1, fontFamily: 'var(--font)',
        }}
      >
        {saving ? labels.saving : labels.save}
      </button>
    </form>
  );
}
