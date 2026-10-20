/**
 * Read a multipart/form-data request in tests. Under jsdom, undici cannot parse file parts with
 * request.formData() (its File is not jsdom's), and it writes a jsdom File's filename as "blob";
 * so the raw body is split here. The browser sends the real filename (photo.jpg), which the
 * FormData built in src/api/endpoints/listings.js carries (tested there).
 */

/**
 * @typedef {{ name: string, filename: string | null, type: string | null, value: string, size: number }} Part
 */

/**
 * @param {Request} request
 * @returns {Promise<Part[]>}
 */
export async function readMultipart(request) {
  const contentType = request.headers.get('Content-Type') ?? '';
  const boundary = /boundary=([^;]+)/.exec(contentType)?.[1];
  if (!contentType.startsWith('multipart/form-data') || !boundary) {
    throw new Error(`Not a multipart request: ${contentType}`);
  }
  const body = new TextDecoder('latin1').decode(await request.arrayBuffer());
  return body
    .split(`--${boundary}`)
    .slice(1, -1)
    .map((chunk) => {
      const [head, ...rest] = chunk.replace(/^\r\n/, '').split('\r\n\r\n');
      const value = rest.join('\r\n\r\n').replace(/\r\n$/, '');
      const disposition = /content-disposition:[^\r\n]*/i.exec(head)?.[0] ?? '';
      return {
        name: /name="([^"]*)"/.exec(disposition)?.[1] ?? '',
        filename: /filename="([^"]*)"/.exec(disposition)?.[1] ?? null,
        type: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? null,
        value,
        size: value.length,
      };
    });
}

/**
 * The text fields of a multipart request as an object (file parts are left out).
 * @param {Part[]} parts
 */
export function textFields(parts) {
  return Object.fromEntries(parts.filter((p) => p.filename === null).map((p) => [p.name, p.value]));
}
