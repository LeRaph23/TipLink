'use client';

import { useRouter } from 'next/navigation';
import { IdentityDocumentUpload } from '@/components/banking/IdentityDocumentUpload';
import { uploadStaffIdentityDocument } from '@/actions/mangopay';

export function StaffIdentityUpload({ pendingVerification }: { pendingVerification?: boolean }) {
  const router = useRouter();

  async function onUpload(front: File, back: File | null) {
    const fd = new FormData();
    fd.append('front', front);
    if (back) fd.append('back', back);
    const res = await uploadStaffIdentityDocument(fd);
    if ('ok' in res) router.refresh();
    return res;
  }

  return <IdentityDocumentUpload onUpload={onUpload} pendingVerification={pendingVerification} />;
}
