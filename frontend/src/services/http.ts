import { API_URL } from "@/lib/config";

/**
 * fetch JSON của API `{ success, data }` — lỗi ném Error kèm message từ backend
 * + `status` / `code` (vd 409 LABEL_EXISTS). Gửi body thì tự thêm Content-Type JSON.
 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(
      new Error(json?.error?.message ?? `HTTP ${res.status}`),
      {
        status: res.status,
        code: json?.error?.code as string | undefined,
      },
    );
  }
  return (json.data ?? json) as T;
}
