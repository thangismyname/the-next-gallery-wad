import type { HttpClient } from "../http";

export type ImportStatus = "running" | "done" | "cancelled" | "failed";
export type ImportFailureReason = "badFile" | "network" | "unreadable";

export interface ImportFailure {
  path: string;
  reason: ImportFailureReason;
}

/** Backend `modules/imports/imports.mapper.js::toImportSession`. */
export interface ImportSession {
  id: string;
  source: "takeout";
  client: "web" | "mobile";
  status: ImportStatus;
  /** Numbers shown at preview time (media, videos, albums, duplicates, missingJson, skipped, existing). */
  plan: Record<string, number>;
  counts: { imported: number; duplicates: number; skippedExisting: number; failed: number };
  /** Only in `getImport` (the list leaves it out). */
  failures?: ImportFailure[];
  startedAt: string;
  finishedAt: string | null;
}

export const importsQueryKey = ["imports"] as const;

/** Server keeps ≤ 500 failures per session. */
export const MAX_IMPORT_FAILURES = 500;

export const createImportsService = (http: HttpClient) => ({
  /** Which `{ name, size }` the user already has (≤ 1000 per call, same order). */
  checkImport: async (items: { name: string; size: number }[]): Promise<boolean[]> =>
    (await http.post<{ exists: boolean[] }>("/imports/check", { items })).exists,

  createImport: (body: { source: "takeout"; client: "web" | "mobile"; plan: Record<string, number> }) =>
    http.post<ImportSession>("/imports", body),

  updateImport: (
    id: string,
    patch: { status?: ImportStatus; skippedExisting?: number; failures?: ImportFailure[] },
  ) => http.patch<ImportSession>(`/imports/${id}`, patch),

  listImports: () => http.get<ImportSession[]>("/imports"),

  getImport: (id: string) => http.get<ImportSession>(`/imports/${id}`),
});

export type ImportsService = ReturnType<typeof createImportsService>;
