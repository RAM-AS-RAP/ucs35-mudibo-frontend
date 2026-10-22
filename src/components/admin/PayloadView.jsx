import { useState } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copyText } from '@/lib/clipboard';
import { formatBytes } from '@/lib/format';
import { PAYLOAD_TEXT } from '@/lib/adminMessages';

/** Payloads longer than this (in bytes of UTF-8 text) are shortened until "Show all". */
export const PAYLOAD_LIMIT_BYTES = 16 * 1024;

/**
 * A payload as indented JSON text, or a readable fallback.
 * @param {unknown} payload
 */
export function payloadText(payload) {
  try {
    const text = JSON.stringify(payload, null, 2);
    return typeof text === 'string' ? text : String(payload);
  } catch {
    return PAYLOAD_TEXT.unreadable;
  }
}

/**
 * The first `limit` bytes of a text, cut at a character boundary.
 * @param {string} text
 * @param {number} limit
 */
function firstBytes(text, limit) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= limit) return { text, size: bytes.length, cut: false };
  // TextDecoder drops a split character at the end instead of throwing.
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, limit));
  return { text: head.replace(/�$/, ''), size: bytes.length, cut: true };
}

/**
 * A payment event payload shown as plain text in a `pre`. React escapes it, so markup in a
 * payload is shown, never run. Payloads over 16 KB are shortened with "Show all". The copy
 * button copies exactly the payload text shown when expanded.
 * @param {{ payload: unknown, label: string }} props  label names the payload for screen readers
 */
export function PayloadView({ payload, label }) {
  const [expanded, setExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const full = payloadText(payload);
  const { text: head, size, cut } = firstBytes(full, PAYLOAD_LIMIT_BYTES);
  const shown = expanded || !cut ? full : head;

  async function copy() {
    setCopyStatus((await copyText(full)) ? PAYLOAD_TEXT.copied : PAYLOAD_TEXT.copyFailed);
  }

  return (
    <div className="flex flex-col gap-2">
      <figure className="m-0">
        <figcaption className="sr-only">{label}</figcaption>
        <pre
          className="rounded-md border border-border bg-neutral-bg p-3 font-mono text-sm break-words whitespace-pre-wrap text-text"
          data-testid="payload"
        >
          {shown}
        </pre>
      </figure>
      {cut && !expanded && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          <span>{PAYLOAD_TEXT.truncated(formatBytes(size))}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(true)}>
            {PAYLOAD_TEXT.showAll}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          <Copy aria-hidden="true" />
          {PAYLOAD_TEXT.copy}
        </Button>
        <span role="status" className="text-sm text-text-secondary">
          {copyStatus}
        </span>
      </div>
    </div>
  );
}
