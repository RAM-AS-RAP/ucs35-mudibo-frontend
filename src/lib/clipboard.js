/**
 * Copy text to the clipboard. Resolves true when it worked, false when the browser refused or
 * has no clipboard API (the screen then asks the person to copy it themselves).
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyText(text) {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
