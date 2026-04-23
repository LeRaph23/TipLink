import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

type Body = {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  team_size?: string;
  message?: string;
  locale?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  // Rate limit: 3 / minute / IP (lead form is public)
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`contact:${ip}`, { limit: 3, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429 }
    );
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const message = body.message?.trim();

  if (!name || name.length < 2 || name.length > 200) {
    return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
  }
  if (!email || !EMAIL_RE.test(email) || email.length > 200) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }
  if (!message || message.length < 10 || message.length > 5000) {
    return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service.from('contact_requests').insert({
    name,
    email,
    phone: body.phone?.trim().slice(0, 60) ?? null,
    company: body.company?.trim().slice(0, 200) ?? null,
    team_size: body.team_size?.trim().slice(0, 20) ?? null,
    message,
    locale: body.locale?.slice(0, 5) ?? null,
  });

  if (error) {
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }

  // Best-effort email notification via Resend. Failure to notify must not
  // block the user — the request has already been persisted above.
  const resendKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_NOTIFICATION_EMAIL;
  const from = process.env.RESEND_FROM_EMAIL ?? 'TipLink <no-reply@tiplink.io>';
  if (resendKey && to) {
    const text = [
      `New enterprise lead via /contact`,
      ``,
      `Name:      ${name}`,
      `Email:     ${email}`,
      body.phone ? `Phone:     ${body.phone}` : null,
      body.company ? `Company:   ${body.company}` : null,
      body.team_size ? `Team size: ${body.team_size}` : null,
      body.locale ? `Locale:    ${body.locale}` : null,
      ``,
      message,
    ].filter(Boolean).join('\n');
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [to],
          reply_to: email,
          subject: `[TipLink] Lead — ${name}${body.company ? ` (${body.company})` : ''}`,
          text,
        }),
      });
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ ok: true });
}
