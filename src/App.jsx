import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
import { OfflineBanner } from '@/components/feedback/OfflineBanner';
import { Toaster } from '@/components/ui/sonner';
import { routes } from './routes';

const router = createBrowserRouter(routes);

// The service worker is registered only in production builds.
const PwaUpdatePrompt = import.meta.env.PROD
  ? lazy(() => import('@/components/feedback/PwaUpdatePrompt'))
  : null;

export default function App() {
  return (
    <ErrorBoundary level="app">
      <QueryClientProvider client={queryClient}>
        <OfflineBanner />
        <RouterProvider router={router} />
        <Toaster />
        {PwaUpdatePrompt && (
          <Suspense fallback={null}>
            <PwaUpdatePrompt />
          </Suspense>
        )}
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
