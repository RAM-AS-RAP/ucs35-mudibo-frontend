/**
 * The estimated order total on the listing screen (F3). This is a display estimate only: the
 * server computes the charged `total_amount` (quantity times unit price, rounded up to a whole
 * shilling) and every screen after checkout shows that number.
 */
import { toHundredths } from './decimal';

/**
 * Quantity times price per kg, rounded up to a whole shilling, without floating point: both
 * values become integer hundredths (BigInt), so the product is scaled by 10 000.
 * Examples: 2.5 and 112.56 give 282; 1 and 40.00 give 40; 0.01 and 40 give 1.
 * @param {string | number | null | undefined} quantityText  a decimal with at most 2 places
 * @param {string | number | null | undefined} pricePerKgText  a decimal with at most 2 places
 * @returns {number | null}  whole shillings, or null for invalid input
 */
export function estimateTotalKES(quantityText, pricePerKgText) {
  const quantity = toHundredths(quantityText);
  const price = toHundredths(pricePerKgText);
  if (quantity === null || price === null) return null;
  const product = quantity * price;
  const shillings = (product + 9999n) / 10000n;
  if (shillings > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(shillings);
}
