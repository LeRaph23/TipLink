import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildVatReport, vatLinesToCsv } from '@/lib/billing/vat-report';

export const runtime = 'nodejs';

// GET /api/admin/vat-report?year=2026 — the line-by-line VAT journal behind
// /dashboard/admin/tva, as a CSV to keep with the CA12 return.
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
  if (!(roles ?? []).some((r) => r.role === 'super_admin')) return new NextResponse('Forbidden', { status: 403 });

  const year = Number(new URL(req.url).searchParams.get('year'));
  if (!Number.isInteger(year) || year < 2025 || year > 2100) {
    return new NextResponse('Invalid year', { status: 400 });
  }

  try {
    const { lines } = await buildVatReport(year);
    return new NextResponse(vatLinesToCsv(lines), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="tva-digitip-${year}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[vat-report]', err);
    return new NextResponse('Report failed', { status: 500 });
  }
}
