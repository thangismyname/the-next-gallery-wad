import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Sticker, X } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { createMomentMeme, fetchMemeTemplates } from "@/services/moments";
import { MomentMeme } from "@tng/shared";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  momentId: string;
  /** Gọi khi tạo thành công (kèm meme mới) — parent cập nhật list + count. */
  onCreated: (meme: MomentMeme) => void;
};

/** Số dòng chữ tối đa embed được vào meme. */
const MAX_TEXT_LINES = 3;

/**
 * Dialog thả meme: chọn template (memegen.link, có search) + nhập dòng chữ
 * + caption tùy chọn. Preview chữ được vẽ chồng lên ảnh gốc (xấp xỉ memegen:
 * dòng đầu trên, dòng cuối dưới, chữ trắng in hoa có outline).
 */
export const MemePickerDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  momentId,
  onCreated,
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>(["", ""]);
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    data: templates,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["meme", "templates"],
    queryFn: fetchMemeTemplates,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // Reset tất cả mỗi lần mở dialog.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelectedId(null);
    setLines(["", ""]);
    setCaption("");
    setError(null);
    setPosting(false);
  }, [open]);

  const selected = useMemo(
    () => templates?.find((x) => x.id === selectedId) ?? null,
    [templates, selectedId],
  );

  // Số dòng input theo template (memegen trả 1-5, giới hạn ở 3 dòng nhập).
  const lineCount = selected ? Math.min(selected.lines, MAX_TEXT_LINES) : 2;

  // Khi đổi template → resize mảng lines cho khớp.
  useEffect(() => {
    if (!selected) return;
    setLines((prev) => {
      const next = Array.from({ length: lineCount }, (_, i) => prev[i] ?? "");
      return next;
    });
  }, [selectedId, lineCount, selected]);

  const filtered = useMemo(() => {
    if (!templates) return [];
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (x) => x.name.toLowerCase().includes(q) || x.id.toLowerCase().includes(q),
    );
  }, [templates, search]);

  const canCreate = Boolean(selected) && !posting;

  // Chỉ render chữ preview ở vị trí theo memegen: dòng 0 trên, dòng cuối dưới,
  // các dòng giữa xếp giữa.
  const previewLines = selected
    ? lines.map((line, i) => ({
        text: line,
        position: i === 0 ? "top" : i === lineCount - 1 ? "bottom" : "middle",
      }))
    : [];

  const handleCreate = async () => {
    if (!canCreate || !selected) return;
    setPosting(true);
    setError(null);
    try {
      const meme = await createMomentMeme(momentId, {
        templateId: selected.id,
        lines: lines.filter((l) => l.trim().length > 0),
        caption: caption.trim() || undefined,
      });
      onCreated(meme);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPosting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sticker className="size-4" />
            {t("moments.memePick")}
          </DialogTitle>
          <DialogDescription>{t("moments.memePickDesc")}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

          {/* Preview meme đang chọn */}
          {selected && (
            <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl bg-muted ring-1 ring-border">
              <img
                src={selected.blankUrl}
                alt={selected.name}
                className="size-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
              <div className="absolute inset-0">
                {previewLines.map((line, i) => (
                  <p
                    key={i}
                    className={cn(
                      "absolute inset-x-2 wrap-break-word px-2 text-center text-sm font-black uppercase tracking-wide text-white",
                      "drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)] [-webkit-text-stroke:1.5px_black]",
                      line.position === "top" && "top-2",
                      line.position === "bottom" && "bottom-2",
                      line.position === "middle" && "top-1/2 -translate-y-1/2",
                    )}
                  >
                    {line.text || " "}
                  </p>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                aria-label={t("moments.close")}
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {/* Chọn template — search + grid thumb */}
          {!selected && (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("moments.memeSearch")}
                  className="pl-8"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {isPending ? (
                  Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton
                      key={i}
                      className="aspect-4/3 rounded-lg bg-muted/60"
                    />
                  ))
                ) : isError ? (
                  <div className="col-span-full flex flex-col items-center gap-2 py-6 text-xs text-muted-foreground">
                    <p>{t("moments.memeTemplateFailed")}</p>
                    <Button variant="ghost" size="sm" onClick={() => refetch()}>
                      {t("moments.retry")}
                    </Button>
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="col-span-full py-6 text-center text-xs text-muted-foreground">
                    {t("moments.memeSearchEmpty")}
                  </p>
                ) : (
                  filtered.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setSelectedId(template.id)}
                      className="group relative aspect-4/3 overflow-hidden rounded-lg bg-muted ring-1 ring-border transition hover:ring-primary/60"
                      title={template.name}
                    >
                      <img
                        src={template.blankUrl}
                        alt={template.name}
                        loading="lazy"
                        className="size-full object-contain transition group-hover:scale-[1.03]"
                        onError={(e) => {
                          e.currentTarget.parentElement!.classList.add(
                            "ring-destructive/40",
                          );
                        }}
                      />
                      <span className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1 text-[10px] font-medium text-white">
                        {template.name}
                      </span>
                    </button>
                  ))
                )}
              </div>

              {!isPending && (
                <p className="text-center text-[11px] text-muted-foreground">
                  {filtered.length > 0
                    ? t("moments.photoCount", { n: filtered.length })
                    : ""}
                </p>
              )}
            </>
          )}

          {/* Nhập dòng chữ + caption */}
          {selected && (
            <div className="space-y-2">
              {Array.from({ length: lineCount }).map((_, i) => (
                <Input
                  key={i}
                  value={lines[i] ?? ""}
                  onChange={(e) =>
                    setLines((prev) => {
                      const next = [...prev];
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                  maxLength={80}
                  placeholder={t("moments.memeTextPlaceholder", { n: i + 1 })}
                  className="font-semibold uppercase"
                />
              ))}
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={280}
                rows={2}
                placeholder={t("moments.memeCaptionPlaceholder")}
                className="min-h-0 rounded-md border-border px-3 py-2"
              />
              <p className="text-[11px] text-muted-foreground">
                {t("moments.memeTextOptional")}
              </p>
            </div>
          )}
        </DialogBody>

        <DialogFooter className="border-t border-border/50 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={posting}
          >
            {t("moments.cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate}>
            {posting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              t("moments.memeCreate")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
