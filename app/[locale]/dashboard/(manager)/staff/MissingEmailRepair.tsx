'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { inviteExistingStaffMember } from '@/actions/staff';
import { trackEvent } from '@/lib/analytics';

/**
 * Repair path for staff profiles created without an email address.
 *
 * The onboarding wizard allowed adding a colleague with a name only. Those
 * profiles have user_id NULL, which means no invite was ever sent, no account
 * exists, no Stripe onboarding is possible, and resolveStaffRecipient() skips
 * them — so no reminder can ever reach them either. They can never receive a
 * tip, and nothing in the product said so. In production this was 16 of 24
 * profiles.
 *
 * Nothing here can email the staff member; there is no address. The manager is
 * the only reachable party, which is why this lives in their dashboard.
 */
export function MissingEmailRepair({
  staff,
}: {
  staff: { id: string; fullName: string }[];
}) {
  const router = useRouter();
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Record<string, boolean>>({});

  if (staff.length === 0) return null;
  const remaining = staff.filter((s) => !sent[s.id]);
  if (remaining.length === 0) return null;

  function submit(id: string) {
    const email = (emails[id] ?? '').trim();
    if (!email) return;
    setErrors((e) => ({ ...e, [id]: '' }));
    startTransition(async () => {
      const res = await inviteExistingStaffMember(id, email, locale);
      if ('error' in res) {
        setErrors((e) => ({ ...e, [id]: res.error }));
        return;
      }
      trackEvent('staff_invite_repaired');
      setSent((s) => ({ ...s, [id]: true }));
      router.refresh();
    });
  }

  return (
    <div
      style={{
        background: '#fffbeb',
        border: '1.5px solid #fde68a',
        borderRadius: 'var(--radius)',
        padding: '18px 20px',
        marginBottom: 16,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
        {remaining.length === 1
          ? '1 membre ne peut pas recevoir de pourboires'
          : `${remaining.length} membres ne peuvent pas recevoir de pourboires`}
      </div>
      <p style={{ fontSize: 13, color: '#92400e', lineHeight: 1.6, marginBottom: 16, opacity: 0.9 }}>
        Ces profils ont été créés sans adresse email, donc aucune invitation n&apos;a été
        envoyée et ils n&apos;ont pas de compte. Renseignez leur email pour leur envoyer
        l&apos;invitation. Sans ça, ils ne pourront jamais encaisser.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {remaining.map((s) => (
          <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 13, fontWeight: 650, color: '#92400e',
                  minWidth: 110, flexShrink: 0,
                }}
              >
                {s.fullName}
              </span>
              <input
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="son.email@exemple.fr"
                value={emails[s.id] ?? ''}
                onChange={(e) => setEmails((p) => ({ ...p, [s.id]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && submit(s.id)}
                style={{
                  flex: '1 1 200px', minWidth: 0,
                  padding: '9px 12px', borderRadius: 10,
                  border: '1px solid #fcd34d', background: '#fff',
                  fontSize: 13.5, fontFamily: 'var(--font)', color: 'var(--text)',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => submit(s.id)}
                disabled={pending || !(emails[s.id] ?? '').trim()}
                style={{
                  padding: '9px 16px', borderRadius: 10, border: 'none',
                  background: '#92400e', color: '#fff',
                  fontSize: 13, fontWeight: 650, fontFamily: 'var(--font)',
                  cursor: pending ? 'not-allowed' : 'pointer',
                  opacity: pending || !(emails[s.id] ?? '').trim() ? 0.5 : 1,
                  flexShrink: 0,
                }}
              >
                Inviter
              </button>
            </div>
            {errors[s.id] && (
              <span style={{ fontSize: 12.5, color: 'var(--error)' }}>{errors[s.id]}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
