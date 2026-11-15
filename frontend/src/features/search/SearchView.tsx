import React, { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GripHorizontal, Loader2, Search, X } from "lucide-react";
import { popIn } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AI_CHIP } from "@/lib/aiColors";
import { useDebounce } from "@/hooks/useDebounce";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useDraggablePanel } from "@/hooks/useDraggablePanel";
import { type Media, toMedia, type MediaListItem, type FriendSearchResult } from "@tng/shared";
import { Lightbox } from "@/features/gallery/components/Lightbox";
import { AlbumFormDialog } from "@/features/albums/components/AlbumFormDialog";
import { SearchBar } from "./components/SearchBar";
import { ScopeIcon } from "./components/ScopeIcon";
import { ScopeQuickPicks, ScopeSuggestions } from "./components/ScopeSuggestions";
import { SearchResults } from "./components/SearchResults";
import { sourceChipsFor } from "./searchScore";
import { useScopedQuery } from "./useScopedQuery";
import { useSearchScopes } from "./useSearchScopes";
import { useSpotlightSearch } from "./useSpotlightSearch";

interface SearchViewProps {
  open: boolean;
  onClose: () => void;
}

const PANEL_STORAGE_KEY = "tng.searchPanelSize";
const PANEL_POS_STORAGE_KEY = "tng.searchPanelPos";
const PANEL_DEFAULT_WIDTH = 672; // ~max-w-2xl
const PANEL_MIN_WIDTH = 380;
const PANEL_MIN_HEIGHT = 260;

export const SearchView: React.FC<SearchViewProps> = ({ open, onClose }) => {
  const scopes = useSearchScopes(open);
  // Ô tìm + chip phạm vi (Yêu thích / 1 nhãn / 1 album) + gợi ý "Tìm trong …".
  const input = useScopedQuery(scopes);
  const { query, scope, suggestions } = input;
  const debouncedQuery = useDebounce(query, 400);
  // 4 nguồn song song (bạn bè · album · ảnh · vật thể) — useSpotlightSearch.ts;
  // có phạm vi thì chỉ tìm ảnh trong phạm vi. Ô vừa trống (chọn chip / xoá) →
  // dùng ngay, không chờ debounce tìm chữ cũ.
  const { results, reset: resetResults } = useSpotlightSearch(
    query.trim() ? debouncedQuery : "",
    scope?.key,
  );
  const reduce = useReducedMotion();
  const { t } = useTranslation();
  const navigate = useNavigate();
  // "Lưu thành album thông minh" từ câu đang tìm (album tự cập nhật theo câu).
  const [savingQuery, setSavingQuery] = useState<string | null>(null);

  const openAlbum = (albumId: string) => {
    onClose();
    navigate(`/albums/${albumId}`);
  };

  const defaultPanelHeight =
    typeof window === "undefined" ? 480 : Math.round(window.innerHeight * 0.6);

  const {
    size: panelSize,
    shiftX,
    isResizing,
    startResize,
    reset,
  } = useResizablePanel({
    storageKey: PANEL_STORAGE_KEY,
    defaultWidth: PANEL_DEFAULT_WIDTH,
    defaultHeight: defaultPanelHeight,
    minWidth: PANEL_MIN_WIDTH,
    minHeight: PANEL_MIN_HEIGHT,
  });

  const { panelRef, pos, isDragging, startDrag, resetPos } = useDraggablePanel({
    storageKey: PANEL_POS_STORAGE_KEY,
  });

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, button, a, kbd, [data-no-drag]")) {
        return;
      }
      e.preventDefault();
      startDrag(e);
    },
    [startDrag],
  );

  const handleResetPanel = useCallback(() => {
    reset();
    resetPos();
  }, [reset, resetPos]);

  // Lightbox mở khi bấm 1 ảnh trong kết quả tìm kiếm (kèm điều hướng trong nhóm)
  const [lightbox, setLightbox] = useState<{
    list: Media[];
    index: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "unset";
    };
  }, [open, onClose]);

  const resetInput = input.reset;
  useEffect(() => {
    if (open) {
      resetInput();
      resetResults();
      setLightbox(null);
    }
  }, [open, resetInput, resetResults]);

  // Bạn bè → gửi ảnh; người lạ → trang Bạn bè với câu đang tìm.
  const handleFriend = useCallback(
    (friend: FriendSearchResult) => {
      navigate(
        friend.relationship === "friends"
          ? `/share?to=${encodeURIComponent(friend.id)}`
          : `/friends?q=${encodeURIComponent(query.trim())}`,
      );
      onClose();
    },
    [navigate, onClose, query],
  );

  const openLightbox = useCallback(
    (items: MediaListItem[], item: MediaListItem) => {
      if (items.length === 0) return;
      const index = Math.max(
        0,
        items.findIndex((m) => m.id === item.id),
      );
      setLightbox({ list: items.map(toMedia), index });
      onClose();
    },
    [onClose],
  );

  if (!open && !lightbox) return null;

  const hasResults =
    results.friends.length > 0 ||
    results.albums.length > 0 ||
    results.media.length > 0 ||
    results.objects.length > 0;

  const hasQuery = debouncedQuery.trim().length > 0 || scope !== null;

  // Chip nguồn AI ở đầu panel (searchScore.ts::sourceChipsFor).
  const sourceChips =
    hasQuery && !results.loading ? sourceChipsFor(results.media, results.objects) : [];

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={onClose}
          />

          <div
            ref={panelRef}
            className={cn(
              "relative flex flex-col max-w-[calc(100vw-2rem)] max-h-[calc(100vh-6rem)]",
              "glass rounded-2xl overflow-hidden",
              "animate-in zoom-in-95 duration-200",
              (isResizing || isDragging) && "select-none",
            )}
            style={{
              width: panelSize.width,
              height: panelSize.height,
              transform: `translate(${pos.x + shiftX}px, ${pos.y}px)`,
            }}
          >
            {/* Đầu panel = ô tìm kiếm mẫu ở landing: ô bên trái, chip nguồn AI
                bên phải (xuống dòng trên màn hẹp). Kéo ở vùng trống để di chuyển. */}
            <div
              className="flex cursor-move select-none flex-col gap-2 border-b border-border/60 p-3 sm:flex-row sm:items-center sm:gap-3"
              onPointerDown={handleHeaderPointerDown}
              title={t("search.dragHint")}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <GripHorizontal
                  className="h-4 w-4 shrink-0 cursor-grab touch-none text-muted-foreground/50"
                  aria-hidden
                />
                <SearchBar
                  value={query}
                  onChange={input.onChange}
                  onClear={() => {
                    input.setQuery("");
                    input.clearScope();
                  }}
                  inputRef={input.inputRef}
                  onKeyDown={input.onKeyDown}
                  prefix={
                    scope && (
                      <span className="flex max-w-[45%] shrink-0 items-center gap-1.5 rounded-full bg-muted py-0.5 pr-1 pl-2 text-xs font-medium dark:bg-white/10">
                        <ScopeIcon scope={scope} />
                        <span className="truncate">{scope.name}</span>
                        <button
                          type="button"
                          onClick={input.clearScope}
                          onMouseDown={(e) => e.preventDefault()}
                          aria-label={t("search.scope.remove")}
                          className="rounded-full p-0.5 text-muted-foreground hover:bg-background/60 hover:text-foreground"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    )
                  }
                  autoFocus
                  placeholder={scope ? t("search.scope.placeholder") : t("search.placeholder")}
                  className="flex-1 cursor-auto"
                />
              </div>
              {/* Mobile chưa có chip → ẩn cả hàng (ESC chỉ hiện từ sm) */}
              <div
                className={cn(
                  "flex shrink-0 flex-wrap items-center gap-1.5 text-[11px]",
                  sourceChips.length === 0 && "hidden sm:flex",
                )}
              >
                {sourceChips.map((chip, i) => (
                  <motion.span
                    key={chip.source}
                    {...popIn(i, reduce, 0.06)}
                    className={cn(
                      "rounded-full px-2 py-0.5 font-medium tabular-nums",
                      AI_CHIP[chip.source],
                    )}
                  >
                    {chip.label} · {chip.n}
                  </motion.span>
                ))}
                <kbd
                  onClick={onClose}
                  className="hidden h-5 cursor-pointer select-none items-center rounded-md bg-muted/70 px-1.5 font-mono text-[10px] text-muted-foreground hover:bg-muted sm:inline-flex"
                >
                  ESC
                </kbd>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              {suggestions.length > 0 && (
                <ScopeSuggestions
                  suggestions={suggestions}
                  active={input.activeSuggestion}
                  onHover={input.hover}
                  onPick={(s) => input.pickScope(s)}
                />
              )}

              {results.loading && (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  {t("search.searching")}
                </div>
              )}

              {!results.loading && results.error && (
                <div className="text-center py-10 text-destructive text-sm">
                  {results.error}
                </div>
              )}

              {!results.loading &&
                hasQuery &&
                !hasResults &&
                !results.error && (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <Search className="h-6 w-6 mb-2" />
                    <span className="text-sm">{t("search.noResults")}</span>
                  </div>
                )}

              {!results.loading && hasResults && (
                <SearchResults
                  results={results}
                  scopeName={scope?.name ?? null}
                  onFriend={handleFriend}
                  onAlbum={openAlbum}
                  onMedia={openLightbox}
                  // Album thông minh chỉ lưu được câu tìm, không lưu phạm vi
                  onSaveQuery={scope ? undefined : () => setSavingQuery(debouncedQuery.trim())}
                />
              )}

              {!hasQuery && !results.loading && suggestions.length === 0 && (
                <ScopeQuickPicks scopes={scopes} onPick={(s) => input.pickScope(s)} />
              )}
            </div>

            <span
              aria-hidden
              className="pointer-events-none absolute bottom-1 right-4 z-10 select-none text-[10px] leading-none text-muted-foreground/50"
            >
              {t("search.resetHint")}
            </span>

            <button
              type="button"
              aria-label={t("search.resizeHandle")}
              title={t("search.resizeHandle")}
              onPointerDown={startResize}
              onDoubleClick={handleResetPanel}
              className={cn(
                "absolute bottom-0 right-0 z-10 h-4 w-4 touch-none select-none",
                "cursor-nwse-resize rounded-br-xl text-muted-foreground/50",
                "hover:text-foreground transition-colors",
              )}
            >
              <svg viewBox="0 0 16 16" className="h-full w-full" fill="none">
                <path
                  d="M14 6 L6 14 M14 10 L10 14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      <AlbumFormDialog
        open={savingQuery !== null}
        onOpenChange={(next) => !next && setSavingQuery(null)}
        initial={{
          name: savingQuery ?? "",
          smartRule: { type: "query", query: savingQuery ?? "" },
        }}
        onSaved={(album) => openAlbum(album.id)}
      />

      {lightbox && (
        <Lightbox
          media={lightbox.list[lightbox.index]}
          mediaList={lightbox.list}
          onClose={() => setLightbox(null)}
          onPrev={
            lightbox.index > 0
              ? () => setLightbox((s) => (s ? { ...s, index: s.index - 1 } : s))
              : undefined
          }
          onNext={
            lightbox.index < lightbox.list.length - 1
              ? () => setLightbox((s) => (s ? { ...s, index: s.index + 1 } : s))
              : undefined
          }
        />
      )}
    </>
  );
};
