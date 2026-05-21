'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAdminAction } from '@/lib/admin/audit';
import { renderTemplate, sha256Hex } from '@/lib/ambassadeur/templates';
import { sendCommercialContractInvitation } from '@/lib/email';

async function requireSuperAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .limit(1);
  if (!roles?.length) throw new Error('Forbidden');
  return user;
}

const LEGAL_FORM_LABELS: Record<string, string> = {
  sarl: 'SARL', sas: 'SAS', sasu: 'SASU', ei: 'Entreprise individuelle',
  auto_entrepreneur: 'Auto-entrepreneur (micro-entreprise)',
  eurl: 'EURL', sa: 'SA', autre: 'Autre forme',
};
const VRP_STATUS_LABELS: Record<string, string> = {
  vrp_exclusif: 'VRP exclusif',
  vrp_multicarte: 'VRP multicarte',
  agent_commercial: 'Agent commercial indépendant',
  independant: 'Commercial indépendant',
  autre: 'Autre',
};

export type CommercialContractTemplate = {
  id: string;
  name: string;
  version: number;
  body_html: string;
  consent_text: string;
  is_active: boolean;
  updated_at: string;
};

export async function listCommercialContractTemplates(): Promise<CommercialContractTemplate[]> {
  await requireSuperAdminUser();
  const service = createServiceClient();
  const { data } = await service
    .from('commercial_contract_templates')
    .select('id, name, version, body_html, consent_text, is_active, updated_at')
    .order('is_active', { ascending: false })
    .order('name', { ascending: true })
    .order('version', { ascending: false });
  return data ?? [];
}

type SaveCommercialContractTemplateInput = {
  id?: string;
  name: string;
  version?: number;
  body_html: string;
  consent_text: string;
  is_active?: boolean;
};

export async function saveCommercialContractTemplate(
  input: SaveCommercialContractTemplateInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    if (!input.name?.trim()) return { ok: false, error: 'Nom requis.' };
    if (!input.body_html?.trim()) return { ok: false, error: 'Corps du contrat requis.' };
    if (!input.consent_text?.trim()) return { ok: false, error: 'Phrase de consentement requise.' };

    if (input.id) {
      // Bump version into a new row if any contract has already been signed
      // under this template — signed contracts are immutable and legal records
      // must remain traceable to the exact wording that was signed.
      const { count } = await service
        .from('commercial_contracts')
        .select('id', { count: 'exact', head: true })
        .eq('template_id', input.id)
        .eq('status', 'signed');
      if ((count ?? 0) > 0) {
        const { data: prev } = await service
          .from('commercial_contract_templates')
          .select('name, version')
          .eq('id', input.id)
          .single();
        const newVersion = (prev?.version ?? 1) + 1;
        await service
          .from('commercial_contract_templates')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', input.id);
        const { data: created, error } = await service
          .from('commercial_contract_templates')
          .insert({
            name: input.name.trim(),
            version: newVersion,
            body_html: input.body_html,
            consent_text: input.consent_text,
            is_active: true,
          })
          .select('id')
          .single();
        if (error) return { ok: false, error: error.message };
        await logAdminAction('commercial_contract_template_version_bump', {
          old_id: input.id, new_id: created.id, new_version: newVersion,
        });
        return { ok: true, id: created.id };
      }
      const { error } = await service
        .from('commercial_contract_templates')
        .update({
          name: input.name.trim(),
          body_html: input.body_html,
          consent_text: input.consent_text,
          is_active: input.is_active ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id);
      if (error) return { ok: false, error: error.message };
      await logAdminAction('commercial_contract_template_update', { template_id: input.id });
      return { ok: true, id: input.id };
    }

    const { data, error } = await service
      .from('commercial_contract_templates')
      .insert({
        name: input.name.trim(),
        version: input.version ?? 1,
        body_html: input.body_html,
        consent_text: input.consent_text,
        is_active: input.is_active ?? true,
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    await logAdminAction('commercial_contract_template_create', { template_id: data.id });
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur serveur' };
  }
}

/**
 * Sends a contract to a commercial: renders the template with the
 * commercial's B2B identity, locks the snapshot + SHA-256 hash, records
 * the audit trail, and fires the invitation email pointing to the portal.
 */
export async function sendContractToCommercial(input: {
  commercialId: string;
  templateId: string;
}): Promise<{ ok: true; contractId: string } | { ok: false; error: string }> {
  try {
    const user = await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: com } = await service
      .from('commerciaux')
      .select('id, name, company_name, legal_form, vrp_status, siret, vat_number, city, email, is_active, promo_codes(code)')
      .eq('id', input.commercialId)
      .maybeSingle();
    if (!com) return { ok: false, error: 'Commercial introuvable.' };
    if (!com.is_active) return { ok: false, error: 'Commercial inactif.' };
    if (!com.email) return { ok: false, error: "Commercial sans email — impossible d'envoyer." };

    const { data: tpl } = await service
      .from('commercial_contract_templates')
      .select('id, name, body_html, consent_text, is_active')
      .eq('id', input.templateId)
      .maybeSingle();
    if (!tpl) return { ok: false, error: 'Modèle de contrat introuvable.' };
    if (!tpl.is_active) return { ok: false, error: 'Modèle inactif (version obsolète).' };

    const promoCode = (com.promo_codes as { code: string } | null)?.code ?? '';
    const vatClause = com.vat_number
      ? `, N° TVA intracommunautaire ${com.vat_number}`
      : '';
    const contractShortId = (com.id.replace(/-/g, '').slice(0, 8) + '-' + Date.now().toString(36)).toUpperCase();

    // renderTemplate substitutes {{placeholders}} with HTML-escaped values.
    // sha256Hex hashes the resulting bytes so the snapshot stored in DB can
    // be re-verified at signing time — any silent tampering breaks the hash.
    const html = renderTemplate(tpl.body_html, {
      commercial_name: com.name,
      company_name: com.company_name,
      legal_form_label: LEGAL_FORM_LABELS[com.legal_form] ?? com.legal_form,
      vrp_status_label: VRP_STATUS_LABELS[com.vrp_status] ?? com.vrp_status,
      siret: com.siret,
      vat_clause: vatClause,
      city: com.city,
      promo_code: promoCode,
      contract_short_id: contractShortId,
      date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    });
    const hash = sha256Hex(html);

    const { data: contract, error } = await service
      .from('commercial_contracts')
      .insert({
        commercial_id: com.id,
        template_id: tpl.id,
        title: tpl.name,
        content_snapshot: html,
        content_hash: hash,
        consent_text: tpl.consent_text,
        status: 'sent',
        sent_by: user.id,
      })
      .select('id')
      .single();
    if (error || !contract) return { ok: false, error: error?.message ?? 'Insertion échouée' };

    await service.from('commercial_contract_audit_log').insert({
      contract_id: contract.id,
      action: 'sent',
      actor_type: 'admin',
      actor_id: user.id,
      details: { template_id: tpl.id, content_hash: hash },
    });

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://digitip.app').replace(/\/$/, '');
    const dashboardUrl = `${baseUrl}/fr/pro/${promoCode.toLowerCase()}?tab=contrats`;
    await sendCommercialContractInvitation({
      to: com.email,
      firstName: com.name.split(' ')[0] ?? com.name,
      contractTitle: tpl.name,
      dashboardUrl,
    }).catch(() => {});

    await logAdminAction('commercial_contract_send', {
      contract_id: contract.id,
      commercial_id: com.id,
      template_id: tpl.id,
      content_hash: hash,
    });
    return { ok: true, contractId: contract.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur serveur' };
  }
}

export async function revokeCommercialContract(
  contractId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requireSuperAdminUser();
    const service = createServiceClient();
    if (!reason?.trim()) return { ok: false, error: 'Motif requis.' };

    const { data: c } = await service
      .from('commercial_contracts')
      .select('id, status')
      .eq('id', contractId)
      .maybeSingle();
    if (!c) return { ok: false, error: 'Contrat introuvable.' };
    if (c.status === 'signed') return { ok: false, error: 'Un contrat signé est immuable et ne peut pas être révoqué.' };
    if (c.status === 'revoked') return { ok: false, error: 'Déjà révoqué.' };

    const { error } = await service
      .from('commercial_contracts')
      .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_reason: reason.trim() })
      .eq('id', contractId);
    if (error) return { ok: false, error: error.message };

    await service.from('commercial_contract_audit_log').insert({
      contract_id: contractId,
      action: 'revoked',
      actor_type: 'admin',
      actor_id: user.id,
      details: { reason: reason.trim() },
    });
    await logAdminAction('commercial_contract_revoke', { contract_id: contractId, reason });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur serveur' };
  }
}

export type CommercialContractRow = {
  id: string;
  commercial_id: string;
  title: string;
  status: 'sent' | 'viewed' | 'signed' | 'revoked';
  sent_at: string;
  viewed_at: string | null;
  signed_at: string | null;
  content_hash: string;
};

export async function listCommercialContractsFor(
  commercialId: string,
): Promise<CommercialContractRow[]> {
  await requireSuperAdminUser();
  const service = createServiceClient();
  const { data } = await service
    .from('commercial_contracts')
    .select('id, commercial_id, title, status, sent_at, viewed_at, signed_at, content_hash')
    .eq('commercial_id', commercialId)
    .order('sent_at', { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id,
    commercial_id: r.commercial_id,
    title: r.title,
    status: r.status as CommercialContractRow['status'],
    sent_at: r.sent_at,
    viewed_at: r.viewed_at,
    signed_at: r.signed_at,
    content_hash: r.content_hash,
  }));
}
