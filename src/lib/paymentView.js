/**
 * Display helpers for an order's latest payment (identity v2, prompt 2).
 */

/**
 * True when the prompt went to another number than the one the buyer entered: in a test
 * environment the server sends every prompt to a fixed sandbox number. Both masked values must
 * be present and different.
 * @param {{ phone_masked?: string | null, stk_target_masked?: string | null } | null | undefined} payment
 */
export function targetDiffers(payment) {
  const entered = payment?.phone_masked;
  const target = payment?.stk_target_masked;
  return Boolean(
    typeof entered === 'string' &&
    entered &&
    typeof target === 'string' &&
    target &&
    entered !== target,
  );
}
