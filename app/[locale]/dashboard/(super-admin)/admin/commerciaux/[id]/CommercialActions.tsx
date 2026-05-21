'use client';

import { useState, useTransition } from 'react';
import {
  toggleCommercial,
  setCommercialPayoutsFrozen,
  regenerateCommercialSetupToken,
} from '@/actions/admin/commerciaux';

interface Props {
  id: string;
  isActive: boolean;
  payoutsFrozen: boolean;
  hasPin: boolean;
}

const btn: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 7, border: 'none',
  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};

export function CommercialActions({ id, isActive: initActive, payoutsFrozen: initFrozen, hasPin }: Props) {
  const [active, setActive] = useState(initActive);
  const [frozen, setFrozen] = useState(initFrozen);
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [setupUrl, setSetupUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function doAction(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, onOk: () => void) {
    setErr(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) onOk();
      else setErr(r.error);
    });
  }

  function regen() {
    setErr(null);
    setSetupUrl(null);
    startTransition(async () => {
      const r = await regenerateCommercialSetupToken(id);
      if (r.ok) setSetupUrl(r.setupUrl);
      else setErr(r.error);
    });
  }

  function copyLink(url: string) {
    navigator.clipboard?.writeText(url).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1800); },
      () => {},
    );
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
        Actions super-admin
      </div>

      {err && (
        <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--error-bg)', color: 'var(--error)', fontSize: 12.5 }}>
          {err}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          disabled={isPending}
          onClick={() => doAction(() => toggleCommercial(id, !active), () => setActive(a => !a))}
          style={{ ...btn, background: active ? 'var(--surface-2)' : 'var(--success-bg)', color: active ? 'var(--text)' : 'var(--success)' }}
        >
          {active ? 'Désactiver' : 'Réactiver'}
        </button>
        <button
          disabled={isPending}
          onClick={() => doAction(() => setCommercialPayoutsFrozen(id, !frozen), () => setFrozen(f => !f))}
          style={{ ...btn, background: frozen ? 'var(--success-bg)' : 'var(--warning-bg)', color: frozen ? 'var(--success)' : 'var(--warning)' }}
        >
          {frozen ? 'Dégeler les virements' : 'Geler les virements'}
        </button>
        <button
          disabled={isPending}
          onClick={regen}
          style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text)' }}
        >
          {hasPin ? 'Régénérer le lien d\'activation (réinit. PIN)' : 'Régénérer le lien d\'activation'}
        </button>
      </div>

      {setupUrl && (
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 7, background: 'var(--success-bg)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>
            Nouveau lien d&apos;activation à transmettre au commercial :
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ fontSize: 11, wordBreak: 'break-all', color: 'var(--text-2)', flex: 1, minWidth: 200 }}>{setupUrl}</code>
            <button onClick={() => copyLink(setupUrl)} style={{ ...btn, background: 'var(--surface)', color: 'var(--text)' }}>
              {copied ? '✓ Copié' : 'Copier'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
