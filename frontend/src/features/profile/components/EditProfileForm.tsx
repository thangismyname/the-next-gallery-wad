import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/services/authClient";
import { getInitials } from "@/utils/string";
import { AvatarPickerDialog } from "./AvatarPickerDialog";
import { FormStatus, FormStatusMessage } from "./FormStatusMessage";

type Props = {
  name: string;
  email: string;
  image?: string | null;
  /** Gọi sau khi lưu thành công — làm mới session để header cập nhật. */
  onSaved: () => void;
};

const NAME_MAX = 64;

/** Sửa tên hiển thị + ảnh đại diện (Better Auth `updateUser`). Email chỉ xem. */
export const EditProfileForm: React.FC<Props> = ({
  name,
  email,
  image,
  onSaved,
}) => {
  const { t } = useTranslation();
  const [draftName, setDraftName] = useState(name);
  const [draftImage, setDraftImage] = useState<string | null>(image ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<FormStatus>(null);

  // Session đổi (vd. lưu xong, refetch) → đồng bộ lại bản nháp.
  useEffect(() => {
    setDraftName(name);
    setDraftImage(image ?? null);
  }, [name, image]);

  const trimmed = draftName.trim();
  const dirty = trimmed !== name || (draftImage ?? null) !== (image ?? null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || !dirty || saving) return;
    setSaving(true);
    setStatus(null);
    const { error } = await authClient.updateUser({
      name: trimmed,
      // Better Auth: null = xoá ảnh đại diện.
      image: draftImage,
    });
    setSaving(false);
    if (error) {
      setStatus({
        type: "error",
        message: error.message || t("profile.saveFailed"),
      });
      return;
    }
    setStatus({ type: "success", message: t("profile.saved") });
    onSaved();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.infoTitle")}</CardTitle>
        <CardDescription>{t("profile.infoDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Ảnh đại diện */}
          <div className="flex items-center gap-4">
            <Avatar className="size-16 text-lg">
              {draftImage ? (
                <AvatarImage src={draftImage} alt={trimmed} />
              ) : null}
              <AvatarFallback>{getInitials(trimmed || name)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPickerOpen(true)}
              >
                <ImagePlus className="size-4" />
                {t("profile.avatarChoose")}
              </Button>
              {draftImage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraftImage(null)}
                >
                  <X className="size-4" />
                  {t("profile.avatarRemove")}
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-name">{t("profile.name")}</Label>
            <Input
              id="profile-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={NAME_MAX}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-email">{t("profile.email")}</Label>
            <Input id="profile-email" value={email} disabled readOnly />
            <p className="text-xs text-muted-foreground">
              {t("profile.emailHint")}
            </p>
          </div>

          <FormStatusMessage status={status} />

          <div className="flex justify-end gap-2">
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraftName(name);
                  setDraftImage(image ?? null);
                  setStatus(null);
                }}
                disabled={saving}
              >
                {t("profile.reset")}
              </Button>
            )}
            <Button type="submit" disabled={!dirty || !trimmed || saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {t("profile.save")}
            </Button>
          </div>
        </form>
      </CardContent>

      <AvatarPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(url) => setDraftImage(url)}
      />
    </Card>
  );
};
