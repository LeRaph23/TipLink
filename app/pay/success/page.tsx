import Link from 'next/link';

export default function PaySuccessPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-sm">
        <div className="text-5xl">✓</div>
        <h1 className="text-2xl font-bold">Thank you!</h1>
        <p className="text-muted-foreground">Your tip has been sent successfully.</p>
      </div>
    </main>
  );
}
