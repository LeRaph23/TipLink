'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAdminAction } from '@/lib/admin/audit';
import { sendAmbassadorTemplatedEmail } from '@/lib/email';
import { renderTemplate } from '@/lib/ambassadeur/templates';

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

export type EmailTemplate = {
  id: string;
  slug: string;
  name: string;
  subject: string;
  body_html: string;
  is_seeded: boolean;
  updated_at: string;
};

export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  await requireSuperAdminUser();
  const service = createServiceClient();
  const { data } = await service
    .from('ambassador_email_templates')
    .select('id, slug, name, subject, body_html, is_seeded, updated_at')
    .order('is_seeded', { ascending: false })
    .order('name', { ascending: true });
  return data ?? [];
}

type SaveTemplateInput = {
  id?: string;
  slug?: string;
  name: string;
  subject: string;
  body_html: string;
};

export async function saveEmailTemplate(
  input: SaveTemplateInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    if (!input.name?.trim()) return { ok: false, error: 'Nom requis.' };
    if (!input.subject?.trim()) return { ok: false, error: 'Sujet requis.' };
    if (!input.body_html?.trim()) return { ok: false, error: 'Corps requis.' };

    if (input.id) {
      const { error } = await service
        .from('ambassador_email_templates')
        .update({
          name: input.name.trim(),
          subject: input.subject.trim(),
          body_html: input.body_html,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id);
      if (error) return { ok: false, error: error.message };
      await logAdminAction('ambassador_email_template_update', { template_id: input.id });
      return { ok: true, id: input.id };
    }

    const slug = (input.slug ?? input.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60);
    const { data, error } = await service
      .from('ambassador_email_templates')
      .insert({
        slug,
        name: input.name.trim(),
        subject: input.subject.trim(),
        body_html: input.body_html,
        is_seeded: false,
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    await logAdminAction('ambassador_email_template_create', { template_id: data.id, slug });
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur serveur' };
  }
}

export async function deleteEmailTemplate(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: tpl } = await service
      .from('ambassador_email_templates')
      .select('is_seeded, slug')
      .eq('id', id)
      .maybeSingle();
    if (!tpl) return { ok: false, error: 'Template introuvable.' };
    if (tpl.is_seeded) return { ok: false, error: 'Les templates pré-installés ne peuvent pas être supprimés (modifie-les à la place).' };

    const { error } = await service.from('ambassador_email_templates').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    await logAdminAction('ambassador_email_template_delete', { template_id: id, slug: tpl.slug });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur serveur' };
  }
}

type SendInput = {
  ambassadorIds: string[];
  templateId?: string;
  subject: string;
  bodyHtml: string;
};

export async function sendAmbassadorEmail(
  input: SendInput,
): Promise<{ ok: true; sent: number; failed: number } | { ok: false; error: string }> {
  try {
    const user = await requireSuperAdminUser();
    const service = createServiceClient();

    if (!input.ambassadorIds?.length) return { ok: false, error: 'Aucun ambassadeur sélectionné.' };
    if (input.ambassadorIds.length > 200) return { ok: false, error: 'Trop de destinataires (max 200).' };
    if (!input.subject?.trim()) return { ok: false, error: 'Sujet requis.' };
    if (!input.bodyHtml?.trim()) return { ok: false, error: 'Corps requis.' };

    const { data: ambassadors } = await service
      .from('ambassadors')
      .select('id, name, email, promo_codes(code)')
      .in('id', input.ambassadorIds);

    if (!ambassadors?.length) return { ok: false, error: 'Ambassadeurs introuvables.' };

    let templateSlug: string | null = null;
    if (input.templateId) {
      const { data: tpl } = await service
        .from('ambassador_email_templates')
        .select('slug')
        .eq('id', input.templateId)
        .maybeSingle();
      templateSlug = tpl?.slug ?? null;
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://digitip.app';
    let sent = 0;
    let failed = 0;

    for (const amb of ambassadors) {
      if (!amb.email) {
        await service.from('ambassador_email_logs').insert({
          ambassador_id: amb.id,
          template_id: input.templateId ?? null,
          template_slug: templateSlug,
          subject: input.subject,
          body_html: input.bodyHtml,
          to_email: '(missing)',
          sent_by: user.id,
          status: 'failed',
          error: 'Ambassador has no email on file',
        });
        failed += 1;
        continue;
      }

      const promoCode = (amb.promo_codes as { code: string } | null)?.code ?? '';
      const vars = {
        first_name: amb.name.split(' ')[0] ?? amb.name,
        full_name: amb.name,
        promo_code: promoCode,
        dashboard_url: `${baseUrl}/fr/ambassadeur/${promoCode.toLowerCase()}`,
      };
      const renderedSubject = renderTemplate(input.subject, vars);
      const renderedBody = renderTemplate(input.bodyHtml, vars);

      try {
        const { id: resendId } = await sendAmbassadorTemplatedEmail({
          to: amb.email,
          subject: renderedSubject,
          bodyHtml: renderedBody,
        });
        await service.from('ambassador_email_logs').insert({
          ambassador_id: amb.id,
          template_id: input.templateId ?? null,
          template_slug: templateSlug,
          subject: renderedSubject,
          body_html: renderedBody,
          to_email: amb.email,
          sent_by: user.id,
          resend_id: resendId,
          status: 'sent',
        });
        sent += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Send failed';
        await service.from('ambassador_email_logs').insert({
          ambassador_id: amb.id,
          template_id: input.templateId ?? null,
          template_slug: templateSlug,
          subject: renderedSubject,
          body_html: renderedBody,
          to_email: amb.email,
          sent_by: user.id,
          status: 'failed',
          error: msg,
        });
        failed += 1;
      }
    }

    await logAdminAction('ambassador_email_send', {
      template_id: input.templateId ?? null,
      template_slug: templateSlug,
      recipient_count: ambassadors.length,
      sent,
      failed,
    });
    return { ok: true, sent, failed };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur serveur' };
  }
}

export type EmailLogRow = {
  id: string;
  ambassador_id: string;
  ambassador_name: string;
  template_slug: string | null;
  subject: string;
  to_email: string;
  status: 'sent' | 'failed';
  error: string | null;
  sent_at: string;
};

export async function listRecentEmailLogs(limit = 50): Promise<EmailLogRow[]> {
  await requireSuperAdminUser();
  const service = createServiceClient();
  const { data } = await service
    .from('ambassador_email_logs')
    .select('id, ambassador_id, template_slug, subject, to_email, status, error, sent_at, ambassadors(name)')
    .order('sent_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id,
    ambassador_id: r.ambassador_id,
    ambassador_name: (r.ambassadors as { name: string } | null)?.name ?? '—',
    template_slug: r.template_slug,
    subject: r.subject,
    to_email: r.to_email,
    status: r.status as 'sent' | 'failed',
    error: r.error,
    sent_at: r.sent_at,
  }));
}
