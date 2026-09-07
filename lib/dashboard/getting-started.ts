import 'server-only';
import type { createServiceClient } from '@/lib/supabase/service';
import { getEstablishmentPayability } from '@/lib/stripe/establishment-account';

type Service = ReturnType<typeof createServiceClient>;

/** The four things standing between a new establishment and its first euro. */
export type GettingStartedStepId = 'verify' | 'team' | 'review' | 'firstTip';

export type GettingStartedFacts = {
  /** Stripe says charges and payouts are both live. */
  payable: boolean;
  /** At least one staff profile exists. */
  hasStaff: boolean;
  /** A Google review link is attached to the establishment. */
  hasReviewLink: boolean;
  /** At least one tip has been taken. */
  hasTip: boolean;
};

export type GettingStartedStep = {
  id: GettingStartedStepId;
  done: boolean;
  /** The first step still to do. Exactly one step carries this, or none. */
  current: boolean;
};

/**
 * Turns four facts into an ordered list of steps.
 *
 * Split out from the queries so the ordering rule can be tested without a
 * database: it is the part that decides what the manager is asked to do next,
 * and it is easy to get subtly wrong.
 *
 * The order is the order the work has to happen in, not the order of
 * importance. Inviting the team before the account can take money would leave
 * everyone waiting on a tip page that is still shut.
 */
export function deriveGettingStarted(facts: GettingStartedFacts): {
  steps: GettingStartedStep[];
  doneCount: number;
  complete: boolean;
} {
  const order: Array<[GettingStartedStepId, boolean]> = [
    ['verify', facts.payable],
    ['team', facts.hasStaff],
    ['review', facts.hasReviewLink],
    ['firstTip', facts.hasTip],
  ];

  // Only the first unfinished step is "current". Offering four things to do at
  // once to someone who has just signed up is the same as offering none: the
  // card is there to answer "what now", which has one answer.
  const firstTodo = order.findIndex(([, done]) => !done);

  const steps = order.map(([id, done], i) => ({ id, done, current: i === firstTodo }));
  const doneCount = order.filter(([, done]) => done).length;

  return { steps, doneCount, complete: firstTodo === -1 };
}

/**
 * Reads the four facts for a group.
 *
 * Nothing here is a stored flag, and that is the point. A checklist derived
 * from the same rows the rest of the dashboard reads cannot drift out of date,
 * cannot be ticked by accident, follows the manager to another device, and
 * needs no migration to exist. It also disappears on its own once the work is
 * genuinely done, rather than when someone remembers to dismiss it.
 */
export async function readGettingStarted(
  service: Service,
  groupId: string,
): Promise<GettingStartedFacts & { establishmentId: string | null; tipUrlPath: string | null }> {
  const payability = await getEstablishmentPayability(service, groupId);
  if (!payability) {
    return {
      payable: false,
      hasStaff: false,
      hasReviewLink: false,
      hasTip: false,
      establishmentId: null,
      tipUrlPath: null,
    };
  }

  const establishmentId = payability.establishmentId;

  const [{ data: est }, { count: staffCount }, { count: tipCount }] = await Promise.all([
    service
      .from('establishments')
      .select('google_review_url')
      .eq('id', establishmentId)
      .maybeSingle(),
    service
      .from('staff_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('establishment_id', establishmentId)
      .is('deleted_at', null),
    service
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('establishment_id', establishmentId)
      .eq('status', 'succeeded'),
  ]);

  return {
    payable: payability.state === 'ready',
    hasStaff: (staffCount ?? 0) > 0,
    hasReviewLink: Boolean(est?.google_review_url),
    hasTip: (tipCount ?? 0) > 0,
    establishmentId,
    // The last step is "take a tip", and the only way to act on it is to scan
    // your own tag. Linking the page the customer sees turns an instruction
    // into something the manager can just do.
    tipUrlPath: `/pay/group/${establishmentId}`,
  };
}
