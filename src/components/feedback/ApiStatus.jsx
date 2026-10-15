import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { getDbHealth, getHealth } from '@/api/endpoints';
import { config } from '@/lib/env';

/** Shown in development, or in a build with VITE_SHOW_API_STATUS="true". */
export function isApiStatusEnabled() {
  return import.meta.env.DEV || config.showApiStatus;
}

/**
 * @param {{ label: string, query: { isPending: boolean, isError: boolean } }} props
 */
function StatusLine({ label, query }) {
  if (query.isPending) {
    return (
      <li className="flex items-center gap-2">
        <Loader2 aria-hidden="true" className="size-4 animate-spin text-text-secondary" />
        <span>{label}: checking</span>
      </li>
    );
  }
  if (query.isError) {
    return (
      <li className="flex items-center gap-2 text-negative-text">
        <XCircle aria-hidden="true" className="size-4 text-negative" />
        <span>{label}: unreachable</span>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 text-positive-text">
      <CheckCircle2 aria-hidden="true" className="size-4 text-positive" />
      <span>{label}: OK</span>
    </li>
  );
}

/** Backend health indicator (GET /health and GET /health/db). */
export function ApiStatus() {
  const enabled = isApiStatusEnabled();
  const health = useQuery({ queryKey: ['system', 'health'], queryFn: getHealth, enabled });
  const db = useQuery({ queryKey: ['system', 'health', 'db'], queryFn: getDbHealth, enabled });
  if (!enabled) return null;
  return (
    <section
      aria-label="Backend status"
      className="rounded-lg border border-border bg-card px-4 py-3 text-sm"
    >
      <ul className="flex flex-col gap-1">
        <StatusLine label="API" query={health} />
        <StatusLine label="Database" query={db} />
      </ul>
    </section>
  );
}
