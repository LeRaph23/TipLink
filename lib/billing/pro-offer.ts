/**
 * Whether Digitip Pro is on sale.
 *
 * Off at launch: every group gets Pro's features for free (migration 00093,
 * `groups.pro_included`), so there is nothing to sell and nowhere to sell it.
 * While this is false, no price, no upsell, no trial and no checkout is shown
 * anywhere, public pages included.
 *
 * To put Pro on sale for new customers, flip this and, in the same change,
 * add a migration setting the `pro_included` default to false. Groups created
 * before keep their true.
 */
export const PRO_ON_SALE = false;
