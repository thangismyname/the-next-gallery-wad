/** Hàng `import_sessions` (+ đếm từ import_session_media) → DTO. Thuần, không DB. */
export function toImportSession(row) {
  const imported = Number(row.imported ?? 0);
  const duplicates = Number(row.duplicates ?? 0);
  const failures = Array.isArray(row.failures) ? row.failures : [];
  return {
    id: row.id,
    source: row.source,
    client: row.client,
    status: row.status,
    plan: row.plan ?? {},
    counts: {
      imported,
      duplicates,
      skippedExisting: row.skipped_existing ?? 0,
      failed: failures.length,
    },
    failures,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null,
  };
}
