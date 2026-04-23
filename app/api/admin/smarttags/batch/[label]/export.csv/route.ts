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

  const { data: tags, error } = await supabase
    .from('nfc_stickers')
    .select('short_id, generated_at')
    .eq('batch_label', label)
    .order('generated_at', { ascending: true });

  if (error) return new NextResponse(error.message, { status: 500 });
  if (!tags || tags.length === 0) return new NextResponse('No tags in batch', { status: 404 });

  const baseUrl = getBaseUrl();
  const header = 'short_id,url\n';
  const body = tags.map((t) => `${t.short_id},${baseUrl}/s/${t.short_id}`).join('\n');
  const csv = header + body + '\n';

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="smarttags-${label}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
