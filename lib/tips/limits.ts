/**
 * Bounds on a single tip, in cents. Shared by the amount pickers (what the
 * customer is told) and the intent routes (what is enforced), so the two can
 * never disagree.
 *
 * The ceiling used to be 100 000 €: a slip of the thumb (1000 for 10) went
 * straight to the card. 500 € is far above any real tip and still stops that.
 */
export const TIP_MIN_CENTS = 50;
export const TIP_MAX_CENTS = 500_00;
