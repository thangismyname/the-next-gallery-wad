import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { formatDateTime, importsQueryKey } from "@tng/shared";

import { importsApi } from "@/services/imports";

/** Các lần nhập trước (`GET /api/imports`, 20 gần nhất). */
export const ImportHistory: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { data } = useQuery({ queryKey: importsQueryKey, queryFn: importsApi.listImports });
  if (!data?.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{t("takeout.history")}</h2>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {data.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p>{formatDateTime(s.startedAt, i18n.language)}</p>
              <p className="truncate text-xs text-muted-foreground">
                {t("takeout.historyLine", {
                  imported: s.counts.imported,
                  duplicates: s.counts.duplicates + s.counts.skippedExisting,
                  failed: s.counts.failed,
                })}
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {t(`takeout.status.${s.status}`)} · {s.client}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};
