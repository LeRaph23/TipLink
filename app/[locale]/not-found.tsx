import { NotFoundScreen } from '@/components/errors/NotFoundScreen';

// Next.js convention file: rendered when a page in this subtree calls
// notFound(). The addressable /<locale>/not-found route lives next door and
// shares the same screen — see components/errors/NotFoundScreen.tsx.
export default async function LocaleNotFound() {
  return <NotFoundScreen />;
}
