import { useSelectionStore } from "@tng/shared";
import { Camera, Clock3, FolderOpen, Image as ImageIcon, Sparkles } from "lucide-react-native";
import { View } from "react-native";

import { AppTabs, type AppTab } from "@/features/navigation/AppTabs";
import { UploadStatus } from "@/features/upload/components/UploadStatus";

/** Same slots as the web `useNavItems` bottom bar. Icons only. */
const TABS: AppTab[] = [
  { name: "index", labelKey: "sidebar.gallery", sf: "photo", md: "photo_library", icon: ImageIcon },
  { name: "albums", labelKey: "sidebar.albums", sf: "folder", md: "folder", icon: FolderOpen },
  { name: "camera", labelKey: "navigation.camera", sf: "camera", md: "photo_camera", icon: Camera },
  { name: "moments", labelKey: "sidebar.moments", sf: "clock", md: "schedule", icon: Clock3 },
  { name: "studio", labelKey: "navigation.aiEdit", sf: "sparkles", md: "auto_awesome", icon: Sparkles },
];

/**
 * App tabs (`AppTabs`: system bar or custom glass bar, `NATIVE_TAB_BAR`). No navigator header: each tab
 * screen draws the transparent `AppHeader` itself and pads its content for the bar (`useTabContentInsets`).
 */
export default function TabLayout() {
  // Gallery selection mode: its `SelectionBar` takes the tab bar's spot.
  const selecting = useSelectionStore((s) => s.isSelecting);
  return (
    <View className="flex-1">
      <AppTabs tabs={TABS} hidden={selecting} />
      {/* Upload progress pill, above the tab bar on every tab. */}
      <UploadStatus />
    </View>
  );
}
