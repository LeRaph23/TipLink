import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBaseUrl } from '@/lib/env';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ label: string }> }
) {
  const { label } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);
  const isSuperAdmin = (roles ?? []).some((r) => r.role === 'super_admin');
  if (!isSuperAdmin) return new NextResponse('Forbidden', { status: 403 });

  // Keep the empty-batch 404 without loading any rows.
  const { count, error: countErr } = await supabase
    .from('nfc_stickers')
    .select('short_id', { count: 'exact', head: true })
    .eq('batch_label', label);
  if (countErr) return new NextResponse(countErr.message, { status: 500 });
  if (!count) return new NextResponse('No tags in batch', { status: 404 });

  const baseUrl = getBaseUrl();
  const encoder = new TextEncoder();
  const PAGE = 1000;

  // Stream the CSV in pages instead of buffering a whole (potentially 10k+ row)
  // batch in memory. Order by (generated_at, short_id) — short_id is unique, so
  // the tiebreak keeps range pagination stable across pages.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('short_id,url\n'));
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from('nfc_stickers')
          .select('short_id, generated_at')
          .eq('batch_label', label)
          .order('generated_at', { ascending: true })
          .order('short_id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) { controller.error(error); return; }
        const rows = data ?? [];
        if (rows.length === 0) break;
        controller.enqueue(
          encoder.encode(rows.map((t) => `${t.short_id},${baseUrl}/s/${t.short_id}`).join('\n') + '\n'),
        );
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      controller.close();
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="smarttags-${label}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
