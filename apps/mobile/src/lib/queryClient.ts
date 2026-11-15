import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import { HttpError } from "@tng/shared";
import * as Network from "expo-network";
import { AppState, Platform } from "react-native";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry network / 5xx errors twice; a 4xx (401, 404, 429…) won't fix itself.
      retry: (count, error) =>
        count < 2 && !(error instanceof HttpError && error.status >= 400 && error.status < 500),
    },
  },
});

/**
 * React Query has no window focus / online events on native — wire them to
 * AppState (refetch stale queries when the app returns to the foreground) and
 * expo-network (pause while offline, refetch on reconnect). Call once at startup.
 */
export function setupQueryManagers() {
  if (Platform.OS === "web") return;
  onlineManager.setEventListener((setOnline) => {
    const sub = Network.addNetworkStateListener((state) => setOnline(state.isConnected !== false));
    return () => sub.remove();
  });
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener("change", (status) => setFocused(status === "active"));
    return () => sub.remove();
  });
}
