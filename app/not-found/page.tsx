import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="text-muted-foreground">This link is not active or has been removed.</p>
        <Link href="/" className="text-sm underline">
          Go home
        </Link>
      </div>
    </main>
  );
}
