import { notFound } from 'next/navigation';

// Any unknown /fr/… or /en/… path. Without this catch-all, Next answered with
// its own bare English 404 instead of app/[locale]/not-found.tsx.
export default function CatchAllNotFound() {
  notFound();
}
