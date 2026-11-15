import "../../global.css";
import "@/lib/i18n";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { PortalHost } from "@rn-primitives/portal";
import { QueryClientProvider } from "@tanstack/react-query";
import { setGridDensityStorage, setMediaBaseUrl } from "@tng/shared";
import { useFonts } from "expo-font";
import { Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { installUnauthorizedHandler, useSession } from "@/features/auth/session";
import { useTheme } from "@/hooks/useTheme";
import { useApplyThemeMode } from "@/hooks/useThemeMode";
import { MOBILE_MEDIA_BASE } from "@/lib/config";
import { FONT_SOURCES } from "@/lib/fonts";
import { queryClient, setupQueryManagers } from "@/lib/queryClient";
import { NAV_THEME } from "@/lib/theme";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();
setMediaBaseUrl(MOBILE_MEDIA_BASE);
void setGridDensityStorage(AsyncStorage);
setupQueryManagers();
installUnauthorizedHandler();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_SOURCES);
  // Session is restored from SecureStore (expo plugin cache), then re-validated.
  const { data: session, isPending } = useSession();
  const isSignedIn = !!session;
  const { colorScheme } = useTheme();
  useApplyThemeMode();

  // A broken font file shouldn't block the app — Text falls back to the system font.
  const ready = (fontsLoaded || !!fontError) && !isPending;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // Keep the splash screen until fonts + session are known (no sign-in flash).
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={NAV_THEME[colorScheme]}>
        <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
        {/* iOS: swipe back from anywhere on the screen, not only the left edge.
            Android uses the system back gesture. */}
        <Stack screenOptions={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }}>
          {/* Signed out → the app's screens redirect to the welcome carousel (redirectTo is needed:
              without it the router doesn't reliably fall back to the first signed-out screen). */}
          <Stack.Protected guard={isSignedIn} redirectTo="/welcome">
            {/* Signing in / out swaps screens without a navigator fade: fading a scene
                breaks the Liquid Glass inside it (see lib/motion.ts ⚠). The tab content
                fades itself in (useTabEnterStyle). */}
            <Stack.Screen name="(tabs)" options={{ animation: "none" }} />
            <Stack.Screen name="search" />
            <Stack.Screen name="favorites" />
            <Stack.Screen name="labels" />
            <Stack.Screen name="friends" />
            <Stack.Screen name="studio/[tag]" />
            <Stack.Screen name="albums/[id]" />
            <Stack.Screen name="albums/auto/[key]" />
            <Stack.Screen name="album-form" options={{ presentation: "modal" }} />
            <Stack.Screen name="moment-memes" options={{ presentation: "modal" }} />
            {/* Avatar → account sheet (Google Photos style): native form sheet, 65 % → full. */}
            <Stack.Screen
              name="account"
              options={{
                presentation: "formSheet",
                sheetAllowedDetents: [0.65, 1],
                sheetGrabberVisible: true,
                sheetCornerRadius: 28,
              }}
            />
            <Stack.Screen name="profile-edit" options={{ presentation: "modal" }} />
            <Stack.Screen name="change-password" options={{ presentation: "modal" }} />
            <Stack.Screen name="trash" />
            <Stack.Screen name="admin" />
            <Stack.Screen name="admin-user" />
          </Stack.Protected>
          {/* Signed out: welcome carousel (= web landing) first; it pushes auth (slides in). */}
          <Stack.Protected guard={!isSignedIn}>
            <Stack.Screen name="welcome" options={{ animation: "none" }} />
            <Stack.Screen name="auth" />
            <Stack.Screen name="forgot-password" />
          </Stack.Protected>
        </Stack>
        {/* Required by react-native-reusables: Dialog / DropdownMenu / Tooltip render here. */}
        <PortalHost />
      </ThemeProvider>
    </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
