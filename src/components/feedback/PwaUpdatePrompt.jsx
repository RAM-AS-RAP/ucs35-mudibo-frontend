import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'sonner';

/**
 * Registers the service worker and offers a refresh when a new version is waiting.
 * Rendered only in production builds (see App.jsx), so development never registers a worker.
 */
export default function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;
    toast('A new version is available.', {
      id: 'pwa-update',
      duration: Infinity,
      action: { label: 'Refresh', onClick: () => updateServiceWorker(true) },
    });
  }, [needRefresh, updateServiceWorker]);

  return null;
}
