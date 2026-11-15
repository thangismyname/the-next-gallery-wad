/**
 * HTTP abstraction dùng chung cho web (cookie session) và mobile (Bearer token).
 *
 * Services trong `@tng/shared` chỉ phụ thuộc vào interface này, không gọi
 * `fetch` trực tiếp — nhờ đó cùng một service chạy được ở cả hai nền tảng.
 */

/** Query params: bỏ qua giá trị undefined / null. */
export type QueryParams = Record<
  string,
  string | number | boolean | undefined | null
>;

export interface RequestOptions {
  signal?: AbortSignal;
  params?: QueryParams;
  /** false → trả về body thô (không bóc `data`), dùng cho endpoint có field anh em với `data`. */
  unwrap?: boolean;
}

export interface UploadOptions {
  signal?: AbortSignal;
  /** Tiến độ upload 0–100 (chỉ web XHR / RN XHR hỗ trợ). */
  onProgress?: (percent: number) => void;
}

export interface HttpClient {
  get<T>(path: string, opts?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  del<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  /** multipart/form-data — dùng cho upload media. */
  upload<T>(
    path: string,
    formData: FormData,
    opts?: UploadOptions,
  ): Promise<T>;
}

/** Lỗi HTTP có kèm status + payload để caller phân nhánh (401, 404, 429...). */
export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly payload?: unknown;

  constructor(
    status: number,
    message: string,
    options?: { code?: string; payload?: unknown },
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = options?.code;
    this.payload = options?.payload;
  }
}

/**
 * Backend trả hai dạng: `{ data: ... }` (hầu hết endpoint) hoặc raw.
 * Helper này thống nhất cách bóc tách cho mọi implementation.
 */
export function unwrapResponse(json: unknown): unknown {
  if (json && typeof json === "object" && "data" in json) {
    const data = (json as { data: unknown }).data;
    return data ?? json;
  }
  return json;
}

/** Parse body lỗi an toàn — hỗ trợ `{ error: { message, code } }` và `{ message, code }`. */
export function readError(
  json: unknown,
  fallback: string,
): { message: string; code?: string } {
  if (json && typeof json === "object") {
    const value = json as Record<string, unknown>;
    const nested =
      value.error && typeof value.error === "object"
        ? (value.error as Record<string, unknown>)
        : undefined;

    const nestedMessage =
      nested && typeof nested.message === "string" ? nested.message : undefined;
    const nestedCode =
      nested && typeof nested.code === "string" ? nested.code : undefined;

    const message =
      nestedMessage ||
      (typeof value.message === "string" ? value.message : undefined) ||
      (typeof value.error === "string" ? value.error : undefined) ||
      fallback;
    const code =
      nestedCode ||
      (typeof value.code === "string" ? value.code : undefined);
    return { message, code };
  }
  return { message: fallback };
}
