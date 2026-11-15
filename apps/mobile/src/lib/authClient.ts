import { expoClient } from "@better-auth/expo/client";
import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

import { API_BASE, APP_SCHEME } from "./config";

/**
 * Better Auth client for the app. The expo plugin keeps the session cookie (and a
 * cached session, so the app opens signed-in offline) in SecureStore and handles
 * OAuth via the `tng://` deep link. Other API calls attach the same cookie
 * (`lib/http/mobile.ts`) — the backend's `requireAuth` reads it like on the web.
 */
export const authClient = createAuthClient({
  baseURL: API_BASE,
  plugins: [
    adminClient(), // role / ban / sessions for the admin screens (same as web)
    expoClient({
      scheme: APP_SCHEME,
      storagePrefix: APP_SCHEME,
      storage: SecureStore,
    }),
  ],
});
