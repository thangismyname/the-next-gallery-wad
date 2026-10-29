import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/features/auth/components/PasswordInput";
import { authClient } from "@/services/authClient";
import { FormStatus, FormStatusMessage } from "./FormStatusMessage";

const MIN_LENGTH = 8;

/**
 * Đổi mật khẩu (Better Auth `changePassword`) — chỉ hiện với tài khoản có
 * đăng nhập bằng email/mật khẩu. Tuỳ chọn đăng xuất các thiết bị khác.
 */
export const ChangePasswordForm: React.FC = () => {
  const { t } = useTranslation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<FormStatus>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (next !== confirm) {
      setStatus({ type: "error", message: t("auth.passwordMismatch") });
      return;
    }
    setSaving(true);
    setStatus(null);
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: revokeOthers,
    });
    setSaving(false);
    if (error) {
      setStatus({
        type: "error",
        message: error.message || t("profile.passwordFailed"),
      });
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setStatus({ type: "success", message: t("profile.passwordChanged") });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.passwordTitle")}</CardTitle>
        <CardDescription>{t("profile.passwordDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">
              {t("profile.currentPassword")}
            </Label>
            <PasswordInput
              id="current-password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">{t("auth.newPassword")}</Label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              required
              minLength={MIN_LENGTH}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">
              {t("auth.confirmPassword")}
            </Label>
            <PasswordInput
              id="confirm-new-password"
              autoComplete="new-password"
              required
              minLength={MIN_LENGTH}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={revokeOthers}
              onChange={(e) => setRevokeOthers(e.target.checked)}
              className="size-4 accent-primary"
            />
            {t("profile.revokeOthers")}
          </label>

          <FormStatusMessage status={status} />

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saving || !current || !next || !confirm}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {t("profile.changePassword")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
