import Constants from "expo-constants";

/** Single source of truth for mobile env config (apps/mobile/.env, see .env.example). */
const ENV_API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000/api";

/**
 * Dev: point at the machine running Metro (`hostUri` = the IP the phone already reaches),
 * keeping the env URL's port + path — the Mac's LAN IP changes with DHCP, so a hardcoded
 * IP in `.env` goes stale. Release builds (no Metro) use the env URL as is.
 */
function resolveApiUrl(): string {
  const metroHost = __DEV__ ? Constants.expoConfig?.hostUri?.split(":")[0] : undefined;
  if (!metroHost) return ENV_API_URL;
  // Only swap local/LAN hosts — a real domain (tunnel, staging) in .env wins. (RN's URL has no setters.)
  const LOCAL_HOST = /^(https?:\/\/)(localhost|127\.[\d.]+|10\.[\d.]+|192\.168\.[\d.]+|172\.(?:1[6-9]|2\d|3[01])\.[\d.]+)(?=[:/]|$)/;
  return ENV_API_URL.replace(LOCAL_HOST, `$1${metroHost}`);
}

export const API_URL = resolveApiUrl();

/** API origin without `/api` — Better Auth base URL + base for relative media URLs. */
export const API_BASE = API_URL.replace(/\/api\/?$/, "");

export const MOBILE_MEDIA_BASE = API_BASE;

/** Web app origin — password-reset emails link to `${WEB_URL}/reset-password`. */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || "http://localhost:5173").replace(/\/+$/, "");

/** Deep-link scheme (app.json "scheme"); the backend trusts `tng://`. */
export const APP_SCHEME = "tng";
