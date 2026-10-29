import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "./PasswordInput";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "./AuthContext";
import { OAuthButtons } from "./OAuthButtons";

type RegisterFormProps = {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
};

export const RegisterForm: React.FC<RegisterFormProps> = ({
  onSuccess,
  onSwitchToLogin,
}) => {
  const { t } = useTranslation();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    setLoading(true);
    const { error } = await register(name, email, password);
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="register-name">{t("auth.name")}</Label>
        <Input
          id="register-name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("auth.namePlaceholder")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-email">{t("auth.email")}</Label>
        <Input
          id="register-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("auth.emailPlaceholder")}
        />
      </div>

      {/* Field Password */}
      <div className="space-y-2">
        <Label htmlFor="register-password">{t("auth.password")}</Label>
        <PasswordInput
          id="register-password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      {/* Field Confirm Password */}
      <div className="space-y-2">
        <Label htmlFor="register-confirm-password">
          {t("auth.confirmPassword")}
        </Label>
        <PasswordInput
          id="register-confirm-password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t("auth.registering") : t("auth.register")}
      </Button>
      <div className="relative py-2">
        <OAuthButtons />
      </div>
      <p className="text-center text-sm text-muted-foreground">
        {t("auth.alreadyHaveAccount")}{" "}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="underline underline-offset-4 hover:text-primary"
        >
          {t("auth.login")}
        </button>
      </p>
    </form>
  );
};
