/** Better Auth client calls return `{ data, error }` instead of throwing — throw so React Query sees the error. */
export function unwrapAuth<T>(res: { data: T | null; error: { message?: string } | null }): T {
  if (res.error) throw new Error(res.error.message ?? "Request failed");
  return res.data as T;
}
