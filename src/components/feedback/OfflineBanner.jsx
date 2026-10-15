import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';

export const OFFLINE_MESSAGE = 'You are offline. Prices, forecasts and payments need a connection.';

/** @param {() => void} callback */
function subscribe(callback) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

const getOnline = () => navigator.onLine;
const getServerOnline = () => true;

/** Shown while the device has no connection. The app never serves cached API data. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, getOnline, getServerOnline);
  return (
    <div role="status" aria-live="polite">
      {!online && (
        <div className="flex items-center justify-center gap-2 border-b border-border bg-neutral-bg px-4 py-2 text-center text-sm font-medium text-neutral-text">
          <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          <span>{OFFLINE_MESSAGE}</span>
        </div>
      )}
    </div>
  );
}
