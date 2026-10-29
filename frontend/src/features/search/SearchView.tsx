import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { popIn } from "@/lib/motion";
import { SearchBar } from "./components/SearchBar";
import { useDebounce } from "@/hooks/useDebounce";
import { toMedia, MediaListItem } from "@/services/media";
import { useSpotlightSearch } from "@/hooks/useSpotlightSearch";
import { useGalleryActionsStore } from "@/hooks/useGalleryActionsStore";
import {
  Loader2,
  Search,
  User,
  Image,
  FolderOpen,
  Boxes,
  GripHorizontal,
  Sparkles,
  Heart,
  Wand2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { AI_BAR, AI_CHIP } from "@/lib/aiColors";
import {
  describeScoreParts,
  presentScoreParts,
  SCORE_SOURCE,
  sourceChipsFor,
} from "./searchScore";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Lightbox } from "@/features/gallery/components/Lightbox";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useDraggablePanel } from "@/hooks/useDraggablePanel";
import { Media } from "@/types";
import { useNavigate } from "react-router-dom";
import { AlbumFormDialog } from "@/features/albums/components/AlbumFormDialog";
import { LABEL_DOT } from "@/features/favorites/labelColors";
import { parseScopedQuery, suggestScopes, type SearchScope } from "./searchScope";
import { useSearchScopes } from "./useSearchScopes";

/** Icon của 1 phạm vi tìm kiếm (Yêu thích / nhãn / album / ảnh đã sửa). */
const ScopeIcon: React.FC<{ scope: SearchScope; className?: string }> = ({ scope, className }) => {
  if (scope.kind === "favorites") return <Heart className={cn("size-3.5 text-rose-500", className)} />;
  if (scope.kind === "album") return <FolderOpen className={cn("size-3.5", className)} />;
  if (scope.kind === "edited") return <Wand2 className={cn("size-3.5", className)} />;
  return (
    <span className={cn("size-2 shrink-0 rounded-full", scope.color && LABEL_DOT[scope.color])} />
  );
};

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
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 400);
  // Phạm vi (chip trong ô search): chỉ tìm trong Yêu thích / 1 nhãn / 1 album.
  const [scope, setScope] = useState<SearchScope | null>(null);
  const scopes = useSearchScopes(open);
  // 4 nguồn song song (bạn bè · album · ảnh · vật thể) — hooks/useSpotlightSearch;
  // có phạm vi thì chỉ tìm ảnh trong phạm vi.
  // Ô vừa trống (chọn chip / xoá) → dùng ngay, không chờ debounce tìm chữ cũ.
  const { results, reset: resetResults } = useSpotlightSearch(
    query.trim() ? debouncedQuery : "",
    scope?.key,
  );
  // Gõ "fav", "in ảnh"… → gợi ý "Tìm trong …" (Tab / Enter chọn gợi ý đầu).
  const suggestions = scope ? [] : suggestScopes(query, scopes);
  // ↑ / ↓ chuyển gợi ý đang chọn (bỏ qua mục "Sắp có"); gõ chữ → về gợi ý đầu.
  const selectable = suggestions.filter((s) => !s.disabled);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSuggestion = selectable[Math.min(activeIndex, selectable.length - 1)];

  // Chèn / gỡ chip (hoặc bấm chuột vào gợi ý) → con trỏ về lại cuối ô nhập
  // để gõ tiếp liền mạch.
  const inputRef = useRef<HTMLInputElement>(null);
  const refocusInput = () =>
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });

  // Chữ vừa "đổi" thành chip (vd "fav"). Bộ gõ tiếng Việt chốt chữ đang gõ
  // dở khi bấm Tab → chèn lại chữ đó ngay sau khi đã xoá; bỏ qua lần chèn này.
  const consumedRef = useRef<{ text: string; until: number } | null>(null);

  const pickScope = (next: SearchScope, rest = "") => {
    if (next.disabled) return;
    consumedRef.current = { text: query, until: performance.now() + 300 };
    setScope(next);
    setQuery(rest);
    refocusInput();
  };

  const clearScope = () => {
    setScope(null);
    refocusInput();
  };

  // Cú pháp tắt "favorite.dog" → chip Yêu thích + "dog".
  const handleQueryChange = (value: string) => {
    setActiveIndex(0);
    const consumed = consumedRef.current;
    if (consumed && performance.now() < consumed.until && value.trim() === consumed.text.trim()) {
      consumedRef.current = null;
      setQuery("");
      return;
    }
    const parsed = scope ? null : parseScopedQuery(value, scopes);
    if (parsed) pickScope(parsed.scope, parsed.rest);
    else setQuery(value);
  };

  const handleQueryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && selectable.length > 0) {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      const current = Math.min(activeIndex, selectable.length - 1);
      setActiveIndex((current + step + selectable.length) % selectable.length);
    } else if ((e.key === "Tab" || e.key === "Enter") && !e.shiftKey && activeSuggestion) {
      e.preventDefault();
      pickScope(activeSuggestion);
    } else if (e.key === "Backspace" && scope && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
      e.preventDefault();
      clearScope();
    }
  };
  const reduce = useReducedMotion();
  const openShare = useGalleryActionsStore((s) => s.openShare);
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

  useEffect(() => {
    if (open) {
      setQuery("");
      setScope(null);
      resetResults();
      setLightbox(null);
    }
  }, [open, resetResults]);

  const handleSendToFriend = useCallback(
    (friendId: string) => {
      openShare([], { friendId });
      onClose();
    },
    [openShare, onClose],
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
                  onChange={handleQueryChange}
                  onClear={() => {
                    setQuery("");
                    clearScope();
                  }}
                  inputRef={inputRef}
                  onKeyDown={handleQueryKeyDown}
                  prefix={
                    scope && (
                      <span className="flex max-w-[45%] shrink-0 items-center gap-1.5 rounded-full bg-muted py-0.5 pr-1 pl-2 text-xs font-medium dark:bg-white/10">
                        <ScopeIcon scope={scope} />
                        <span className="truncate">{scope.name}</span>
                        <button
                          type="button"
                          onClick={clearScope}
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
                <div className="mb-4">
                  <div className="mb-2 px-1 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                    {t("search.scope.searchIn")}
                  </div>
                  <div className="space-y-0.5">
                    {suggestions.map((s) => (
                      <button
                        key={s.key}
                        onMouseEnter={() => !s.disabled && setActiveIndex(selectable.indexOf(s))}
                        aria-selected={s === activeSuggestion}
                        type="button"
                        disabled={s.disabled}
                        onClick={() => pickScope(s)}
                        onMouseDown={(e) => e.preventDefault()}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg p-2 text-left text-sm transition-colors",
                          s.disabled ? "cursor-not-allowed opacity-50" : "hover:bg-accent/50",
                          s === activeSuggestion && "bg-accent/60",
                        )}
                      >
                        <span className="flex size-6 items-center justify-center">
                          <ScopeIcon scope={s} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{s.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.disabled ? t("search.scope.soon") : t(`search.scope.kind.${s.kind}`)}
                        </span>
                        {s === activeSuggestion && (
                          <kbd className="hidden h-5 items-center rounded-md bg-muted/70 px-1.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
                            Tab
                          </kbd>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
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
                <div className="space-y-4">
                  {results.friends.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                          {t("search.friendResults")} ({results.friends.length})
                        </span>
                      </div>
                      <div className="space-y-1">
                        {results.friends.map((item) => (
                          <button
                            key={item.user.id}
                            onClick={() => handleSendToFriend(item.user.id)}
                            className={cn(
                              "w-full flex items-center gap-3 p-2 rounded-lg",
                              "hover:bg-accent/50 transition-colors text-left",
                            )}
                          >
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarImage
                                src={item.user.avatar_url ?? undefined}
                              />
                              <AvatarFallback className="text-xs">
                                {item.user.name?.charAt(0)?.toUpperCase() ??
                                  "?"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {item.user.name}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {item.user.email}
                              </div>
                            </div>
                            <span className="text-xs text-primary shrink-0">
                              {t("search.sendToFriend")}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {results.albums.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                          {t("search.albumResults")} ({results.albums.length})
                        </span>
                      </div>
                      <div className="space-y-1">
                        {results.albums.map((album) => (
                          <button
                            key={album.id}
                            type="button"
                            onClick={() => openAlbum(album.id)}
                            className="flex w-full items-center gap-3 p-2 rounded-lg text-left hover:bg-accent/50 transition-colors"
                          >
                            {album.coverUrl ? (
                              <img
                                src={album.coverUrl}
                                alt={album.name}
                                className="h-10 w-10 rounded object-cover shrink-0"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {album.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {album.mediaCount} {t("search.photos")}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {results.media.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <Image className="h-3.5 w-3.5 text-sky-500" />
                        <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                          {scope
                            ? t("search.scope.results", { name: scope.name })
                            : t("search.mediaResults")}{" "}
                          ({results.media.length})
                        </span>
                        {/* Album thông minh chỉ lưu được câu tìm, không lưu phạm vi */}
                        {!scope && (
                          <button
                            type="button"
                            onClick={() => setSavingQuery(debouncedQuery.trim())}
                            className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-primary hover:bg-primary/10"
                          >
                            <Sparkles className="h-3 w-3" />
                            {t("albums.saveSearch")}
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {results.media.map((item) => (
                          <button
                            key={item.id}
                            className="relative aspect-square rounded-md overflow-hidden group focus:outline-none focus:ring-2 focus:ring-ring"
                            data-media-id={item.id}
                            onClick={() => openLightbox(results.media, item)}
                            title={describeScoreParts(item.scoreParts)}
                          >
                            <img
                              src={item.thumbnailUrl}
                              alt={item.title ?? ""}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                            {typeof item.score === "number" && (
                              <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                {Math.round(item.score * 100)}%
                              </span>
                            )}
                            {/* Nguồn góp điểm (CLIP / Tag / YOLO) — chi tiết ở tooltip */}
                            {item.scoreParts && (
                              <span className="absolute top-1 right-1 flex gap-0.5 rounded-full bg-black/50 p-1">
                                {presentScoreParts(item.scoreParts).map((k) => (
                                    <span
                                      key={k}
                                      className={cn("size-1.5 rounded-full", AI_BAR[SCORE_SOURCE[k]])}
                                    />
                                  ))}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {results.objects.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <Boxes className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                          {t("search.objectResults")} ({results.objects.length})
                        </span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {results.objects.map((item) => (
                          <button
                            key={item.id}
                            className="relative aspect-square rounded-md overflow-hidden group focus:outline-none focus:ring-2 focus:ring-ring"
                            data-media-id={item.id}
                            onClick={() => openLightbox(results.objects, item)}
                          >
                            <img
                              src={item.thumbnailUrl}
                              alt={item.title ?? ""}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                            {typeof item.score === "number" && (
                              <span className="absolute bottom-1 left-1 rounded bg-emerald-400 px-1.5 py-0.5 text-[10px] font-medium text-black">
                                {Math.round(item.score * 100)}%
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!hasQuery && !results.loading && suggestions.length === 0 && (
                <div className="flex flex-col items-center gap-4 py-10 text-center text-sm text-muted-foreground">
                  <p>{t("search.hint")}</p>
                  {/* Chọn nhanh phạm vi — Yêu thích + nhãn (album: gõ tên) */}
                  <div className="flex max-w-md flex-wrap justify-center gap-1.5">
                    {scopes
                      .filter((s) => s.kind !== "album")
                      .map((s) => (
                        <button
                          key={s.key}
                          type="button"
                          disabled={s.disabled}
                          onClick={() => pickScope(s)}
                        onMouseDown={(e) => e.preventDefault()}
                          title={s.disabled ? t("search.scope.soon") : undefined}
                          className={cn(
                            "inline-flex h-7 items-center gap-1.5 rounded-full border border-border/60 px-2.5 text-xs transition-colors",
                            s.disabled
                              ? "cursor-not-allowed opacity-50"
                              : "hover:border-border hover:text-foreground",
                          )}
                        >
                          <ScopeIcon scope={s} />
                          {s.name}
                          {s.disabled && (
                            <span className="font-mono text-[9px] tracking-widest uppercase">
                              {t("search.scope.soon")}
                            </span>
                          )}
                        </button>
                      ))}
                  </div>
                </div>
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
