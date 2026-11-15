import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, Loader2, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdjustPanel } from "./components/AdjustPanel";
import { EditRenderer } from "./engine/renderer";
import { DEFAULT_RECIPE, isNeutral } from "./recipe";
import { useEditor } from "./useEditor";

/**
 * /edit/:id — basic edit không phá huỷ: WebGL2 vẽ lại ngay khi kéo thanh trượt,
 * "Lưu" gửi công thức + ảnh đã render (backend giữ nguyên file gốc).
 * Giữ nút mắt (hoặc phím \) = xem ảnh gốc. ⌘/Ctrl+Z · ⇧⌘/Ctrl+Z = undo / redo.
 */
export function EditorView() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const editor = useEditor(id);
  const { image, recipe, undo, redo, canUndo, canRedo } = editor;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<EditRenderer | null>(null);
  const [glError, setGlError] = useState(false);
  const [comparing, setComparing] = useState(false);

  // Renderer gắn với canvas; ảnh nguồn sẵn sàng → nạp texture.
  useEffect(() => {
    if (!image || !canvasRef.current) return;
    try {
      rendererRef.current ??= new EditRenderer(canvasRef.current);
      rendererRef.current.setImage(image);
    } catch {
      setGlError(true);
    }
  }, [image]);
  useEffect(() => () => rendererRef.current?.dispose(), []);

  useEffect(() => {
    if (image) rendererRef.current?.render(comparing ? DEFAULT_RECIPE : recipe);
  }, [image, recipe, comparing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input:not([type=range]), textarea")) return;
      if (e.key === "\\") setComparing(e.type === "keydown");
      if (e.type !== "keydown" || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) {
        if (canRedo) redo();
      } else if (canUndo) undo();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [undo, redo, canUndo, canRedo]);

  const leave = useCallback(() => {
    if (editor.dirty && !window.confirm(t("editor.unsavedConfirm"))) return;
    if (window.history.length > 1) navigate(-1);
    else navigate("/gallery");
  }, [editor.dirty, navigate, t]);

  const save = async () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.render(recipe); // đảm bảo không lưu khung "xem gốc"
    editor.save.mutate(await renderer.toBlob());
  };

  const revert = () => {
    if (!editor.hasSavedEdit) return editor.commit(DEFAULT_RECIPE);
    if (window.confirm(t("editor.revertConfirm"))) editor.revert.mutate(undefined);
  };

  const busy = editor.save.isPending || editor.revert.isPending;
  const failed = editor.status === "error" || glError;

  return (
    <div className="flex min-h-full flex-col gap-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-4">
      <header className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={leave} aria-label={t("editor.back")}>
          <ArrowLeft />
        </Button>
        <h1 className="mr-auto font-heading text-2xl">{t("editor.title")}</h1>
        <Button variant="ghost" size="icon-sm" onClick={undo} disabled={!canUndo} aria-label={t("editor.undo")} title={`${t("editor.undo")} (⌘Z)`}>
          <Undo2 />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={redo} disabled={!canRedo} aria-label={t("editor.redo")} title={`${t("editor.redo")} (⇧⌘Z)`}>
          <Redo2 />
        </Button>
        <Button
          variant={comparing ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label={t("editor.compare")}
          title={`${t("editor.compare")} (\\)`}
          disabled={!image}
          onPointerDown={() => setComparing(true)}
          onPointerUp={() => setComparing(false)}
          onPointerLeave={() => setComparing(false)}
        >
          <Eye />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={revert}
          disabled={busy || (!editor.hasSavedEdit && isNeutral(recipe))}
        >
          <RotateCcw data-icon="inline-start" />
          {t(editor.hasSavedEdit ? "editor.revertOriginal" : "editor.reset")}
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={busy || failed || !image || !editor.dirty}>
          {editor.save.isPending && <Loader2 className="animate-spin" data-icon="inline-start" />}
          {t(editor.save.isPending ? "editor.saving" : "editor.save")}
        </Button>
      </header>

      {(editor.save.isError || editor.revert.isError) && (
        <p className="text-sm text-destructive" role="alert">{t("editor.saveFailed")}</p>
      )}
      {editor.save.isSuccess && !editor.dirty && (
        <p className="text-sm text-muted-foreground" role="status">{t("editor.saved")}</p>
      )}

      <div className="flex flex-1 flex-col gap-6 md:flex-row">
        <div className="relative grid min-h-[40dvh] flex-1 place-items-center overflow-hidden rounded-2xl bg-muted/40">
          {failed ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {t(glError ? "editor.noWebgl" : "editor.loadFailed")}
            </p>
          ) : (
            !image && <Skeleton className="absolute inset-6 rounded-xl" />
          )}
          <canvas
            ref={canvasRef}
            className={image && !failed ? "max-h-[calc(100dvh-12rem)] max-w-full object-contain" : "hidden"}
            aria-label={t(comparing ? "editor.showingOriginal" : "editor.preview")}
          />
          {comparing && (
            <span className="glass-soft absolute top-3 left-3 rounded-full px-3 py-1 text-xs font-medium">
              {t("editor.showingOriginal")}
            </span>
          )}
        </div>

        <aside className="w-full shrink-0 md:w-72 md:overflow-y-auto">
          <AdjustPanel recipe={recipe} onPreview={editor.preview} onCommit={editor.commit} />
        </aside>
      </div>
    </div>
  );
}
