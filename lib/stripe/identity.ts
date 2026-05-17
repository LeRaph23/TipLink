import type Stripe from 'stripe';
import { stripe } from './client';

export const MAX_DOC_BYTES = 10 * 1024 * 1024;
export const ALLOWED_DOC_TYPES = ['image/jpeg', 'image/png'];

export interface AccountVerificationStatus {
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  needsIdentityDocument: boolean;
  pendingVerification: boolean;
  disabledReason: string | null;
  currentlyDue: string[];
}

// Matches `individual.verification.document`, `*.verification.additional_document`, etc.
const DOC_FIELD = /verification\.(additional_)?document/;

function dueFields(req: Stripe.Account.Requirements | null | undefined): string[] {
  if (!req) return [];
  return [
    ...(req.currently_due ?? []),
    ...(req.past_due ?? []),
    ...(req.eventually_due ?? []),
  ];
}

export async function getAccountVerificationStatus(
  accountId: string
): Promise<AccountVerificationStatus> {
  const account = await stripe.accounts.retrieve(accountId);
  const req = account.requirements;
  const due = dueFields(req);
  return {
    payoutsEnabled: account.payouts_enabled ?? false,
    chargesEnabled: account.charges_enabled ?? false,
    needsIdentityDocument: due.some((f) => DOC_FIELD.test(f)),
    pendingVerification: (req?.pending_verification ?? []).length > 0,
    disabledReason: req?.disabled_reason ?? null,
    currentlyDue: req?.currently_due ?? [],
  };
}

export interface DocumentFile {
  data: Buffer;
  mime: string;
}

// Converts a multipart File into a validated document buffer.
export async function fileToDocument(
  file: unknown
): Promise<DocumentFile | { error: string }> {
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Fichier manquant.' };
  }
  if (!ALLOWED_DOC_TYPES.includes(file.type)) {
    return { error: 'Format non supporté — utilise une photo JPEG ou PNG.' };
  }
  if (file.size > MAX_DOC_BYTES) {
    return { error: 'Fichier trop volumineux (max 10 Mo).' };
  }
  return { data: Buffer.from(await file.arrayBuffer()), mime: file.type };
}

// Uploads an identity document to Stripe and attaches it to the connected
// account so verification can proceed without the user leaving the site.
export async function uploadIdentityDocument(
  accountId: string,
  front: DocumentFile,
  back: DocumentFile | null
): Promise<void> {
  const frontFile = await stripe.files.create(
    {
      purpose: 'identity_document',
      file: { data: front.data, name: 'identity_front', type: front.mime },
    },
    { stripeAccount: accountId }
  );

  const document: { front: string; back?: string } = { front: frontFile.id };

  if (back) {
    const backFile = await stripe.files.create(
      {
        purpose: 'identity_document',
        file: { data: back.data, name: 'identity_back', type: back.mime },
      },
      { stripeAccount: accountId }
    );
    document.back = backFile.id;
  }

  await stripe.accounts.update(accountId, {
    individual: { verification: { document } },
  });
}
