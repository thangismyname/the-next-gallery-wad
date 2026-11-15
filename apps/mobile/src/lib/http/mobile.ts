import { HttpError, readError, unwrapResponse, type HttpClient, type QueryParams } from "@tng/shared";

import { authClient } from "../authClient";
import { API_URL } from "../config";

/** Called on any 401 — set by the auth feature to re-check the session. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

function buildUrl(path: string, params?: QueryParams): string {
  const url = new URL(`${API_URL}${path.startsWith("/") ? "" : "/"}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** Session cookie from SecureStore (Better Auth expo plugin) — replaces the browser cookie jar. */
async function authHeaders(): Promise<Record<string, string>> {
  const cookie = await authClient.getCookie();
  return cookie ? { Cookie: cookie } : {};
}

function parse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function fail(status: number, json: unknown): never {
  if (status === 401) onUnauthorized?.();
  const { message, code } = readError(json, `HTTP ${status}`);
  throw new HttpError(status, message, { code, payload: json });
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: { signal?: AbortSignal; params?: QueryParams; unwrap?: boolean },
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...(await authHeaders()) };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(buildUrl(path, opts?.params), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: opts?.signal,
    // We send the cookie ourselves; don't let the native cookie jar add a stale one.
    credentials: "omit",
  });
  const json = parse(await res.text());
  if (!res.ok) fail(res.status, json);
  return (opts?.unwrap === false ? json : unwrapResponse(json)) as T;
}

/** multipart upload via XHR (fetch has no upload progress in React Native). */
async function upload<T>(
  path: string,
  formData: FormData,
  opts?: { signal?: AbortSignal; onProgress?: (percent: number) => void },
): Promise<T> {
  const headers = await authHeaders();
  return new Promise<T>((resolve, reject) => {
    if (opts?.signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildUrl(path));
    xhr.withCredentials = false;
    xhr.setRequestHeader("Accept", "application/json");
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (opts?.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      const json = parse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) return resolve(unwrapResponse(json) as T);
      try {
        fail(xhr.status, json);
      } catch (err) {
        reject(err);
      }
    };
    xhr.onerror = () => reject(new HttpError(0, "Network error"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    opts?.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(formData);
  });
}

export const mobileHttp: HttpClient = {
  get: (path, opts) => request("GET", path, undefined, opts),
  post: (path, body, opts) => request("POST", path, body, opts),
  put: (path, body, opts) => request("PUT", path, body, opts),
  patch: (path, body, opts) => request("PATCH", path, body, opts),
  del: (path, body, opts) => request("DELETE", path, body, opts),
  upload,
};
