/**
 * Exact money arithmetic.
 *
 * JavaScript numbers are binary floating point, so 28.13 × 102.50 evaluates to
 * 2883.324999999… and rounds DOWN to 2883.32. Postgres NUMERIC is exact
 * decimal: the same product is 2883.3250 and rounds UP to 2883.33.
 *
 * That one-paisa gap meant a transaction's stored total did not equal its own
 * litres × price — visible to any client who checks an invoice line, and the
 * kind of discrepancy that costs more in argument than it does in rupees.
 *
 * Doing the multiplication in integer paise removes floating point from the
 * calculation entirely. Litres and price both carry at most 2 decimals, so
 * their product is exact at 4 decimals, and the final rounding is a single
 * well-defined half-up step that matches Postgres.
 */

/** Round a 2-decimal quantity to integer hundredths. */
const toPaise = (n) => Math.round(Number(n) * 100);

/**
 * volume_liters × price_per_liter, rounded to 2 decimals exactly as Postgres
 * would round it.
 *
 * Range is safe: 2000 L → 200_000 and ₹200/L → 20_000 give a product of
 * 4×10^9, far inside Number.MAX_SAFE_INTEGER.
 */
export const lineTotal = (litres, pricePerLitre) => {
  const product4dp = toPaise(litres) * toPaise(pricePerLitre); // value × 10^4
  return Math.round(product4dp / 100) / 100;                   // → 2 decimals
};
