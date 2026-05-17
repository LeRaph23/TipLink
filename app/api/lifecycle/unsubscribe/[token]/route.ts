import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyLifecycleUnsubToken } from '@/lib/auth/lifecycle-unsub-token';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

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

function page(body: string, status: 'ok' | 'err', httpStatus = 200): NextResponse {
  return new NextResponse(html(body, status), {
    status: httpStatus,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = getClientIp(new Headers(req.headers));
  const rl = await rateLimit(`lifecycle-unsub:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) {
    return page('Trop de requêtes. Réessayez dans une minute.', 'err', 429);
  }

  const { token } = await params;
  const verified = verifyLifecycleUnsubToken(token);
  if (!verified) {
    return page('Lien invalide ou expiré.', 'err', 400);
  }

  const service = createServiceClient();
  const table = verified.scope === 'staff' ? 'staff_profiles' : 'groups';
  // The opt-out column is not in the generated DB types yet — cast minimally.
  await (service.from(table) as unknown as {
    update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown> };
  })
    .update({ lifecycle_emails_opt_out_at: new Date().toISOString() })
    .eq('id', verified.id);

  return page(
    'C\'est noté — vous ne recevrez plus nos emails de conseils et de relance. ' +
      'Les emails essentiels (reçus, alertes de paiement) restent envoyés. ' +
      'Une erreur ? Écrivez-nous à support@digitip.app.',
    'ok'
  );
}
