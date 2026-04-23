'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

const inputStyle = (focused: boolean): React.CSSProperties => ({
  width: '100%',
  background: 'var(--surface-2)',
  border: `1.5px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
  borderRadius: 'var(--radius-sm)',
  padding: '10px 12px',
  color: 'var(--text)', fontSize: 13.5, outline: 'none',
  boxShadow: focused ? '0 0 0 3px var(--accent-muted)' : 'none',
  transition: 'border-color 120ms, box-shadow 120ms',
  fontFamily: 'var(--font)',
});

const labelStyle: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 500, color: 'var(--text-2)', display: 'block', marginBottom: 5,
};

export function ContactForm({ locale }: { locale: string }) {
  const t = useTranslations('contact');
  const tc = useTranslations('common');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [message, setMessage] = useState('');
  const [focus, setFocus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, phone, company, team_size: teamSize, message, locale }),
      });
      if (!res.ok) throw new Error('Failed');
      setDone(true);
    } catch {
      setError(t('errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div style={{
        padding: '20px 24px', textAlign: 'center',
        background: 'var(--success-bg)',
        border: '1px solid color-mix(in oklch, var(--success) 30%, transparent)',
        borderRadius: 'var(--radius)', color: 'var(--success)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{t('successTitle')}</div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>{t('successBody')}</div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>{t('name')}</label>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)} required
            style={inputStyle(focus === 'name')}
            onFocus={() => setFocus('name')} onBlur={() => setFocus(null)}
          />
        </div>
        <div>
          <label style={labelStyle}>{t('email')}</label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)} required
            style={inputStyle(focus === 'email')}
            onFocus={() => setFocus('email')} onBlur={() => setFocus(null)}
          />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>{t('phone')}</label>
          <input
            type="tel" value={phone} onChange={e => setPhone(e.target.value)}
            style={inputStyle(focus === 'phone')}
            onFocus={() => setFocus('phone')} onBlur={() => setFocus(null)}
          />
        </div>
        <div>
          <label style={labelStyle}>{t('company')}</label>
          <input
            type="text" value={company} onChange={e => setCompany(e.target.value)}
            style={inputStyle(focus === 'company')}
            onFocus={() => setFocus('company')} onBlur={() => setFocus(null)}
          />
        </div>
      </div>
      <div>
        <label style={labelStyle}>{t('teamSize')}</label>
        <select
          value={teamSize} onChange={e => setTeamSize(e.target.value)}
          style={{ ...inputStyle(focus === 'size'), cursor: 'pointer' }}
          onFocus={() => setFocus('size')} onBlur={() => setFocus(null)}
        >
          <option value="">—</option>
          <option value="1-10">1-10</option>
          <option value="11-50">11-50</option>
          <option value="51-200">51-200</option>
          <option value="200+">200+</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>{t('message')}</label>
        <textarea
          value={message} onChange={e => setMessage(e.target.value)} required rows={5}
          style={{ ...inputStyle(focus === 'msg'), resize: 'vertical', minHeight: 100 }}
          onFocus={() => setFocus('msg')} onBlur={() => setFocus(null)}
        />
      </div>

      {error && <p style={{ fontSize: 12, color: 'var(--error)' }}>{error}</p>}

      <button
        type="submit" disabled={submitting || !name || !email || !message}
        style={{
          padding: '11px 18px', borderRadius: 'var(--radius)',
          background: 'var(--accent)', color: 'var(--accent-fg)',
          fontSize: 14, fontWeight: 600, border: 'none',
          cursor: submitting ? 'not-allowed' : 'pointer',
          opacity: (submitting || !name || !email || !message) ? 0.5 : 1,
          transition: 'opacity 120ms', fontFamily: 'var(--font)', letterSpacing: '-0.01em',
        }}
      >
        {submitting ? t('sending') : `${t('submit')} ${tc('arrowRight')}`}
      </button>
    </form>
  );
}
