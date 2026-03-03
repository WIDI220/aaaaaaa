import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      staleTime: 30 * 1000,        // 30 Sekunden cache - verhindert unnötige Reloads
      gcTime: 5 * 60 * 1000,       // 5 Minuten im Speicher behalten
      refetchOnWindowFocus: false,  // KEIN Reload beim Tab-Wechsel - verhindert Flackern
      refetchOnMount: true,
      refetchOnReconnect: true,
      networkMode: 'online',
    },
    mutations: {
      retry: 1,
      networkMode: 'online',
    },
  },
});
