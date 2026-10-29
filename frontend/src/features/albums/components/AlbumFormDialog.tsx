import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SettingOptionGroup } from "@/features/settings/components/SettingOptionGroup";
import {
  type Album,
  type SmartRule,
  albumsQueryKey,
  createAlbum,
  updateAlbum,
} from "@/services/albums";
import { isSmartRuleValid } from "../albumRules";
import { SmartRuleFields } from "./SmartRuleFields";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Có → sửa album này; không → tạo mới. */
  album?: Album;
  /** Giá trị ban đầu khi tạo (vd tạo từ kết quả search / tag / ảnh đang chọn). */
  initial?: { name?: string; smartRule?: SmartRule; mediaIds?: string[] };
  onSaved?: (album: Album) => void;
};

const EMPTY_RULE: SmartRule = { type: "tags", tags: [], minConfidence: null };

/** Tạo / sửa album: tên, mô tả, loại (thường / thông minh) + truy vấn. */
export const AlbumFormDialog: React.FC<Props> = (props) => {
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => !saving && props.onOpenChange(next)}
    >
      <DialogContent className="sm:max-w-lg">
        {/* Mount lại mỗi lần mở → form nạp giá trị mới từ album / initial. */}
        {props.open && (
          <AlbumForm {...props} saving={saving} setSaving={setSaving} />
        )}
      </DialogContent>
    </Dialog>
  );
};

function AlbumForm({
  onOpenChange,
  album,
  initial,
  onSaved,
  saving,
  setSaving,
}: Props & { saving: boolean; setSaving: (saving: boolean) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const startRule = album?.smartRule ?? initial?.smartRule ?? null;
  const [name, setName] = useState(album?.name ?? initial?.name ?? "");
  const [description, setDescription] = useState(album?.description ?? "");
  const [kind, setKind] = useState<Album["kind"]>(
    album?.kind ?? (startRule ? "smart" : "manual"),
  );
  const [rule, setRule] = useState<SmartRule>(startRule ?? EMPTY_RULE);
  const [error, setError] = useState<string | null>(null);

  const smart = kind === "smart";
  const canSave = name.trim().length > 0 && (!smart || isSmartRuleValid(rule));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = album
        ? await updateAlbum(album.id, {
            name: name.trim(),
            description: description.trim() || null,
            ...(album.kind === "smart" ? { smartRule: rule } : {}),
          })
        : await createAlbum({
            name: name.trim(),
            description: description.trim() || undefined,
            ...(smart
              ? { smartRule: rule }
              : { mediaIds: initial?.mediaIds ?? [] }),
          });
      await queryClient.invalidateQueries({ queryKey: albumsQueryKey });
      onOpenChange(false);
      onSaved?.(saved);
    } catch (err) {
      setError((err as Error).message || t("albums.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>
          {album ? t("albums.editTitle") : t("albums.createTitle")}
        </DialogTitle>
        <DialogDescription>
          {smart ? t("albums.smart.desc") : t("albums.createDesc")}
        </DialogDescription>
      </DialogHeader>

      {!album && !initial?.mediaIds?.length && (
        <SettingOptionGroup<Album["kind"]>
          label={t("albums.kind")}
          value={kind}
          onChange={setKind}
          options={[
            { value: "manual", label: t("albums.kindManual") },
            { value: "smart", label: t("albums.kindSmart") },
          ]}
        />
      )}

      <div className="space-y-2">
        <Label htmlFor="album-name">{t("albums.name")}</Label>
        <Input
          id="album-name"
          autoFocus
          maxLength={255}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("albums.namePlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="album-desc">{t("albums.description")}</Label>
        <Textarea
          id="album-desc"
          rows={2}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {smart && <SmartRuleFields value={rule} onChange={setRule} />}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!canSave || saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {album ? t("albums.save") : t("albums.create")}
        </Button>
      </DialogFooter>
    </form>
  );
}
