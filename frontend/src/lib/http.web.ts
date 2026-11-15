import {
  HttpError,
  readError,
  unwrapResponse,
  type HttpClient,
  type QueryParams,
  type RequestOptions,
  type UploadOptions,
} from "@tng/shared";
import { API_URL } from "@/lib/config";

/**
 * HttpClient cho web: xác thực bằng cookie session (Better Auth),
 * `credentials: "include"` trên mọi request.
 */

function buildUrl(path: string, params?: QueryParams): string {
  const url = new URL(`${API_URL}${path.startsWith("/") ? "" : "/"}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: RequestOptions,
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: BodyInit | undefined;

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const response = await fetch(buildUrl(path, opts?.params), {
    method,
    credentials: "include",
    headers,
    body: payload,
    signal: opts?.signal,
  });

  const json = await parseBody(response);

  if (!response.ok) {
    const { message, code } = readError(json, `HTTP ${response.status}`);
    throw new HttpError(response.status, message, { code, payload: json });
  }

  return (opts?.unwrap === false ? json : unwrapResponse(json)) as T;
}

function upload<T>(
  path: string,
  formData: FormData,
  opts?: UploadOptions,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildUrl(path));
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");

    if (opts?.onProgress && xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        opts.onProgress?.(Math.round((event.loaded / event.total) * 100));
      };
    }

    xhr.onload = () => {
      let json: unknown = null;
      try {
        json = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        json = xhr.responseText;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(unwrapResponse(json) as T);
        return;
      }
      const { message, code } = readError(json, `HTTP ${xhr.status}`);
      reject(new HttpError(xhr.status, message, { code, payload: json }));
    };

    xhr.onerror = () => reject(new HttpError(0, "Network error"));
    xhr.onabort = () => reject(new HttpError(0, "Upload aborted"));

    if (opts?.signal) {
      if (opts.signal.aborted) {
        xhr.abort();
        return;
      }
      opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(formData);
  });
}

export const webHttp: HttpClient = {
  get: (path, opts) => request("GET", path, undefined, opts),
  post: (path, body, opts) => request("POST", path, body, opts),
  put: (path, body, opts) => request("PUT", path, body, opts),
  patch: (path, body, opts) => request("PATCH", path, body, opts),
  del: (path, body, opts) => request("DELETE", path, body, opts),
  upload,
};
