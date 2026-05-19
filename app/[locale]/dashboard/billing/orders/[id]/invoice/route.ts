import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getManageScope } from '@/lib/auth/ownership';

export const runtime = 'nodejs';

// Streams the order's in-app generated invoice PDF from the Digitip domain, so
// the customer never leaves the dashboard. The PDF lives in Supabase Storage;
// `invoice_pdf_url` is a long-lived signed URL written by the webhook.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ locale: string; id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { data: order } = await service
    .from('smarttag_orders')
    .select('group_id, invoice_pdf_url')
    .eq('id', id)
    .single();
  if (!order || !order.invoice_pdf_url) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const scope = await getManageScope();
  if (!scope || !(scope.isSuperAdmin || scope.groupIds.includes(order.group_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const pdf = await fetch(order.invoice_pdf_url);
    if (!pdf.ok) {
      return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 502 });
    }
    const safeName = id.replace(/[^a-zA-Z0-9_-]/g, '');
    return new NextResponse(await pdf.arrayBuffer(), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="facture-digitip-${safeName}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invoice fetch error';
    console.error('[order invoice]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
