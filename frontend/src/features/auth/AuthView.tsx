import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { LANGUAGES, toLanguageCode } from "@tng/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoginForm } from "./components/LoginForm";
import { RegisterForm } from "./components/RegisterForm";

type AuthViewProps = {
  defaultTab?: "login" | "register";
  onSuccess?: () => void;
};

type LocationState = {
  from?: string;
};

export const AuthView: React.FC<AuthViewProps> = ({
  defaultTab = "login",
  onSuccess,
}) => {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<"login" | "register">(defaultTab);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLoginSuccess = () => {
    if (onSuccess) {
      onSuccess();
      return;
    }
    const state = location.state as LocationState | null;
    const redirectTo = state?.from ?? "/";
    navigate(redirectTo, { replace: true });
  };

  const handleRegisterSuccess = () => {
    // Đăng ký xong, chuyển về tab login để user đăng nhập luôn
    setTab("login");
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl">
            {tab === "login" ? t("auth.welcomeBack") : t("auth.createAccount")}
          </CardTitle>
          <CardDescription>
            {tab === "login"
              ? t("auth.loginDescription")
              : t("auth.registerDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as "login" | "register")}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">{t("auth.login")}</TabsTrigger>
              <TabsTrigger value="register">{t("auth.register")}</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="pt-4">
              <LoginForm
                onSuccess={handleLoginSuccess}
                onSwitchToRegister={() => setTab("register")}
              />
            </TabsContent>
            <TabsContent value="register" className="pt-4">
              <RegisterForm
                onSuccess={handleRegisterSuccess}
                onSwitchToLogin={() => setTab("login")}
              />
            </TabsContent>
          </Tabs>
          <div className="mt-4 flex justify-center gap-2">
            {LANGUAGES.map((lang) => {
              const current = toLanguageCode(i18n.resolvedLanguage ?? i18n.language);
              const active = current === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => void i18n.changeLanguage(lang.code)}
                  className={
                    "rounded-md px-3 py-1 text-xs font-medium transition-colors " +
                    (active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {lang.short}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthView;
