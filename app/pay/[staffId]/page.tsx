import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { createServiceClient } from '@/lib/supabase/service';
import { AmountSelector } from '@/components/payment/AmountSelector';

// Served from Edge for fastest global delivery
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function StaffTipPage({
  params,
}: {
  params: Promise<{ staffId: string }>;
}) {
  const { staffId } = await params;
  const supabase = createServiceClient();

  const { data: staff } = await supabase
    .from('staff_profiles')
    .select(`
      id,
      full_name,
      avatar_url,
      stripe_account_id,
      onboarding_status,
      establishments (
        id,
        name,
        currency,
        settings
      )
    `)
    .eq('id', staffId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .single();

  if (
    !staff ||
    !staff.stripe_account_id ||
    staff.onboarding_status !== 'complete'
  ) {
    notFound();
  }

  const establishment = Array.isArray(staff.establishments)
    ? staff.establishments[0]
    : staff.establishments;

  const tipThresholds: number[] =
    (establishment?.settings as { tip_thresholds?: number[] })?.tip_thresholds ??
    [1, 2, 5, 10];

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md space-y-8">
        {/* Staff profile — rendered immediately, no Suspense needed */}
        <div className="flex flex-col items-center text-center space-y-3">
          {staff.avatar_url ? (
            <img
              src={staff.avatar_url}
              alt={staff.full_name}
              className="w-24 h-24 rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center text-3xl font-bold text-muted-foreground">
              {staff.full_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">{staff.full_name}</h1>
            {establishment?.name && (
              <p className="text-muted-foreground">{establishment.name}</p>
            )}
          </div>
        </div>

        {/*
          Suspense boundary: AmountSelector (tip buttons) streams in first.
          The Stripe payment form loads beneath it via client-side dynamic import.
          This ensures tip amounts are visible < 1s even if Stripe.js takes longer.
        */}
        <Suspense
          fallback={
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-16 bg-muted animate-pulse rounded-xl"
                />
              ))}
            </div>
          }
        >
          <AmountSelector
            staffId={staff.id}
            currency={establishment?.currency ?? 'EUR'}
            thresholds={tipThresholds}
          />
        </Suspense>
      </div>
    </main>
  );
}
