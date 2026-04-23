'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { inviteStaffMember } from '@/actions/staff';

interface Labels {
  fullName: string;
  fullNameHint: string;
  fullNamePlaceholder: string;
  email: string;
  establishment: string;
  role: string;
  roleStaff: string;
  roleManager: string;
  send: string;
  sending: string;
  sentTemplate: string;
  errorGeneric: string;
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11.5, fontWeight: 600,
  color: 'var(--text-2)', textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: 8,
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

export function InviteStaffForm({
  establishments,
  labels,
}: {
  establishments: Array<{ id: string; name: string }>;
  labels: Labels;
}) {
  const locale = useLocale();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [establishmentId, setEstablishmentId] = useState(establishments[0]?.id ?? '');
  const [role, setRole] = useState<'staff' | 'manager'>('staff');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await inviteStaffMember({
        fullName: fullName.trim(),
        email: email.trim(),
        establishmentId,
        role,
        locale,
      });
      if ('error' in res) {
        setError(res.error || labels.errorGeneric);
      } else {
        setSuccess(labels.sentTemplate.replace('{email}', email));
        setTimeout(() => router.push('/dashboard/staff'), 1500);
      }
    } catch {
      setError(labels.errorGeneric);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={labelStyle}>{labels.fullName}</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={labels.fullNamePlaceholder}
          required
          autoFocus
          style={fieldStyle(focus === 'name')}
          onFocus={() => setFocus('name')}
          onBlur={() => setFocus(null)}
        />
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
          {labels.fullNameHint}
        </p>
      </div>

      <div>
        <label style={labelStyle}>{labels.email}</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={fieldStyle(focus === 'email')}
          onFocus={() => setFocus('email')}
          onBlur={() => setFocus(null)}
        />
      </div>

      <div>
        <label style={labelStyle}>{labels.establishment}</label>
        <select
          value={establishmentId}
          onChange={(e) => setEstablishmentId(e.target.value)}
          required
          style={fieldStyle(focus === 'est')}
          onFocus={() => setFocus('est')}
          onBlur={() => setFocus(null)}
        >
          {establishments.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>{labels.role}</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'staff' | 'manager')}
          style={fieldStyle(focus === 'role')}
          onFocus={() => setFocus('role')}
          onBlur={() => setFocus(null)}
        >
          <option value="staff">{labels.roleStaff}</option>
          <option value="manager">{labels.roleManager}</option>
        </select>
      </div>

      {error && <p style={{ fontSize: 12.5, color: 'var(--error)' }}>{error}</p>}
      {success && <p style={{ fontSize: 12.5, color: 'var(--success)' }}>{success}</p>}

      <button
        type="submit"
        disabled={loading || establishments.length === 0}
        style={{
          padding: '10px 18px', borderRadius: 'var(--radius)',
          background: 'var(--accent)', color: 'var(--accent-fg)',
          fontSize: 13.5, fontWeight: 600, border: 'none',
          cursor: (loading || establishments.length === 0) ? 'not-allowed' : 'pointer',
          opacity: (loading || establishments.length === 0) ? 0.6 : 1,
          fontFamily: 'var(--font)', marginTop: 4,
        }}
      >
        {loading ? labels.sending : labels.send}
      </button>
    </form>
  );
}
