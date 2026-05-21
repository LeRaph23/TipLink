import { CommerciauxHubTabs } from './CommerciauxHubTabs';

export default function CommerciauxHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          Commerciaux Pros
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
          Programme partenaire B2B · 50 € Solo / 65 € Duo · VRP, agents commerciaux et indépendants.
        </p>
      </div>
      <CommerciauxHubTabs />
      {children}
    </div>
  );
}
