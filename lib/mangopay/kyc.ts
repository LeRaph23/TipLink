import Mangopay from 'mangopay4-nodejs-sdk';
import { mangopay } from './client';

// Mangopay accepts up to ~7 MB per KYC page (pdf/jpeg/jpg/gif/png).
export const MAX_DOC_BYTES = 7 * 1024 * 1024;
export const ALLOWED_DOC_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

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
    return { error: 'Format non supporté — utilise une photo JPEG, PNG ou un PDF.' };
  }
  if (file.size > MAX_DOC_BYTES) {
    return { error: 'Fichier trop volumineux (max 7 Mo).' };
  }
  return { data: Buffer.from(await file.arrayBuffer()), mime: file.type };
}

export type KycStatus = 'none' | 'pending' | 'validated' | 'refused';

function mapStatus(s: Mangopay.kycDocument.DocumentStatus | undefined): KycStatus {
  switch (s) {
    case 'VALIDATED':
      return 'validated';
    case 'VALIDATION_ASKED':
      return 'pending';
    case 'REFUSED':
    case 'OUT_OF_DATE':
      return 'refused';
    default:
      return 'none';
  }
}

// Submits an identity proof for KYC: creates the IDENTITY_PROOF document,
// uploads the front (and optional back) page, then asks for validation.
export async function submitIdentityProof(
  userId: string,
  front: DocumentFile,
  back: DocumentFile | null
): Promise<{ kycDocumentId: string }> {
  const mango = mangopay();
  const doc = await mango.Users.createKycDocument(userId, { Type: 'IDENTITY_PROOF' });
  await mango.Users.createKycPage(userId, doc.Id, {
    File: front.data.toString('base64'),
  });
  if (back) {
    await mango.Users.createKycPage(userId, doc.Id, {
      File: back.data.toString('base64'),
    });
  }
  await mango.Users.updateKycDocument(userId, {
    Status: 'VALIDATION_ASKED',
    Id: doc.Id,
  });
  return { kycDocumentId: doc.Id };
}

// Returns the status of the user's most recent identity-proof KYC document.
export async function getKycStatus(userId: string): Promise<KycStatus> {
  const docs = await mangopay().Users.getKycDocuments(userId);
  const identity = docs
    .filter((d) => d.Type === 'IDENTITY_PROOF')
    .sort((a, b) => (b.CreationDate ?? 0) - (a.CreationDate ?? 0))[0];
  return mapStatus(identity?.Status);
}

// Refetches a KYC document by id. The webhook resolves a KYC_SUCCEEDED/FAILED
// Hook to the owning user via KycDocumentData.UserId.
export async function getKycDocument(
  documentId: string
): Promise<Mangopay.kycDocument.KycDocumentData> {
  return mangopay().KycDocuments.get(documentId);
}

// Maps a KYC document status to the staff_profiles.mangopay_kyc_status column.
export function kycStatusFromDocument(
  s: Mangopay.kycDocument.DocumentStatus | undefined
): KycStatus {
  return mapStatus(s);
}
