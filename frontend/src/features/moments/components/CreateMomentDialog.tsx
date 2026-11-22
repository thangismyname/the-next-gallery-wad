import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Lock, Loader2, Users } from "lucide-react";
import { ResizableDialogContent } from "@/components/ResizableDialogContent";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MediaPicker } from "@/features/media-picker/MediaPicker";
import { Moment, MomentVisibility } from "@tng/shared";
import { cn } from "@/lib/utils";
import { MomentTemplatePicker } from "./MomentTemplatePicker";
import { MomentFriendPicker } from "./MomentFriendPicker";
import { MomentFramer } from "./MomentFramer";
import { useMomentDraft } from "../useMomentDraft";

const VISIBILITIES: { value: MomentVisibility; icon: React.ElementType; labelKey: string }[] = [
  { value: "circle", icon: Users, labelKey: "moments.visibilityCircle" },
  { value: "private", icon: Lock, labelKey: "moments.visibilityPrivate" },
];

/** 1 mục của form: nhãn nhỏ + chú thích phải (đếm, số bạn…) + nội dung. */
const Section: React.FC<{ title: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  hint,
  children,
}) => (
  <section className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {hint !== undefined && (
        <span className="flex items-center gap-1 text-xs font-medium tabular-nums text-muted-foreground">{hint}</span>
      )}
    </div>
    {children}
  </section>
);

const momentDialogHeight = () => (typeof window === "undefined" ? 720 : Math.min(820, Math.round(window.innerHeight * 0.88)));

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  /** Draft moment collab chưa đủ slot — mở ở chế độ chỉnh sửa (quay lại edit). */
  editMoment?: Moment | null;
};


export const CreateMomentDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  onCreated,
  editMoment,
}) => {
  const { t } = useTranslation();
  // Template · ảnh · bạn · caption · gửi (useMomentDraft.ts).
  const {
    isEditing,
    template,
    setTemplate,
    mode,
    setMode,
    selectedIds,
    setSelectedIds,
    friendIds,
    setFriendIds,
    caption,
    setCaption,
    visibility,
    setVisibility,
    posting,
    error,
    slotCount,
    isCollabTemplate,
    photoLimit,
    maxFriendCount,
    reset,
    toggleMedia,
    toggleFriend,
    framedPhotos,
    framerLayout,
    framings,
    setFraming,
    moveCell,
    canPost,
    handlePost,
  } = useMomentDraft({
    open,
    editMoment,
    onCreated,
    onClose: () => onOpenChange(false),
  });
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const collab = isCollabTemplate && mode === "collab";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Kéo header / đổi cỡ ở góc như Spotlight — lưới ảnh cao theo dialog (--panel-h). */}
      <ResizableDialogContent storageKey="tng.momentCreate" defaultWidth={560} defaultHeight={momentDialogHeight}>
        <DialogHeader data-drag-handle className="pb-4" title={t("search.dragHint")}>
          <DialogTitle>
            {isEditing ? t("moments.editDraft") : t("moments.newMoment")}
          </DialogTitle>
          <DialogDescription>{t("moments.createDesc")}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
          )}

          {/* Bố cục (template) + chế độ (edit chỉ cho template ghép nhiều ảnh) */}
          <Section title={t("moments.sectionLayout")}>
            <MomentTemplatePicker
              template={template}
              onTemplateChange={(value) => {
                setTemplate(value);
                setSelectedIds([]);
              }}
              mode={mode}
              onModeChange={(value) => {
                setMode(value);
                if (value === "self") setFriendIds([]);
              }}
              isEditing={isEditing}
            />
          </Section>

          {collab && (
            <Section
              title={t("moments.sectionFriends")}
              hint={
                <>
                  <Users className="size-3.5" />
                  {friendIds.length}/{maxFriendCount}
                </>
              }
            >
              <MomentFriendPicker selectedIds={friendIds} max={maxFriendCount} onToggle={toggleFriend} />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("moments.collabHint")}
                {maxFriendCount > 1 && ` ${t("moments.collabSplitHint")}`}
              </p>
            </Section>
          )}

          <Section
            title={
              collab
                ? t("moments.yourPhotoSlots", { min: 1, max: photoLimit, total: slotCount })
                : t("moments.sectionPhotos")
            }
            hint={
              <span className={cn(selectedIds.length < photoLimit && isCollabTemplate ? "text-amber-500" : "text-primary")}>
                {selectedIds.length}/{photoLimit}
              </span>
            }
          >
            <MediaPicker
              selectedIds={selectedIdSet}
              max={photoLimit}
              showCount={false}
              gridClassName="h-[max(16rem,calc(var(--panel-h)*0.55))]"
              onToggle={toggleMedia}
            />
          </Section>

          {/* Chọn xong → căn khung từng ảnh + đổi chỗ; chỉ chốt khi bấm Đăng. */}
          {framedPhotos.length > 0 && (
            <Section title={t("moments.framer.title")}>
              <MomentFramer
                photos={framedPhotos}
                layout={framerLayout}
                framings={framings}
                onFrame={setFraming}
                canPlace={(slot) => slot >= 0 && slot < slotCount}
                onMove={moveCell}
              />
            </Section>
          )}

          <Section title={t("moments.sectionCaption")} hint={`${caption.length}/280`}>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={280}
              rows={2}
              placeholder={t("moments.captionPlaceholder")}
              className="min-h-0 rounded-md border-border px-3 py-2"
            />
          </Section>

          <Section title={t("moments.visibility")}>
            <div role="radiogroup" className="grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-1">
              {VISIBILITIES.map(({ value, icon: Icon, labelKey }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={visibility === value}
                  onClick={() => setVisibility(value)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition",
                    visibility === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </Section>
        </DialogBody>

        <DialogFooter className="border-t border-border/50 pt-4">
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            disabled={posting}
          >
            {t("moments.cancel")}
          </Button>
          <Button onClick={handlePost} disabled={!canPost || posting}>
            {posting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isEditing ? (
              t("moments.saveChanges")
            ) : (
              t("moments.post")
            )}
          </Button>
        </DialogFooter>
      </ResizableDialogContent>
    </Dialog>
  );
};
