import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
    end: new Date(Date.UTC(y, m, 1)).toISOString(),
  };
}
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Per-employee monthly statement of tips actually PAID OUT (received) in the
// month, scoped to the signed-in admin's group. Amounts in EUR so the file
// drops straight into payroll.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('group_id')
    .in('role', ['group_admin', 'super_admin'])
    .eq('user_id', user.id)
    .not('group_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (!roleRow?.group_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const raw = req.nextUrl.searchParams.get('month');
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : currentMonth();
  const { start, end } = monthRange(month);

  const service = createServiceClient();
  const { data: ests } = await service
    .from('establishments').select('id').eq('group_id', roleRow.group_id).is('deleted_at', null);
  const estIds = (ests ?? []).map((e) => e.id);

  const agg = new Map<string, { name: string; count: number; amount: number }>();
  if (estIds.length > 0) {
    const { data: staff } = await service
      .from('staff_profiles').select('id, full_name').in('establishment_id', estIds).is('deleted_at', null);
    const byId = new Map((staff ?? []).map((s) => [s.id, s.full_name]));
    const staffIds = [...byId.keys()];

    if (staffIds.length > 0) {
      const { data: paid } = await service
        .from('group_tip_transfers')
        .select('amount, staff_id')
        .in('staff_id', staffIds)
        .eq('status', 'succeeded')
        .gte('transferred_at', start)
        .lt('transferred_at', end);

      for (const a of (paid ?? []) as Array<{ amount: number; staff_id: string }>) {
        const r = agg.get(a.staff_id) ?? { name: byId.get(a.staff_id) ?? '', count: 0, amount: 0 };
        r.count += 1;
        r.amount += a.amount;
        agg.set(a.staff_id, r);
      }
    }
  }

  const eur = (cents: number) => (cents / 100).toFixed(2);
  const header = ['Employe', 'Mois', 'Nb pourboires', 'Montant verse (EUR)'];
  const lines = [header.map(csvCell).join(',')];
  for (const r of [...agg.values()].sort((a, b) => b.amount - a.amount)) {
    lines.push([r.name, month, r.count, eur(r.amount)].map(csvCell).join(','));
  }

  const csv = '﻿' + lines.join('\r\n') + '\r\n'; // BOM for Excel accents
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="releve-pourboires-${month}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
