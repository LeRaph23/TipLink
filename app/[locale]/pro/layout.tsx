import type { ReactNode } from 'react';
import { NOINDEX_METADATA } from '@/lib/seo/metadata';

// Nothing under this prefix may be indexed. Declared here so it covers every
// page in the subtree, including ones added later. See NOINDEX_METADATA.
export const metadata = NOINDEX_METADATA;

export default function NoIndexLayout({ children }: { children: ReactNode }) {
  return children;
}
