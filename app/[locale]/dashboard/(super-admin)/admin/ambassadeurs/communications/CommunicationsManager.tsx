'use client';

import { useState } from 'react';
import { EmailsTab, type AmbassadorRow, type EmailTemplate, type EmailLogRow } from './EmailsTab';
import { EmailTemplatesTab } from './EmailTemplatesTab';
import { ContractsTab, type ContractRow, type ContractTemplate } from './ContractsTab';
import { ContractTemplatesTab } from './ContractTemplatesTab';

type Tab = 'emails' | 'email_templates' | 'contracts' | 'contract_templates';

export function CommunicationsManager({
  ambassadors,
  emailTemplates,
  contractTemplates,
  emailLogs,
  contracts,
}: {
  ambassadors: AmbassadorRow[];
  emailTemplates: EmailTemplate[];
  contractTemplates: ContractTemplate[];
  emailLogs: EmailLogRow[];
  contracts: ContractRow[];
}) {
  const [tab, setTab] = useState<Tab>('emails');

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'emails', label: 'Envoyer un email' },
    { id: 'email_templates', label: `Templates email (${emailTemplates.length})` },
    { id: 'contracts', label: `Contrats (${contracts.length})` },
    { id: 'contract_templates', label: `Templates contrat (${contractTemplates.length})` },
  ];

  return (
    <div>
      <div style={{
        display: 'flex', gap: 0, marginBottom: 22,
        borderBottom: '1px solid var(--border)',
      }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t.id ? 'var(--accent)' : 'var(--text-3)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'emails' && (
        <EmailsTab
          ambassadors={ambassadors}
          templates={emailTemplates}
          recentLogs={emailLogs}
        />
      )}
      {tab === 'email_templates' && (
        <EmailTemplatesTab templates={emailTemplates} />
      )}
      {tab === 'contracts' && (
        <ContractsTab
          ambassadors={ambassadors}
          templates={contractTemplates.filter((t) => t.is_active)}
          contracts={contracts}
        />
      )}
      {tab === 'contract_templates' && (
        <ContractTemplatesTab templates={contractTemplates} />
      )}
    </div>
  );
}
