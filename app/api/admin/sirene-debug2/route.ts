import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

async function isSuperAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .limit(1);
    return (roles?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

const SIRENE_BASE = process.env.INSEE_SIRENE_BASE_URL ?? 'https://api.insee.fr/api-sirene/3.11';

async function run(label: string, q: string, apiKey: string) {
  const url = new URL(`${SIRENE_BASE}/siret`);
  url.searchParams.set('q', q);
  url.searchParams.set('nombre', '3');
  const res = await fetch(url.toString(), {
    headers: { 'X-INSEE-Api-Key-Integration': apiKey, 'Accept': 'application/json' },
    cache: 'no-store',
  });
  const text = await res.text().catch(() => '');
  return { label, q, status: res.status, body: text.slice(0, 1500) };
}

export async function GET() {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const apiKey = process.env.INSEE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'INSEE_API_KEY missing' }, { status: 500 });

  const variants = [
    // baseline: just NAF, no date, no etat
    { label: '1. activitePrincipaleEtablissement only', q: 'activitePrincipaleEtablissement:4791B' },
    // add etat active
    { label: '2. + etat active in periode', q: 'periode(etatAdministratifEtablissement:A AND activitePrincipaleEtablissement:4791B)' },
    // add date 2y back, fixed bounds
    { label: '3. + date 2024-01-01 to 2100', q: 'periode(etatAdministratifEtablissement:A AND activitePrincipaleEtablissement:4791B) AND dateCreationEtablissement:[2024-01-01 TO 2100-01-01]' },
    // add date 2y back, wildcard upper
    { label: '4. + date 2024-01-01 to *', q: 'periode(etatAdministratifEtablissement:A AND activitePrincipaleEtablissement:4791B) AND dateCreationEtablissement:[2024-01-01 TO *]' },
    // just date filter no NAF
    { label: '5. just dateCreation last 2y', q: 'dateCreationEtablissement:[2024-01-01 TO 2100-01-01]' },
    // a popular NAF that surely has many recents
    { label: '6. NAF 6201Z (info, popular)', q: 'periode(etatAdministratifEtablissement:A AND activitePrincipaleEtablissement:6201Z) AND dateCreationEtablissement:[2024-01-01 TO 2100-01-01]' },
  ];

  const results = [];
  for (const v of variants) {
    results.push(await run(v.label, v.q, apiKey));
    await new Promise(r => setTimeout(r, 200));
  }
  return NextResponse.json({ results });
}
