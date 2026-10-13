'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { updatePayoutSchedule } from '@/actions/stripe';
import {
  DEFAULT_PAYOUT_SCHEDULE,
  LAST_DAY,
  WEEKDAYS,
  type PayoutSchedule,
  type Weekday,
} from '@/lib/stripe/payout-schedule';

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius)',
  padding: 20,
  marginBottom: 16,
};

const select: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--surface-2)',
  border: '1.5px solid var(--border)',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: 'var(--font)',
  minHeight: 42,
};

const MONTH_DAYS = [...Array.from({ length: 28 }, (_, i) => i + 1), LAST_DAY];

// 2024-01-01 was a Monday: offsetting from it names each weekday in the
// viewer's language without a hand-written list per locale.
function weekdayName(day: Weekday, locale: string): string {
  const offset = WEEKDAYS.indexOf(day);
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2024, 0, 1 + offset)));
}

/**
 * Lets the manager choose when Stripe pays the tips into the business bank
 * account: a weekday every week, or a day every month.
 */
export function PayoutScheduleForm({
  current,
  loadFailed,
}: {
  /** What Stripe has now; null when it is something this form does not offer. */
  current: PayoutSchedule | null;
  loadFailed: boolean;
}) {
  const t = useTranslations('dashboard.payments');
  const locale = useLocale();
  const router = useRouter();
  const initial = current ?? DEFAULT_PAYOUT_SCHEDULE;

  const [interval, setIntervalKind] = useState<PayoutSchedule['interval']>(initial.interval);
  const [weekday, setWeekday] = useState<Weekday>(initial.interval === 'weekly' ? initial.weekday : 'monday');
  const [day, setDay] = useState<number>(initial.interval === 'monthly' ? initial.day : LAST_DAY);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const chosen: PayoutSchedule = interval === 'weekly' ? { interval, weekday } : { interval, day };
  const unchanged = current !== null && JSON.stringify(chosen) === JSON.stringify(current);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const res = await updatePayoutSchedule(chosen);
    setSaving(false);
    if ('error' in res) {
      setMessage({ ok: false, text: res.error });
      return;
    }
    setMessage({ ok: true, text: t('saved') });
    router.refresh();
  };

  return (
    <form onSubmit={save} style={card}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{t('scheduleTitle')}</div>
      <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 14 }}>{t('scheduleBody')}</p>

      {(loadFailed || current === null) && (
        <p style={{ fontSize: 12.5, color: 'var(--warning)', lineHeight: 1.55, marginBottom: 12 }}>
          {loadFailed ? t('scheduleLoadFailed') : t('unknownSchedule')}
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <select
          aria-label={t('scheduleTitle')}
          value={interval}
          onChange={(e) => setIntervalKind(e.target.value as PayoutSchedule['interval'])}
          style={select}
        >
          <option value="weekly">{t('weekly')}</option>
          <option value="monthly">{t('monthly')}</option>
        </select>
        <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{t('on')}</span>
        {interval === 'weekly' ? (
          <select aria-label={t('on')} value={weekday} onChange={(e) => setWeekday(e.target.value as Weekday)} style={select}>
            {WEEKDAYS.map((d) => <option key={d} value={d}>{weekdayName(d, locale)}</option>)}
          </select>
        ) : (
          <select aria-label={t('on')} value={day} onChange={(e) => setDay(Number(e.target.value))} style={select}>
            {MONTH_DAYS.map((d) => (
              <option key={d} value={d}>{d === LAST_DAY ? t('lastDay') : d}</option>
            ))}
          </select>
        )}
        <button
          type="submit"
          className="btn-accent"
          disabled={saving || unchanged}
          style={{
            minHeight: 42, padding: '0 18px', borderRadius: 'var(--radius)', border: 'none',
            background: 'var(--accent)', color: 'var(--accent-fg)', fontSize: 14, fontWeight: 600,
            cursor: saving || unchanged ? 'default' : 'pointer', opacity: saving || unchanged ? 0.55 : 1,
          }}
        >
          {saving ? t('saving') : t('save')}
        </button>
      </div>

      {message && (
        <p style={{ fontSize: 12.5, marginTop: 10, color: message.ok ? 'var(--success)' : 'var(--error)' }}>{message.text}</p>
      )}
      <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.55, marginTop: 12 }}>{t('hint')}</p>
    </form>
  );
}
