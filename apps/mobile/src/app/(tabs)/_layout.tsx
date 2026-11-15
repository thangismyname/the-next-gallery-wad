import { Tabs } from "expo-router";
import { View } from "react-native";

import { BottomBar } from "@/features/navigation";
import { UploadStatus } from "@/features/upload/components/UploadStatus";

/**
 * No navigator header / scene padding: each tab screen draws the transparent
 * `AppHeader` itself and lets its content scroll under the header and the
 * floating glass BottomBar (`TabScreen` / `useTabContentInsets`).
 */
export default function TabLayout() {
  return (
    <View className="flex-1">
    <Tabs
      tabBar={(props) => <BottomBar {...props} />}
      // No navigator animation: it fades the whole scene, which breaks the header's
      // Liquid Glass. Each screen fades its *content* in instead (useTabEnterStyle).
      screenOptions={{ headerShown: false, animation: "none" }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="albums" />
      <Tabs.Screen name="camera" />
      <Tabs.Screen name="moments" />
      <Tabs.Screen name="studio" />
    </Tabs>
      {/* Upload progress pill, above the BottomBar on every tab. */}
      <UploadStatus />
    </View>
  );
}
