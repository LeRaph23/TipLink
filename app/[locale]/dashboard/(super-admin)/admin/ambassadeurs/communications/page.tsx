import { setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createServiceClient } from '@/lib/supabase/service';
import { CommunicationsManager } from './CommunicationsManager';

export default async function CommunicationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin(locale);

  const service = createServiceClient();

  const [
    { data: ambassadorsRaw },
    { data: emailTemplatesRaw },
    { data: contractTemplatesRaw },
    { data: emailLogsRaw },
    { data: contractsRaw },
  ] = await Promise.all([
    service
      .from('ambassadors')
      .select('id, name, email, is_active, promo_codes(code)')
      .eq('is_active', true)
      .order('name'),
    service
      .from('ambassador_email_templates')
      .select('id, slug, name, subject, body_html, is_seeded, updated_at')
      .order('is_seeded', { ascending: false })
      .order('name'),
    service
      .from('ambassador_contract_templates')
      .select('id, name, version, body_html, consent_text, is_active, updated_at')
      .order('is_active', { ascending: false })
      .order('name')
      .order('version', { ascending: false }),
    service
      .from('ambassador_email_logs')
      .select('id, ambassador_id, template_slug, subject, to_email, status, error, sent_at, ambassadors(name)')
      .order('sent_at', { ascending: false })
      .limit(50),
    service
      .from('ambassador_contracts')
      .select('id, ambassador_id, title, status, sent_at, viewed_at, signed_at, content_hash, ambassadors(name, email)')
      .order('sent_at', { ascending: false })
      .limit(100),
  ]);

  const ambassadors = (ambassadorsRaw ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    promoCode: (a.promo_codes as { code: string } | null)?.code ?? '',
  }));

  const emailLogs = (emailLogsRaw ?? []).map((r) => ({
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

  const contracts = (contractsRaw ?? []).map((r) => {
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

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0 }}>
          Communications ambassadeurs
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
          Envoyer des emails templatés et des contrats à signer, avec audit complet.
        </p>
      </div>

      <CommunicationsManager
        ambassadors={ambassadors}
        emailTemplates={emailTemplatesRaw ?? []}
        contractTemplates={contractTemplatesRaw ?? []}
        emailLogs={emailLogs}
        contracts={contracts}
      />
    </div>
  );
}
