import { useTranslation } from "react-i18next";
import { Loader2, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MediaPicker } from "@/features/gallery/components/MediaPicker";
import { Moment, MomentVisibility } from "@/types";
import { cn } from "@/lib/utils";
import { MomentTemplatePicker } from "./MomentTemplatePicker";
import { MomentFriendPicker } from "./MomentFriendPicker";
import { useMomentDraft } from "../useMomentDraft";

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
    canPost,
    handlePost,
  } = useMomentDraft({
    open,
    editMoment,
    onCreated,
    onClose: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("moments.editDraft") : t("moments.newMoment")}
          </DialogTitle>
          <DialogDescription>{t("moments.selectTemplate")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* Bước 1 + 2 — Template + chế độ (edit mode chỉ cho template ghép nhiều ảnh) */}
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

          {/* Chọn bạn bè (chế độ collab) */}
          {isCollabTemplate && mode === "collab" && (
            <MomentFriendPicker
              selectedIds={friendIds}
              max={maxFriendCount}
              onToggle={toggleFriend}
            />
          )}

          {/* Bước 3 — Picker ảnh */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <p className="text-muted-foreground">
                {isCollabTemplate && mode === "collab"
                  ? t("moments.yourPhotoSlots", {
                      min: 1,
                      max: photoLimit,
                      total: slotCount,
                    })
                  : t("moments.selectPhoto")}
              </p>
              <p
                className={cn(
                  "font-medium",
                  isCollabTemplate &&
                    selectedIds.length < photoLimit
                    ? "text-amber-500"
                    : "text-primary",
                )}
              >
                {selectedIds.length}/{photoLimit}
              </p>
            </div>
            <MediaPicker
              selectedIds={new Set(selectedIds)}
              onToggle={(item) => toggleMedia(item.id)}
            />
          </div>

          {/* Caption */}
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={280}
            rows={2}
            placeholder={t("moments.captionPlaceholder")}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />

          {/* Visibility */}
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {t("moments.visibility")}
            </span>
            <select
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as MomentVisibility)
              }
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="circle">{t("moments.visibilityCircle")}</option>
              <option value="public">{t("moments.visibilityPublic")}</option>
              <option value="private">{t("moments.visibilityPrivate")}</option>
            </select>
          </label>

          {/* Ghi chú chế độ collab */}
          {isCollabTemplate && mode === "collab" && (
            <div className="space-y-1">
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <Users className="mt-0.5 size-3.5 shrink-0 text-primary" />
                {t("moments.collabHint")}
              </p>
              {maxFriendCount > 1 && (
                <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                  {t("moments.collabSplitHint")}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
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
      </DialogContent>
    </Dialog>
  );
};