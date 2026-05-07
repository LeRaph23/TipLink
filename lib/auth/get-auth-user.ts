import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

// Deduplicated per request — multiple server components/layouts calling this
// within the same render tree share the same getUser() round-trip.
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
});
