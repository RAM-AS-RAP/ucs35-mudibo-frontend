import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeTargetSize,
  ImageError,
  INPUT_LIMIT_BYTES,
  MAX_SIDE,
  OUTPUT_NAME,
  prepareImage,
  UPLOAD_LIMIT_BYTES,
} from './image';

/** @param {string} type @param {number} [size] */
function fakeFile(type, size = 1000, name = 'IMG_0001.jpg') {
  const file = new File([new Uint8Array(Math.min(size, 16))], name, { type });
  if (size > 16) Object.defineProperty(file, 'size', { value: size });
  return file;
}

/**
 * Mock the canvas: records the drawing calls and answers toBlob with blobs of the given sizes,
 * one per attempt.
 * @param {number[]} blobSizes
 */
function mockCanvas(blobSizes) {
  const calls = /** @type {Array<[string, ...unknown[]]>} */ ([]);
  const qualities = /** @type {number[]} */ ([]);
  const sizes = /** @type {Array<{ width: number, height: number }>} */ ([]);
  const context = {
    set fillStyle(value) {
      calls.push(['fillStyle', value]);
    },
    fillRect: (...args) => calls.push(['fillRect', ...args]),
    drawImage: (...args) => calls.push(['drawImage', ...args]),
  };
  let attempt = 0;
  const real = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
    if (tag !== 'canvas') return real(tag, options);
    const canvas = real('canvas');
    canvas.getContext = /** @type {any} */ (() => context);
    canvas.toBlob = (callback, type, quality) => {
      sizes.push({ width: canvas.width, height: canvas.height });
      qualities.push(/** @type {number} */ (quality));
      const size = blobSizes[Math.min(attempt, blobSizes.length - 1)];
      attempt += 1;
      const blob = new Blob([new Uint8Array(8)], { type });
      Object.defineProperty(blob, 'size', { value: size });
      callback(blob);
    };
    return canvas;
  });
  return { calls, qualities, sizes };
}

/** @param {number} width @param {number} height */
function mockBitmap(width, height) {
  const bitmap = { width, height, close: vi.fn() };
  const create = vi.fn(async () => bitmap);
  vi.stubGlobal('createImageBitmap', create);
  return { bitmap, create };
}

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock-url');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('computeTargetSize', () => {
  it('never upscales', () => {
    expect(computeTargetSize(800, 600, MAX_SIDE)).toEqual({ width: 800, height: 600 });
  });
  it('keeps an image exactly at the limit', () => {
    expect(computeTargetSize(1600, 1200, 1600)).toEqual({ width: 1600, height: 1200 });
  });
  it('scales landscape by the width', () => {
    expect(computeTargetSize(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });
  it('scales portrait by the height', () => {
    expect(computeTargetSize(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });
  it('never returns a zero side', () => {
    expect(computeTargetSize(10000, 2, 1600)).toEqual({ width: 1600, height: 1 });
  });
});

describe('prepareImage', () => {
  it.each([
    ['a GIF', 'image/gif'],
    ['a text file', 'text/plain'],
    ['a HEIC photo', 'image/heic'],
  ])('rejects %s', async (_name, type) => {
    await expect(prepareImage(fakeFile(type))).rejects.toMatchObject({
      name: 'ImageError',
      code: 'unsupported_type',
    });
  });

  it('rejects a file over 20 MB before decoding', async () => {
    const { create } = mockBitmap(100, 100);
    await expect(prepareImage(fakeFile('image/jpeg', INPUT_LIMIT_BYTES + 1))).rejects.toMatchObject(
      { code: 'input_too_large' },
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects more than 40 megapixels and closes the bitmap', async () => {
    const { bitmap } = mockBitmap(8000, 6000);
    mockCanvas([1000]);
    await expect(prepareImage(fakeFile('image/jpeg'))).rejects.toMatchObject({
      code: 'too_many_pixels',
    });
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('decodes with the EXIF orientation and outputs a JPEG named photo.jpg', async () => {
    const { bitmap, create } = mockBitmap(4000, 3000);
    const { qualities, sizes } = mockCanvas([240_000]);
    const result = await prepareImage(fakeFile('image/png', 3_000_000, 'IMG.png'));
    expect(create).toHaveBeenCalledWith(expect.any(File), { imageOrientation: 'from-image' });
    expect(result.blob).toBeInstanceOf(File);
    expect(result.blob.name).toBe(OUTPUT_NAME);
    expect(result.blob.type).toBe('image/jpeg');
    expect(result).toMatchObject({ width: 1600, height: 1200 });
    expect(result.bytes).toBe(result.blob.size);
    expect(qualities).toEqual([0.85]);
    expect(sizes).toEqual([{ width: 1600, height: 1200 }]);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('fills the canvas white before drawing (a transparent PNG becomes white)', async () => {
    mockBitmap(800, 600);
    const { calls } = mockCanvas([1000]);
    await prepareImage(fakeFile('image/png'));
    expect(calls.map(([name]) => name)).toEqual(['fillStyle', 'fillRect', 'drawImage']);
    expect(calls[0][1]).toBe('white');
    expect(calls[1]).toEqual(['fillRect', 0, 0, 800, 600]);
  });

  it('retries at a lower quality, then smaller, when the result is too large', async () => {
    mockBitmap(4000, 3000);
    const big = UPLOAD_LIMIT_BYTES + 1;
    const { qualities, sizes } = mockCanvas([big, big, 2_000_000]);
    const result = await prepareImage(fakeFile('image/jpeg'));
    expect(qualities).toEqual([0.85, 0.7, 0.55]);
    expect(sizes[2]).toEqual({ width: 1280, height: 960 });
    expect(result).toMatchObject({ width: 1280, height: 960 });
  });

  it('fails with still_too_large after the last attempt and closes the bitmap', async () => {
    const { bitmap } = mockBitmap(4000, 3000);
    const { qualities } = mockCanvas([UPLOAD_LIMIT_BYTES + 1]);
    await expect(prepareImage(fakeFile('image/jpeg'))).rejects.toMatchObject({
      code: 'still_too_large',
    });
    expect(qualities).toHaveLength(3);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('falls back to an <img> when createImageBitmap is missing and revokes its URL', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    mockCanvas([1000]);
    const OriginalImage = globalThis.Image;
    class FakeImage {
      naturalWidth = 2000;
      naturalHeight = 1000;
      /** @type {null | (() => void)} */ onload = null;
      /** @type {null | (() => void)} */ onerror = null;
      decoding = '';
      set src(_value) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    try {
      const result = await prepareImage(fakeFile('image/jpeg'));
      expect(result).toMatchObject({ width: 1600, height: 800 });
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    } finally {
      vi.stubGlobal('Image', OriginalImage);
    }
  });

  it('reports decode_failed and revokes the URL when the <img> cannot decode', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => Promise.reject(new Error('bad'))),
    );
    class BrokenImage {
      /** @type {null | (() => void)} */ onload = null;
      /** @type {null | (() => void)} */ onerror = null;
      set src(_value) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', BrokenImage);
    await expect(prepareImage(fakeFile('image/jpeg'))).rejects.toBeInstanceOf(ImageError);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
