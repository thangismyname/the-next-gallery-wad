// Dữ liệu + hành động của trang chỉnh ảnh: công thức đã lưu, ảnh nguồn (bản
// display GỐC), lịch sử undo/redo, lưu / về ảnh gốc.
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EditRecipe } from "@tng/shared";
import { deleteMediaEdit, fetchMediaEdit, saveMediaEdit } from "@/services/media";
import { DEFAULT_RECIPE, normalizeRecipe, sameRecipe } from "./recipe";

const editQueryKey = (id: string) => ["media-edit", id] as const;

async function loadBitmap(url: string) {
  // fetch (CORS) → ImageBitmap: WebGL đọc được pixel ảnh khác origin.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return createImageBitmap(await res.blob());
}

export function useEditor(mediaId: string) {
  const queryClient = useQueryClient();
  const edit = useQuery({ queryKey: editQueryKey(mediaId), queryFn: () => fetchMediaEdit(mediaId), staleTime: Infinity });
  const image = useQuery({
    queryKey: ["media-edit-source", mediaId],
    queryFn: () => loadBitmap(edit.data!.sourceUrl),
    enabled: Boolean(edit.data),
    staleTime: Infinity,
    gcTime: 0, // ImageBitmap lớn — không giữ lại sau khi rời trang
  });

  const saved = normalizeRecipe(edit.data?.recipe);
  // Lịch sử: mỗi lần thả thanh trượt = 1 bước; `recipe` = bản đang kéo (chưa vào lịch sử).
  const [history, setHistory] = useState<{ steps: EditRecipe[]; index: number }>({ steps: [DEFAULT_RECIPE], index: 0 });
  const [recipe, setRecipe] = useState<EditRecipe>(DEFAULT_RECIPE);

  // Tải xong / vừa lưu → bắt đầu lại từ bản đã lưu (query không tự refetch:
  // staleTime Infinity, afterChange bỏ qua key media-edit).
  const data = edit.data;
  useEffect(() => {
    if (!data) return;
    const start = normalizeRecipe(data.recipe);
    setRecipe(start);
    setHistory({ steps: [start], index: 0 });
  }, [data]);

  /** Chốt `next` thành 1 bước lịch sử (bỏ nhánh redo). */
  const commit = useCallback((next: EditRecipe) => {
    setRecipe(next);
    setHistory((h) =>
      sameRecipe(h.steps[h.index], next)
        ? h
        : { steps: [...h.steps.slice(0, h.index + 1), next], index: h.index + 1 },
    );
  }, []);

  const go = (delta: number) => {
    const index = Math.min(history.steps.length - 1, Math.max(0, history.index + delta));
    setHistory({ ...history, index });
    setRecipe(history.steps[index]);
  };

  const afterChange = async () => {
    // URL thumbnail đổi theo lần chỉnh → mọi danh sách phải tải lại URL mới
    // (trừ dữ liệu của chính editor — ảnh nguồn không đổi).
    await queryClient.invalidateQueries({ predicate: (q) => !String(q.queryKey[0]).startsWith("media-edit") });
  };

  const save = useMutation({
    mutationFn: (blob: Blob) => saveMediaEdit(mediaId, recipe, blob),
    onSuccess: async (data) => {
      queryClient.setQueryData(editQueryKey(mediaId), data);
      await afterChange();
    },
  });

  const revert = useMutation({
    mutationFn: () => deleteMediaEdit(mediaId),
    onSuccess: async () => {
      queryClient.setQueryData(editQueryKey(mediaId), { ...edit.data!, recipe: null, updatedAt: null });
      await afterChange();
    },
  });

  return {
    status: edit.isError || image.isError ? "error" : image.data ? "ready" : "loading",
    image: image.data ?? null,
    hasSavedEdit: Boolean(edit.data?.recipe),
    recipe,
    /** Đang kéo (chưa vào lịch sử). */
    preview: setRecipe,
    commit,
    canUndo: history.index > 0,
    canRedo: history.index < history.steps.length - 1,
    undo: () => go(-1),
    redo: () => go(1),
    dirty: !sameRecipe(recipe, saved),
    save,
    revert,
  };
}
