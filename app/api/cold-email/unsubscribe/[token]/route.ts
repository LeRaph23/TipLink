import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

function verifyToken(token: string): string | null {
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return null;
  const siret = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  if (!/^\d{14}$/.test(siret)) return null;
  const secret = process.env.COLD_EMAIL_UNSUB_SECRET ?? process.env.CRON_SECRET ?? '';
  const expected = crypto.createHmac('sha256', secret).update(siret).digest('hex').slice(0, 32);
  const sigBuf = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  return siret;
}

function html(body: string, status: 'ok' | 'err'): string {
  const color = status === 'ok' ? '#22c55e' : '#f87171';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Désinscription</title></head>
<body style="margin:0;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0d;color:#f2f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center">
  <div style="max-width:420px;padding:32px;background:#17171d;border:1px solid #2e2e38;border-radius:14px;text-align:center">
    <div style="font-size:32px;color:${color};margin-bottom:10px">${status === 'ok' ? '✓' : '✗'}</div>
    <p style="font-size:14px;color:#9898a8;line-height:1.6;margin:0">${body}</p>
  </div>
</body></html>`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const siret = verifyToken(token);
  if (!siret) {
    return new NextResponse(html('Lien invalide ou expiré.', 'err'), {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  const service = createServiceClient();
  await service
    .from('cold_email_prospects')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('siret', siret);

  return new NextResponse(
    html('Tu es désinscrit(e). On ne te recontactera plus. Si c\'était une erreur, écris-nous à privacy@digitip.app.', 'ok'),
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}
