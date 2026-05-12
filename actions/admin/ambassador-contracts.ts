'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAdminAction } from '@/lib/admin/audit';
import { renderContract } from '@/lib/ambassadeur/contracts';
import { sendAmbassadorContractInvitation } from '@/lib/email';

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

export type ContractTemplate = {
  id: string;
  name: string;
  version: number;
  body_html: string;
  consent_text: string;
  is_active: boolean;
  updated_at: string;
};

export async function listContractTemplates(): Promise<ContractTemplate[]> {
  await requireSuperAdminUser();
  const service = createServiceClient();
  const { data } = await service
    .from('ambassador_contract_templates')
    .select('id, name, version, body_html, consent_text, is_active, updated_at')
    .order('is_active', { ascending: false })
    .order('name', { ascending: true })
    .order('version', { ascending: false });
  return data ?? [];
}

type SaveContractTemplateInput = {
  id?: string;
  name: string;
  version?: number;
  body_html: string;
  consent_text: string;
  is_active?: boolean;
};

export async function saveContractTemplate(
  input: SaveContractTemplateInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    if (!input.name?.trim()) return { ok: false, error: 'Nom requis.' };
    if (!input.body_html?.trim()) return { ok: false, error: 'Corps du contrat requis.' };
    if (!input.consent_text?.trim()) return { ok: false, error: 'Phrase de consentement requise.' };

    if (input.id) {
      // Editing an existing template: only allowed if no signed contracts reference it,
      // otherwise bump version into a new row (safer for legal traceability).
      const { count } = await service
        .from('ambassador_contracts')
        .select('id', { count: 'exact', head: true })
        .eq('template_id', input.id)
        .eq('status', 'signed');
      if ((count ?? 0) > 0) {
        // Versioned copy: deactivate old, create new with incremented version
        const { data: prev } = await service
          .from('ambassador_contract_templates')
          .select('name, version')
          .eq('id', input.id)
          .single();
        const newVersion = (prev?.version ?? 1) + 1;
        await service
          .from('ambassador_contract_templates')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', input.id);
        const { data: created, error } = await service
          .from('ambassador_contract_templates')
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
        await logAdminAction('ambassador_contract_template_version_bump', {
          old_id: input.id, new_id: created.id, new_version: newVersion,
        });
        return { ok: true, id: created.id };
      }
      const { error } = await service
        .from('ambassador_contract_templates')
        .update({
          name: input.name.trim(),
          body_html: input.body_html,
          consent_text: input.consent_text,
          is_active: input.is_active ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id);
      if (error) return { ok: false, error: error.message };
      await logAdminAction('ambassador_contract_template_update', { template_id: input.id });
      return { ok: true, id: input.id };
    }

    const { data, error } = await service
      .from('ambassador_contract_templates')
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
    await logAdminAction('ambassador_contract_template_create', { template_id: data.id });
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur serveur' };
  }
}

export async function sendContractToAmbassador(input: {
  ambassadorId: string;
  templateId: string;
}): Promise<{ ok: true; contractId: string } | { ok: false; error: string }> {
  try {
    const user = await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: amb } = await service
      .from('ambassadors')
      .select('id, name, email, siret, is_active, promo_codes(code)')
      .eq('id', input.ambassadorId)
      .maybeSingle();
    if (!amb) return { ok: false, error: 'Ambassadeur introuvable.' };
    if (!amb.is_active) return { ok: false, error: 'Ambassadeur inactif.' };
    if (!amb.email) return { ok: false, error: "Ambassadeur sans email — impossible d'envoyer." };

    const { data: tpl } = await service
      .from('ambassador_contract_templates')
      .select('id, name, body_html, consent_text, is_active')
      .eq('id', input.templateId)
      .maybeSingle();
    if (!tpl) return { ok: false, error: 'Template de contrat introuvable.' };
    if (!tpl.is_active) return { ok: false, error: 'Template inactif (version obsolète).' };

    const promoCode = (amb.promo_codes as { code: string } | null)?.code ?? '';
    const { html, hash } = renderContract(tpl.body_html, {
      ambassador_name: amb.name,
      ambassador_siret: amb.siret ?? '—',
      promo_code: promoCode,
      date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    });

    const { data: contract, error } = await service
      .from('ambassador_contracts')
      .insert({
        ambassador_id: amb.id,
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

    await service.from('ambassador_contract_audit_log').insert({
      contract_id: contract.id,
      action: 'sent',
      actor_type: 'admin',
      actor_id: user.id,
      details: { template_id: tpl.id, content_hash: hash },
    });

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://digitip.app';
    const dashboardUrl = `${baseUrl}/fr/ambassadeur/${promoCode.toLowerCase()}?tab=contracts`;
    await sendAmbassadorContractInvitation({
      to: amb.email,
      firstName: amb.name.split(' ')[0] ?? amb.name,
      contractTitle: tpl.name,
      dashboardUrl,
    }).catch(() => {});

    await logAdminAction('ambassador_contract_send', {
      contract_id: contract.id,
      ambassador_id: amb.id,
      template_id: tpl.id,
      content_hash: hash,
    });
    return { ok: true, contractId: contract.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur serveur' };
  }
}

export async function revokeContract(
  contractId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requireSuperAdminUser();
    const service = createServiceClient();
    if (!reason?.trim()) return { ok: false, error: 'Motif requis.' };

    const { data: c } = await service
      .from('ambassador_contracts')
      .select('id, status')
      .eq('id', contractId)
      .maybeSingle();
    if (!c) return { ok: false, error: 'Contrat introuvable.' };
    if (c.status === 'signed') return { ok: false, error: 'Un contrat signé ne peut pas être révoqué (immutable).' };
    if (c.status === 'revoked') return { ok: false, error: 'Déjà révoqué.' };

    const { error } = await service
      .from('ambassador_contracts')
      .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_reason: reason.trim() })
      .eq('id', contractId);
    if (error) return { ok: false, error: error.message };

    await service.from('ambassador_contract_audit_log').insert({
      contract_id: contractId,
      action: 'revoked',
      actor_type: 'admin',
      actor_id: user.id,
      details: { reason: reason.trim() },
    });
    await logAdminAction('ambassador_contract_revoke', { contract_id: contractId, reason });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur serveur' };
  }
}

export type ContractRow = {
  id: string;
  ambassador_id: string;
  ambassador_name: string;
  ambassador_email: string | null;
  title: string;
  status: 'sent' | 'viewed' | 'signed' | 'revoked';
  sent_at: string;
  viewed_at: string | null;
  signed_at: string | null;
  content_hash: string;
};

export async function listContracts(): Promise<ContractRow[]> {
  await requireSuperAdminUser();
  const service = createServiceClient();
  const { data } = await service
    .from('ambassador_contracts')
    .select('id, ambassador_id, title, status, sent_at, viewed_at, signed_at, content_hash, ambassadors(name, email)')
    .order('sent_at', { ascending: false })
    .limit(200);
  return (data ?? []).map((r) => {
    const amb = r.ambassadors as { name: string; email: string | null } | null;
    return {
      id: r.id,
      ambassador_id: r.ambassador_id,
      ambassador_name: amb?.name ?? '—',
      ambassador_email: amb?.email ?? null,
      title: r.title,
      status: r.status as 'sent' | 'viewed' | 'signed' | 'revoked',
      sent_at: r.sent_at,
      viewed_at: r.viewed_at,
      signed_at: r.signed_at,
      content_hash: r.content_hash,
    };
  });
}

export type ContractAuditEntry = {
  id: string;
  action: 'sent' | 'viewed' | 'signed' | 'revoked' | 'downloaded';
  actor_type: 'admin' | 'ambassador' | 'system';
  actor_id: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  created_at: string;
};

export async function getContractAuditTrail(contractId: string): Promise<ContractAuditEntry[]> {
  await requireSuperAdminUser();
  const service = createServiceClient();
  const { data } = await service
    .from('ambassador_contract_audit_log')
    .select('id, action, actor_type, actor_id, ip_hash, user_agent, created_at')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id,
    action: r.action as ContractAuditEntry['action'],
    actor_type: r.actor_type as ContractAuditEntry['actor_type'],
    actor_id: r.actor_id,
    ip_hash: r.ip_hash,
    user_agent: r.user_agent,
    created_at: r.created_at,
  }));
}
