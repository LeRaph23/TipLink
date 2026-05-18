import { AmbassadeursHubTabs } from './AmbassadeursHubTabs';

export default function AmbassadeursHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          Ambassadeurs
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
          Pilotage du programme : équipe, recrutement, terrain et communications.
        </p>
      </div>
      <AmbassadeursHubTabs />
      {children}
    </div>
  );
}
