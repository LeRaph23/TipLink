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
    const currency = transactions[0]?.currency?.toUpperCase() ?? 'EUR';
    const rows = [
      ['Reference', 'Date', `Amount (${currency})`, 'Status'],
      ...transactions.map(tx => [
        tx.id.slice(0, 8).toUpperCase(),
        new Date(tx.created_at).toISOString().slice(0, 16).replace('T', ' '),
        (tx.amount / 100).toFixed(2),
        tx.status,
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
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
