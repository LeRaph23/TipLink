import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { serverEnv } from '@/lib/env';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// Token format: <siret>.<exp>.<sig> where sig = HMAC-SHA256("<siret>|<exp>", secret).
// `exp` is a unix-ms timestamp; refusing past tokens prevents indefinite link reuse.
function verifyToken(token: string): { siret: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [siret, expStr, sig] = parts;
  if (!/^\d{14}$/.test(siret)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;

  const secret = serverEnv().COLD_EMAIL_UNSUB_SECRET;
  const expected = crypto.createHmac('sha256', secret).update(`${siret}|${expStr}`).digest('hex').slice(0, 32);
  const sigBuf = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  return { siret };
}

function html(body: string, status: 'ok' | 'err'): string {
  const color = status === 'ok' ? '#22c55e' : '#f87171';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Désinscription</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  :root{color-scheme:light dark;supported-color-schemes:light dark}
  body{margin:0;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f7f9;color:#0f0f12;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .card{background:#ffffff;border:1px solid #e5e7eb;color:#5a5a6a}
  @media (prefers-color-scheme: dark){
    body{background:#0a0a0d;color:#f2f2f5}
    .card{background:#17171d;border-color:#2e2e38;color:#9898a8}
  }
</style>
</head>
<body>
  <div class="card" style="max-width:420px;padding:32px;border-radius:14px;text-align:center">
    <div style="font-size:32px;color:${color};margin-bottom:10px">${status === 'ok' ? '✓' : '✗'}</div>
    <p style="font-size:14px;line-height:1.6;margin:0">${body}</p>
  </div>
</body></html>`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = getClientIp(new Headers(req.headers));
  const rl = await rateLimit(`cold-email-unsub:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) {
    return new NextResponse(html('Trop de requêtes. Réessayez dans une minute.', 'err'), {
      status: 429,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  const { token } = await params;
  const verified = verifyToken(token);
  if (!verified) {
    return new NextResponse(html('Lien invalide ou expiré.', 'err'), {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  const service = createServiceClient();
  await service
    .from('cold_email_prospects')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('siret', verified.siret);

  // Idempotent dedup log so subsequent hits are no-ops.
  // The new table is not in generated types yet — cast minimally.
  await (service.from('cold_email_unsubscribe_log') as unknown as {
    upsert: (v: { siret: string }, opts: { onConflict: string }) => Promise<unknown>;
  }).upsert({ siret: verified.siret }, { onConflict: 'siret' });

  return new NextResponse(
    html('Vous êtes désinscrit(e). On ne vous recontactera plus. Si c\'était une erreur, écrivez-nous à privacy@digitip.app.', 'ok'),
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}
