import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isAuthorizedCronRequest } from '@/lib/auth/require-cron';

export const runtime = 'nodejs';

// Applies the retention periods of the privacy policy (section 5), daily.
// Every rule lives in the SQL function, next to the promise it keeps (see
// migration 00090); this route only runs it and logs what it removed, so a
// purge that suddenly deletes thousands of rows shows up in the logs.
export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('apply_data_retention' as never);
  if (error) {
    console.error('[data-retention] failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log('[data-retention]', JSON.stringify(data));
  return NextResponse.json({ ok: true, removed: data });
}

export const GET = POST;
