import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Redo2, RotateCcw, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdjustPanel } from "./components/AdjustPanel";
import { EditRenderer } from "./engine/renderer";
import { DEFAULT_RECIPE, isNeutral } from "./recipe";
import { useEditor } from "./useEditor";

/**
 * /edit/:id — basic edit không phá huỷ: WebGL2 vẽ lại ngay khi kéo thanh trượt,
 * "Lưu" gửi công thức + ảnh đã render (backend giữ nguyên file gốc).
 * Giữ trên ảnh (hoặc phím \) = xem ảnh gốc. ⌘/Ctrl+Z · ⇧⌘/Ctrl+Z = undo / redo.
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
    // Toàn màn hình, nền tối như Apple Photos (ngoài MainLayout — xem AppRoutes).
    <div className="dark fixed inset-0 z-40 flex flex-col bg-black pt-[env(safe-area-inset-top)] text-foreground">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2">
        <Button variant="ghost" size="sm" className="justify-self-start" onClick={leave}>
          <X data-icon="inline-start" />
          {t("editor.cancel")}
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={undo} disabled={!canUndo} aria-label={t("editor.undo")} title={`${t("editor.undo")} (⌘Z)`}>
            <Undo2 />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={redo} disabled={!canRedo} aria-label={t("editor.redo")} title={`${t("editor.redo")} (⇧⌘Z)`}>
            <Redo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={revert}
            disabled={busy || (!editor.hasSavedEdit && isNeutral(recipe))}
            aria-label={t(editor.hasSavedEdit ? "editor.revertOriginal" : "editor.reset")}
            title={t(editor.hasSavedEdit ? "editor.revertOriginal" : "editor.reset")}
          >
            <RotateCcw />
          </Button>
        </div>
        <Button
          size="sm"
          className="justify-self-end"
          onClick={() => void save()}
          disabled={busy || failed || !image || !editor.dirty}
        >
          {editor.save.isPending && <Loader2 className="animate-spin" data-icon="inline-start" />}
          {t(editor.save.isPending ? "editor.saving" : "editor.save")}
        </Button>
      </header>

      {/* Giữ (chuột / chạm) trên ảnh = xem ảnh gốc */}
      <div
        className="relative mx-3 min-h-0 flex-1 touch-none select-none"
        onPointerDown={() => image && setComparing(true)}
        onPointerUp={() => setComparing(false)}
        onPointerLeave={() => setComparing(false)}
        onPointerCancel={() => setComparing(false)}
        title={t("editor.compare")}
      >
        {failed ? (
          <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
            {t(glError ? "editor.noWebgl" : "editor.loadFailed")}
          </p>
        ) : (
          !image && <Skeleton className="absolute inset-6 rounded-xl" />
        )}
        <canvas
          ref={canvasRef}
          className={image && !failed ? "absolute inset-0 m-auto max-h-full max-w-full" : "hidden"}
          aria-label={t(comparing ? "editor.showingOriginal" : "editor.preview")}
        />
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          {comparing ? (
            <span className="glass-soft rounded-full px-3 py-1 text-xs font-medium">{t("editor.showingOriginal")}</span>
          ) : editor.save.isError || editor.revert.isError ? (
            <span className="rounded-full bg-destructive px-3 py-1 text-xs font-medium text-white" role="alert">
              {t("editor.saveFailed")}
            </span>
          ) : (
            editor.save.isSuccess &&
            !editor.dirty && (
              <span className="glass-soft rounded-full px-3 py-1 text-xs" role="status">{t("editor.saved")}</span>
            )
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <AdjustPanel recipe={recipe} onPreview={editor.preview} onCommit={editor.commit} />
      </div>
    </div>
  );
}
