'use client';

import dynamic from 'next/dynamic';

// Dynamic import with ssr:false prevents @stripe/connect-js from being evaluated
// on the server where it would try to access browser globals and crash.
// Must live in a client component because Next.js 15+ disallows ssr:false in server components.
const StripeConnectEmbed = dynamic(
  () => import('./StripeConnectEmbed').then((m) => m.StripeConnectEmbed),
  { ssr: false }
);

export function StripeConnectEmbedClient(props: {
  hasAccount: boolean;
  isComplete: boolean;
  showManagement?: boolean;
}) {
  return <StripeConnectEmbed {...props} />;
}
