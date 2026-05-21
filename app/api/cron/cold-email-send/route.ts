import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/auth/require-cron';
import { runColdEmailBatch, type ColdProgram } from '@/lib/cold-email/dispatch';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Daily cron — fires up to LIMIT first-step + LIMIT follow-up emails per
// programme (ambassador via Resend, commercial via Brevo). Manual trigger
// via UI uses the same `runColdEmailBatch` function, just with a smaller cap.
const LIMIT_PER_PROGRAM = 50;

function isProgram(v: string | null): v is ColdProgram {
  return v === 'ambassador' || v === 'commercial';
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const programParam = req.nextUrl.searchParams.get('program');
  const limitParam = Number(req.nextUrl.searchParams.get('limit'));
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1';

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, note: 'would invoke runColdEmailBatch' });
  }

  const tallies = await runColdEmailBatch({
    program: isProgram(programParam) ? programParam : undefined,
    limit: Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : LIMIT_PER_PROGRAM,
  });

  return NextResponse.json({ ok: true, tallies });
}

// Vercel cron issues GET, allow POST for parity with the other cron routes.
export const POST = GET;
