'use server';

import { createClient } from '@/lib/supabase/server';
import { sendDirectEmail } from '@/lib/email';
import { logAdminAction } from '@/lib/admin/audit';
import { readAttachments } from '@/lib/admin/email-attachments';
import { validateDirectEmail } from '@/lib/admin/direct-email';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function assertSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Unauthorized' };

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  if (!(roles ?? []).some((r) => r.role === 'super_admin')) return { ok: false as const, error: 'Forbidden' };
  return { ok: true as const };
}

// Free-text email to any address. The order page can only write to an order's
// customer; this is for everyone else (a customer's colleague, a prospect).
export async function sendAdminDirectEmail(
  to: string,
  subject: string,
  body: string,
  files?: FormData
): Promise<Result<{ to: string }>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const checked = validateDirectEmail({ to, subject, body });
  if (!checked.ok) return { ok: false, error: checked.error };

  const read = await readAttachments(
    (files?.getAll('files') ?? []).filter((f): f is File => f instanceof File)
  );
  if (!read.ok) return { ok: false, error: read.error };

  let id: string | null = null;
  try {
    ({ id } = await sendDirectEmail({
      to: checked.value.to,
      subject: checked.value.subject,
      bodyText: checked.value.body,
      locale: 'fr',
      attachments: read.attachments,
    }));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "L'envoi a échoué" };
  }

  await logAdminAction('emails.direct', {
    to: checked.value.to,
    subject: checked.value.subject,
    bodyLength: checked.value.body.length,
    attachments: read.attachments.map((a) => a.filename),
    resendId: id,
  });
  return { ok: true, data: { to: checked.value.to } };
}
