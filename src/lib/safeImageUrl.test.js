import { describe, expect, it } from 'vitest';
import { safeImageUrl } from './safeImageUrl';

describe('safeImageUrl', () => {
  it('keeps https URLs', () => {
    expect(safeImageUrl('https://images.agrisence.test/a.jpg')).toBe(
      'https://images.agrisence.test/a.jpg',
    );
  });

  it('allows http on localhost and 127.0.0.1 in development only', () => {
    expect(safeImageUrl('http://localhost:8000/media/a.jpg', { dev: true })).toBe(
      'http://localhost:8000/media/a.jpg',
    );
    expect(safeImageUrl('http://127.0.0.1:8000/a.jpg', { dev: true })).toBe(
      'http://127.0.0.1:8000/a.jpg',
    );
    expect(safeImageUrl('http://localhost:8000/media/a.jpg', { dev: false })).toBeNull();
  });

  it.each([
    ['plain http', 'http://images.agrisence.test/a.jpg'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:image/png;base64,iVBORw0KGgo='],
    ['blob:', 'blob:https://example.test/1234'],
    ['relative', '/media/a.jpg'],
    ['empty', ''],
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
  ])('drops %s', (_name, url) => {
    expect(safeImageUrl(url, { dev: true })).toBeNull();
  });
});
