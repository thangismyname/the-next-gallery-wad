import { QueryClient } from "@tanstack/react-query";

/** The app's one QueryClient — also used outside React (import engine refreshing the gallery). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
