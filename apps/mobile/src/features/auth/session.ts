import { authClient } from "@/lib/authClient";
import { setUnauthorizedHandler } from "@/lib/http/mobile";
import { queryClient } from "@/lib/queryClient";

/** Current session (`data.user`, `data.session`) — cached in SecureStore by the expo plugin. */
export const useSession = authClient.useSession;

export type SessionUser = NonNullable<ReturnType<typeof useSession>["data"]>["user"];

export async function signOut() {
  try {
    await authClient.signOut();
  } finally {
    // Never show the previous user's data to the next one.
    queryClient.clear();
  }
}

/**
 * Any API 401 (session expired / revoked on another device) → ask Better Auth to
 * re-fetch the session. If it's gone, `useSession` turns null and the root
 * `Stack.Protected` guard switches to the sign-in screens.
 */
export function installUnauthorizedHandler() {
  setUnauthorizedHandler(() => authClient.$store.notify("$sessionSignal"));
}
