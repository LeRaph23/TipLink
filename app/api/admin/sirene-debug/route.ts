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

async function tryQuery(label: string, q: string, apiKey: string) {
  const url = new URL(`${SIRENE_BASE}/siret`);
  url.searchParams.set('q', q);
  url.searchParams.set('nombre', '1');
  const res = await fetch(url.toString(), {
    headers: {
      'X-INSEE-Api-Key-Integration': apiKey,
      'Accept': 'application/json',
    },
    cache: 'no-store',
  });
  const text = await res.text().catch(() => '');
  return {
    label,
    q,
    status: res.status,
    body: text.slice(0, 400),
  };
}

export async function GET() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const apiKey = process.env.INSEE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'INSEE_API_KEY missing' }, { status: 500 });
  }

  const variants: Array<{ label: string; q: string }> = [
    { label: 'A: bare siret lookup (sanity)', q: 'siret:35600000000048' },
    { label: 'B: minimal periode', q: 'periode(etatAdministratifUniteLegale:A AND activitePrincipaleUniteLegale:4791B)' },
    { label: 'C: + categorieJuridique', q: 'periode(etatAdministratifUniteLegale:A AND activitePrincipaleUniteLegale:4791B) AND categorieJuridiqueUniteLegale:1000' },
    { label: 'D: + date single', q: 'periode(etatAdministratifUniteLegale:A AND activitePrincipaleUniteLegale:4791B) AND dateCreationUniteLegale:2025-05-18' },
    { label: 'E: + date range with *', q: 'periode(etatAdministratifUniteLegale:A AND activitePrincipaleUniteLegale:4791B) AND dateCreationUniteLegale:[2025-05-18 TO *]' },
    { label: 'F: + date range fixed', q: 'periode(etatAdministratifUniteLegale:A AND activitePrincipaleUniteLegale:4791B) AND dateCreationUniteLegale:[2025-05-18 TO 2100-01-01]' },
    { label: 'G: Etab fields not UL', q: 'periode(etatAdministratifEtablissement:A AND activitePrincipaleEtablissement:4791B) AND dateCreationEtablissement:[2025-05-18 TO 2100-01-01]' },
    { label: 'H: full original failing', q: 'periode(etatAdministratifUniteLegale:A AND activitePrincipaleUniteLegale:4791B) AND categorieJuridiqueUniteLegale:1000 AND dateCreationUniteLegale:[2025-05-18 TO *]' },
    { label: 'I: dateCreation first, periode last', q: 'dateCreationUniteLegale:[2025-05-18 TO 2100-01-01] AND categorieJuridiqueUniteLegale:1000 AND periode(etatAdministratifUniteLegale:A AND activitePrincipaleUniteLegale:4791B)' },
  ];

  const results = [];
  for (const v of variants) {
    results.push(await tryQuery(v.label, v.q, apiKey));
    await new Promise(r => setTimeout(r, 150));
  }

  return NextResponse.json({ results });
}
