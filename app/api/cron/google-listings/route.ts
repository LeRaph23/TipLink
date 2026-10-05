import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isAuthorizedCronRequest } from '@/lib/auth/require-cron';
import { captureDueSnapshots } from '@/lib/google-listing';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Daily: reads the Google review count of every Pro establishment that is due
 * (weekly, or never read). This is what lets the dashboard say "+11 avis
 * Google depuis le 4 octobre" instead of counting clicks and hoping.
 */
export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await captureDueSnapshots(createServiceClient());
  return NextResponse.json({ ok: true, ...result });
}

// Vercel cron uses GET with the same auth header.
export const GET = POST;
