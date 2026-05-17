import { Link } from '@/i18n/navigation';

interface Props {
  transactionId: string;
  label?: string;
}

// Links to the in-app Digitip receipt page for a tip transaction.
export function ReceiptLink({ transactionId, label = 'Reçu' }: Props) {
  return (
    <Link
      href={`/receipt/${transactionId}`}
      target="_blank"
      style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--accent)', textDecoration: 'none' }}
    >
      {label} ↗
    </Link>
  );
}
