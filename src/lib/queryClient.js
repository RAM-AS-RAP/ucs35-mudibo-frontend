import { QueryClient } from '@tanstack/react-query';

/**
 * The single TanStack Query client. The session store clears it on logout so no
 * account data survives a session. Query keys must never contain the token.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
    mutations: {
      retry: false,
    },
  },
});
