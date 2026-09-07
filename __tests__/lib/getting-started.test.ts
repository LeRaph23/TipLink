import { describe, it, expect } from 'vitest';
import { deriveGettingStarted } from '@/lib/dashboard/getting-started';

const none = { payable: false, hasStaff: false, hasReviewLink: false, hasTip: false };
const all = { payable: true, hasStaff: true, hasReviewLink: true, hasTip: true };

const current = (f: Parameters<typeof deriveGettingStarted>[0]) =>
  deriveGettingStarted(f).steps.find((s) => s.current)?.id ?? null;

describe('deriveGettingStarted', () => {
  it('asks for verification first on a brand new account', () => {
    expect(current(none)).toBe('verify');
    expect(deriveGettingStarted(none).doneCount).toBe(0);
  });

  // The order is the order the work has to happen in. Inviting the team before
  // the account can take money leaves everyone pointed at a page that is shut.
  it('walks the steps in dependency order', () => {
    expect(current({ ...none, payable: true })).toBe('team');
    expect(current({ ...none, payable: true, hasStaff: true })).toBe('review');
    expect(current({ ...all, hasTip: false })).toBe('firstTip');
  });

  // The card exists to answer "what now", which has exactly one answer.
  it('marks exactly one step as current', () => {
    for (const facts of [none, { ...none, payable: true }, { ...all, hasTip: false }]) {
      expect(deriveGettingStarted(facts).steps.filter((s) => s.current)).toHaveLength(1);
    }
  });

  // A later step finished out of order still counts, but does not become the
  // thing being asked for: the first gap is what the manager is walked through.
  it('counts out-of-order progress without jumping the queue', () => {
    const facts = { ...none, hasReviewLink: true };
    expect(current(facts)).toBe('verify');
    expect(deriveGettingStarted(facts).doneCount).toBe(1);
    expect(deriveGettingStarted(facts).complete).toBe(false);
  });

  it('is complete, with no current step, once all four are done', () => {
    const r = deriveGettingStarted(all);
    expect(r.complete).toBe(true);
    expect(r.doneCount).toBe(4);
    expect(r.steps.some((s) => s.current)).toBe(false);
  });
});
