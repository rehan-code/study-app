import { QueryClient } from '@tanstack/react-query';

const STALE_TIME_MS = 30_000;

/** Single app-wide client so every screen shares one cache across the router tree. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_MS,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
