import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function sendTipReceipt(opts: {
  to: string;
  amount: number;
  currency: string;
  staffName: string;
  establishmentName: string;
  transactionId: string;
}): Promise<void> {
  if (!resend) return;

  const { to, amount, currency, staffName, establishmentName, transactionId } = opts;
  const fmt = new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2 });
  const formatted = fmt.format(amount / 100);
  const shortRef = transactionId.slice(0, 8).toUpperCase();

  await resend.emails.send({
    from: 'TipLink <receipts@tipl.ink>',
    to,
    subject: `Your tip receipt — ${formatted}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e5e5e5">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:40px auto;background:#141414;border-radius:16px;border:1px solid #222;overflow:hidden">
    <tr><td style="padding:32px 32px 24px;border-bottom:1px solid #1e1e1e">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#fff">TipLink</div>
      <div style="font-size:13px;color:#666;margin-top:2px">Tip receipt</div>
    </td></tr>
    <tr><td style="padding:28px 32px">
      <div style="font-size:40px;font-weight:800;letter-spacing:-0.04em;color:#fff;margin-bottom:4px">${formatted}</div>
      <div style="font-size:14px;color:#888">Tip sent to <strong style="color:#ccc">${staffName}</strong> at ${establishmentName}</div>
    </td></tr>
    <tr><td style="padding:0 32px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:10px;border:1px solid #222;overflow:hidden">
        <tr style="border-bottom:1px solid #222">
          <td style="padding:12px 16px;font-size:12px;color:#666">Status</td>
          <td style="padding:12px 16px;font-size:12px;color:#22c55e;font-weight:600;text-align:right">● Succeeded</td>
        </tr>
        <tr style="border-bottom:1px solid #222">
          <td style="padding:12px 16px;font-size:12px;color:#666">Reference</td>
          <td style="padding:12px 16px;font-size:12px;color:#aaa;font-family:monospace;text-align:right">${shortRef}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;font-size:12px;color:#666">Processor</td>
          <td style="padding:12px 16px;font-size:12px;color:#aaa;text-align:right">Stripe ✓</td>
        </tr>
      </table>
    </td></tr>
    <tr><td style="padding:0 32px 32px">
      <p style="font-size:12px;color:#444;margin:0;line-height:1.6">
        Your payment went directly to ${staffName}'s bank account via Stripe Connect. TipLink never holds your funds.
      </p>
    </td></tr>
    <tr><td style="padding:16px 32px;border-top:1px solid #1e1e1e;text-align:center">
      <span style="font-size:11px;color:#444">© TipLink · Cashless tips via NFC</span>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
