import { WifiOff } from 'lucide-react';
import { useConnectivity } from '@/lib/connectivity';

export const OFFLINE_MESSAGE = 'You are offline. Prices, forecasts and payments need a connection.';
export const UNREACHABLE_MESSAGE =
  "Can't reach AgriSence right now. Check your connection; you stay signed in.";

/**
 * Shown while the device has no connection, or after a request could not reach the API.
 * The app never serves cached API data.
 */
export function OfflineBanner() {
  const status = useConnectivity();
  return (
    <div role="status" aria-live="polite">
      {status !== 'online' && (
        <div className="flex items-center justify-center gap-2 border-b border-border bg-neutral-bg px-4 py-2 text-center text-sm font-medium text-neutral-text">
          <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          <span>{status === 'offline' ? OFFLINE_MESSAGE : UNREACHABLE_MESSAGE}</span>
        </div>
      )}
    </div>
  );
}
