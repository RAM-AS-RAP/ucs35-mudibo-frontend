/**
 * Listing photo preparation in the browser (F2b): check, decode, downscale and re-encode as
 * JPEG before upload. Re-encoding through a canvas drops all metadata, including the GPS
 * location that phone cameras write into photos. The server re-encodes again.
 *
 * Loaded only with a dynamic import, from the photo picker on the create and edit screens.
 */

/** The server's MAX_IMAGE_BYTES (5 MiB, docs/backend/frontend_contract.md "Uploads"). */
export const UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024;
/** Larger originals are refused before decoding, to protect low end phones. */
export const INPUT_LIMIT_BYTES = 20 * 1024 * 1024;
export const MAX_PIXELS = 40_000_000;
export const MAX_SIDE = 1600;
export const ACCEPTED_TYPES = Object.freeze(['image/jpeg', 'image/png']);
export const OUTPUT_NAME = 'photo.jpg';

/** Encoding attempts, in order, until the result fits the upload limit. */
export const ENCODE_ATTEMPTS = Object.freeze([
  { quality: 0.85, maxSide: MAX_SIDE },
  { quality: 0.7, maxSide: MAX_SIDE },
  { quality: 0.55, maxSide: 1280 },
]);

/**
 * @typedef {'unsupported_type' | 'input_too_large' | 'decode_failed' | 'too_many_pixels' | 'still_too_large'} ImageErrorCode
 */

export class ImageError extends Error {
  /** @param {ImageErrorCode} code */
  constructor(code) {
    super(code);
    this.name = 'ImageError';
    this.code = code;
  }
}

/**
 * The size that fits within `max` on the longest side, keeping the aspect ratio. Never upscales.
 * @param {number} width
 * @param {number} height
 * @param {number} max
 * @returns {{ width: number, height: number }}
 */
export function computeTargetSize(width, height, max) {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const factor = max / longest;
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}

/**
 * @typedef {{ source: CanvasImageSource, width: number, height: number, close: () => void }} Decoded
 */

/**
 * Decode with createImageBitmap (applying the EXIF orientation), or through an <img> element
 * where createImageBitmap is missing or fails.
 * @param {Blob} file
 * @returns {Promise<Decoded>}
 */
async function decode(file) {
  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Fall through to the <img> decoder.
    }
  }
  return decodeWithImage(file);
}

/**
 * @param {Blob} file
 * @returns {Promise<Decoded>}
 */
function decodeWithImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        // Revoked once the image has been drawn.
        close: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageError('decode_failed'));
    };
    img.src = url;
  });
}

/**
 * Draw on a white canvas (a transparent PNG becomes white, not black) and encode as JPEG.
 * @param {Decoded} decoded
 * @param {{ width: number, height: number }} size
 * @param {number} quality
 * @returns {Promise<Blob>}
 */
async function encode(decoded, size, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new ImageError('decode_failed');
    context.fillStyle = 'white';
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(decoded.source, 0, 0, size.width, size.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new ImageError('decode_failed');
    return /** @type {Blob} */ (blob);
  } finally {
    // Release the canvas memory straight away (it matters on low end phones).
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Prepare a chosen photo for upload.
 * @param {File} file
 * @returns {Promise<{ blob: File, width: number, height: number, bytes: number }>}
 * @throws {ImageError}
 */
export async function prepareImage(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new ImageError('unsupported_type');
  if (file.size > INPUT_LIMIT_BYTES) throw new ImageError('input_too_large');

  let decoded;
  try {
    decoded = await decode(file);
  } catch (error) {
    throw error instanceof ImageError ? error : new ImageError('decode_failed');
  }
  try {
    if (!decoded.width || !decoded.height) throw new ImageError('decode_failed');
    if (decoded.width * decoded.height > MAX_PIXELS) throw new ImageError('too_many_pixels');
    for (const attempt of ENCODE_ATTEMPTS) {
      const size = computeTargetSize(decoded.width, decoded.height, attempt.maxSide);
      const blob = await encode(decoded, size, attempt.quality);
      if (blob.size <= UPLOAD_LIMIT_BYTES) {
        const jpeg = new File([blob], OUTPUT_NAME, { type: 'image/jpeg' });
        return { blob: jpeg, width: size.width, height: size.height, bytes: jpeg.size };
      }
    }
    throw new ImageError('still_too_large');
  } finally {
    decoded.close();
  }
}
