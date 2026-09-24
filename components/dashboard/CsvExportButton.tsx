'use client';

interface Transaction {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

interface Props {
  transactions: Transaction[];
}

export function CsvExportButton({ transactions }: Props) {
  const handleExport = () => {
    // French Excel conventions: semicolons, decimal commas, Paris time, BOM.
    const fmt = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short',
    });
    const rows = [
      ['Référence', 'Date', 'Montant (€)', 'Statut'],
      ...transactions.map(tx => [
        tx.id.slice(0, 8).toUpperCase(),
        fmt.format(new Date(tx.created_at)),
        (tx.amount / 100).toFixed(2).replace('.', ','),
        tx.status,
      ]),
    ];
    const csv = '\uFEFF' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      className="btn-ghost"
      type="button"
      onClick={handleExport}
      disabled={transactions.length === 0}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '6px 12px', borderRadius: 7,
        border: '1px solid var(--border)', background: 'none',
        color: 'var(--text-2)', fontSize: 12, fontWeight: 500,
        cursor: transactions.length === 0 ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font)', opacity: transactions.length === 0 ? 0.4 : 1,
      }}
    >
      ↓ CSV
    </button>
  );
}
