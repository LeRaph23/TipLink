import { describe, it, expect } from 'vitest';
import { pickChallengeWinner } from '@/lib/ambassador-monthly-challenge';

describe('pickChallengeWinner', () => {
  it('returns null when there are no sales in the window', () => {
    expect(pickChallengeWinner([])).toBeNull();
  });

  it('picks the ambassador with the most sales', () => {
    const sales = [
      { ambassador_id: 'a' },
      { ambassador_id: 'b' },
      { ambassador_id: 'b' },
      { ambassador_id: 'c' },
    ];
    expect(pickChallengeWinner(sales)).toEqual({ ambassadorId: 'b', salesCount: 2 });
  });

  it('breaks ties deterministically by ambassador id', () => {
    const sales = [
      { ambassador_id: 'zeta' },
      { ambassador_id: 'zeta' },
      { ambassador_id: 'alpha' },
      { ambassador_id: 'alpha' },
    ];
    expect(pickChallengeWinner(sales)).toEqual({ ambassadorId: 'alpha', salesCount: 2 });
  });

  it('handles a single ambassador', () => {
    expect(pickChallengeWinner([{ ambassador_id: 'solo' }])).toEqual({
      ambassadorId: 'solo',
      salesCount: 1,
    });
  });
});
