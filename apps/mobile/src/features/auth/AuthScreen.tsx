import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { layoutGlide, riseIn } from "@/lib/motion";

import { AuthShell } from "./components/AuthShell";
import { LanguageSwitch } from "./components/LanguageSwitch";
import { LoginForm } from "./components/LoginForm";
import { OAuthButtons } from "./components/OAuthButtons";
import { RegisterForm } from "./components/RegisterForm";

type Tab = "login" | "register";

/** Sign in / sign up in one screen with tabs, like the web `AuthView`. `/auth?tab=register` opens sign-up. */
export function AuthScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "register" ? "register" : "login");
  const login = tab === "login";

  return (
    <AuthShell
      title={login ? t("auth.welcomeBack") : t("auth.createAccount")}
      description={login ? t("auth.loginDescription") : t("auth.registerDescription")}
      footer={<LanguageSwitch />}
      // Mở từ màn Welcome → nút quay lại (vuốt từ cạnh cũng được).
      showBack={router.canGoBack()}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-5">
        <TabsList className="mr-0 h-11 w-full bg-foreground/10">
          <TabsTrigger value="login" className="flex-1">
            <Text>{t("auth.login")}</Text>
          </TabsTrigger>
          <TabsTrigger value="register" className="flex-1">
            <Text>{t("auth.register")}</Text>
          </TabsTrigger>
        </TabsList>
        {/* Only the active tab is mounted → each form rises in when shown. */}
        <TabsContent value="login">
          <Animated.View entering={riseIn}>
            <LoginForm onSwitchToRegister={() => setTab("register")} />
          </Animated.View>
        </TabsContent>
        <TabsContent value="register">
          <Animated.View entering={riseIn}>
            <RegisterForm onSwitchToLogin={() => setTab("login")} />
          </Animated.View>
        </TabsContent>
      </Tabs>
      {/* Glides up / down as the form height changes between tabs. */}
      <Animated.View layout={layoutGlide}>
        <OAuthButtons />
      </Animated.View>
    </AuthShell>
  );
}
