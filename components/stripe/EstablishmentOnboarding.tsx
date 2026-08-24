'use client';

import { ConnectAccountOnboarding } from '@stripe/react-connect-js';
import { ConnectProvider } from './ConnectProvider';

type Props = {
  establishmentId: string;
  /** Signed onboarding token, for wizard steps that run without a session. */
  token?: string;
  /** Fired when the account holder finishes (or leaves) the embedded form. */
  onExit?: () => void;
  errorFallback?: React.ReactNode;
};

/**
 * Stripe's embedded onboarding form for one establishment, rendered inside our
 * own page rather than behind a redirect to Stripe.
 *
 * Import through `next/dynamic` with `ssr: false` — Connect.js touches `window`
 * and `getComputedStyle` while initialising.
 *
 * `onExit` is a UI hint only: it tells the wizard to re-check the account
 * server-side. It is never treated as proof that onboarding is done, because
 * anything the browser reports about its own completion can be faked.
 */
export function EstablishmentOnboarding({ establishmentId, token, onExit, errorFallback }: Props) {
  return (
    <ConnectProvider
      establishmentId={establishmentId}
      token={token}
      errorFallback={errorFallback}
    >
      <ConnectAccountOnboarding
        onExit={() => onExit?.()}
        // Collect everything Stripe will eventually ask for, in one pass. The
        // alternative (currently_due) gets the manager through faster but drops
        // them back into a verification chore weeks later, right when tips have
        // started arriving and a blocked payout hurts most.
        collectionOptions={{ fields: 'eventually_due', futureRequirements: 'include' }}
      />
    </ConnectProvider>
  );
}
