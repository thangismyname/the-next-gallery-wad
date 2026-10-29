// hooks/useAiBackfill.ts
// Trạng thái + chạy backfill theo lô cho 1 pipeline AI (CLIP / YOLO / DINOv3 /
// tag) — dùng ở thẻ "Xử lý AI" trong Cài đặt và banner của AI Studio.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  type AiPipeline,
  aiStatusQueryKey,
  fetchAiStatus,
  runAiBackfillBatch,
} from "@/services/aiProcessing";

export function useAiBackfill(
  pipeline: AiPipeline,
  { onBatch }: { onBatch?: () => void } = {},
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const status = useQuery({
    queryKey: aiStatusQueryKey(pipeline),
    queryFn: () => fetchAiStatus(pipeline),
    staleTime: 30_000,
  });

  // Rời trang giữa chừng → dừng vòng lặp sau lô đang chạy.
  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  const run = async () => {
    cancelled.current = false;
    setRunning(true);
    setError(null);
    try {
      while (!cancelled.current) {
        const batch = await runAiBackfillBatch(pipeline);
        await queryClient.invalidateQueries({
          queryKey: aiStatusQueryKey(pipeline),
        });
        onBatch?.();
        if (batch.remaining <= 0) break;
        // Lô không xử lý được ảnh nào (ai-service tắt / đang chạy stub) →
        // dừng thay vì lặp mãi.
        if (batch.done === 0) {
          setError(t("settings.ai.stalled"));
          break;
        }
      }
    } catch {
      setError(t("settings.ai.failed"));
    } finally {
      setRunning(false);
    }
  };

  const stop = () => {
    cancelled.current = true;
  };

  return { status, running, error, run, stop };
}
