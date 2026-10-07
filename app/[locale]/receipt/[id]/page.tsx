import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getManageScope } from '@/lib/auth/ownership';
import { customerHoldsPayment } from '@/lib/stripe/receipt-access';
import { tipAmountOf } from '@/lib/tips/amounts';
import { stripe } from '@/lib/stripe/client';
import { PrintButton } from './PrintButton';

// Digitip-branded tip receipt. Open to the staff member who received the tip,
// a group_admin / super_admin over its establishment, and the customer who
// paid it (proven by the payment's client secret, see customerHoldsPayment).
export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ pi?: string; cs?: string }>;
}) {
  const { locale, id } = await params;
  const { pi, cs } = await searchParams;
  setRequestLocale(locale);
  const isFr = locale === 'fr';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const service = createServiceClient();
  const { data: txn } = await service
    .from('transactions')
    .select('id, amount, currency, status, created_at, succeeded_at, staff_id, metadata, stripe_payment_intent_id, staff_profiles(full_name, user_id), establishments(name, group_id)')
    .eq('id', id)
    .single();
  if (!txn) notFound();

  const staff = txn.staff_profiles as unknown as { full_name: string; user_id: string } | null;
  const establishment = txn.establishments as unknown as { name: string; group_id: string } | null;

  // Authorization — owning staff, group_admin / super_admin of the group, or
  // the customer holding the payment's client secret.
  let authorized = !!user && !!staff && staff.user_id === user.id;
  if (!authorized && user) {
    const scope = await getManageScope();
    authorized = !!scope && (scope.isSuperAdmin || (establishment != null && scope.groupIds.includes(establishment.group_id)));
  }
  const isCustomer = !authorized && await customerHoldsPayment(txn.id, pi, cs);
  if (!authorized && !isCustomer) notFound();

  // What the card was charged is the tip plus the service fee the tipper
  // added on top; a receipt shows both, not one unexplained total.
  const tipCents = tipAmountOf({ amount: txn.amount, metadata: txn.metadata });
  const feeCents = Math.max(0, txn.amount - tipCents);

  // "Visa •••• 4242" rather than "Stripe": the card is what the customer
  // will find on their statement (UX-18). Best effort, the receipt renders
  // without it.
  let methodLabel = isFr ? 'Carte bancaire' : 'Card';
  if (txn.stripe_payment_intent_id && !txn.stripe_payment_intent_id.startsWith('pi_demo_')) {
    try {
      const intent = await stripe.paymentIntents.retrieve(txn.stripe_payment_intent_id, { expand: ['latest_charge'] });
      const charge = intent.latest_charge;
      const card = typeof charge === 'object' && charge ? charge.payment_method_details?.card : null;
      if (card?.last4) {
        const brand = card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : '';
        const wallet = card.wallet?.type === 'apple_pay' ? 'Apple Pay · ' : card.wallet?.type === 'google_pay' ? 'Google Pay · ' : '';
        methodLabel = `${wallet}${brand} •••• ${card.last4}`.trim();
      }
    } catch {
      /* keep the generic label */
    }
  }

  const fmt = new Intl.NumberFormat(isFr ? 'fr-FR' : 'en-US', {
    style: 'currency',
    currency: (txn.currency || 'EUR').toUpperCase(),
    minimumFractionDigits: 2,
  });
  const dateStr = new Date(txn.succeeded_at ?? txn.created_at).toLocaleDateString(
    isFr ? 'fr-FR' : 'en-US',
    { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  );
  const shortRef = txn.id.slice(0, 8).toUpperCase();
  const recipient = staff?.full_name
    ? staff.full_name
    : isFr ? `l’équipe${establishment ? ` chez ${establishment.name}` : ''}` : `the team${establishment ? ` at ${establishment.name}` : ''}`;

  const statusLabel: Record<string, string> = isFr
    ? { succeeded: 'Payé', pending: 'En attente', failed: 'Échoué', refunded: 'Remboursé', partially_refunded: 'Partiellement remboursé' }
    : { succeeded: 'Paid', pending: 'Pending', failed: 'Failed', refunded: 'Refunded', partially_refunded: 'Partially refunded' };
  const isPaid = txn.status === 'succeeded';

  const t = isFr
    ? {
        title: 'Reçu de pourboire', sentTo: 'Pourboire versé à', at: establishment ? ` · ${establishment.name}` : '',
        date: 'Date', ref: 'Référence', status: 'Statut', method: 'Mode de paiement',
        tip: 'Pourboire', fee: 'Frais de service', total: 'Total débité', charged: 'débités',
        back: '← Retour', print: 'Imprimer / PDF', footer: '© Digitip · Pourboires sans contact',
        note: "Paiement traité par Stripe. Le pourboire est encaissé par Digitip, puis reversé à l'établissement bénéficiaire.",
      }
    : {
        title: 'Tip receipt', sentTo: 'Tip paid to', at: establishment ? ` · ${establishment.name}` : '',
        date: 'Date', ref: 'Reference', status: 'Status', method: 'Payment method',
        tip: 'Tip', fee: 'Service fee', total: 'Total charged', charged: 'charged',
        back: '← Back', print: 'Print / PDF', footer: '© Digitip · Cashless tips',
        note: 'Payment processed by Stripe. The tip is collected by Digitip, then paid out to the receiving business.',
      };

  return (
    <div style={{ minHeight: '100vh', background: '#f6f7f9', padding: '40px 20px', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: '#0f0f12' }}>
      <style>{`@media print { .receipt-print-hide { display: none !important; } body { background: #fff; } } @media (max-width: 480px) { .receipt-pad { padding-left: 18px !important; padding-right: 18px !important; } }`}</style>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        {!isCustomer && (
          <div style={{ marginBottom: 16 }} className="receipt-print-hide">
            <a href={`/${locale}/dashboard`} style={{ fontSize: 13, color: '#6b6d85', textDecoration: 'none' }}>{t.back}</a>
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div className="receipt-pad" style={{ padding: '28px 32px 22px', borderBottom: '1px solid #f1f2f4' }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Digitip</div>
            <div style={{ fontSize: 13, color: '#5a5a6a', marginTop: 2 }}>{t.title}</div>
          </div>

          <div className="receipt-pad" style={{ padding: '26px 32px 8px' }}>
            {/* The amount the bank statement will show, not the tip alone
                (UX-18). The breakdown follows below. */}
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>
              {fmt.format(txn.amount / 100)}
              <span style={{ fontSize: 16, fontWeight: 600, color: '#5a5a6a', marginLeft: 8, letterSpacing: 0 }}>{t.charged}</span>
            </div>
            <div style={{ fontSize: 14, color: '#5a5a6a' }}>
              {t.sentTo} <strong style={{ color: '#0f0f12' }}>{recipient}</strong>{staff?.full_name ? t.at : ''}
            </div>
          </div>

          <div className="receipt-pad" style={{ padding: '20px 32px 28px' }}>
            <table width="100%" cellPadding={0} cellSpacing={0} style={{ background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
              <tbody>
                <ReceiptRow label={t.tip} value={fmt.format(tipCents / 100)} />
                {feeCents > 0 && <ReceiptRow label={t.fee} value={fmt.format(feeCents / 100)} />}
                <ReceiptRow label={t.total} value={fmt.format(txn.amount / 100)} />
                <ReceiptRow label={t.date} value={dateStr} />
                <ReceiptRow label={t.ref} value={shortRef} mono />
                <ReceiptRow
                  label={t.status}
                  value={statusLabel[txn.status] ?? txn.status}
                  valueColor={isPaid ? '#16a34a' : '#9898a8'}
                />
                <ReceiptRow label={t.method} value={methodLabel} last />
              </tbody>
            </table>

            <p style={{ fontSize: 12, color: '#9898a8', lineHeight: 1.6, margin: '18px 0 0' }}>{t.note}</p>
          </div>

          <div style={{ padding: '0 32px 28px' }} className="receipt-print-hide">
            <PrintButton label={t.print} />
          </div>

          <div style={{ padding: '14px 32px', borderTop: '1px solid #e5e7eb', textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: '#9898a8' }}>{t.footer}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceiptRow({
  label, value, mono, last, valueColor,
}: {
  label: string; value: string; mono?: boolean; last?: boolean; valueColor?: string;
}) {
  return (
    <tr style={last ? undefined : { borderBottom: '1px solid #f1f2f4' }}>
      <td style={{ padding: '12px 14px', fontSize: 13, color: '#6b6b7b' }}>{label}</td>
      <td style={{
        padding: '12px 14px', fontSize: 13.5, textAlign: 'right', fontWeight: 600,
        color: valueColor ?? '#3f3f4b', fontVariantNumeric: 'tabular-nums',
        letterSpacing: mono ? '0.04em' : undefined,
      }}>
        {value}
      </td>
    </tr>
  );
}
