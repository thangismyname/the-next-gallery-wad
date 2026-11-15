import { Camera } from "lucide-react-native";
import { Linking, View } from "react-native";
import { useTranslation } from "react-i18next";

import { GlassPanel } from "@/components/shared/GlassPanel";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useLayout } from "@/hooks/useLayout";

/** Asks for camera access; after a refusal the system won't ask again → open Settings. */
export function CameraPermission({ canAskAgain, onRequest }: { canAskAgain: boolean; onRequest: () => void }) {
  const { t } = useTranslation();
  const { formWidth } = useLayout();
  return (
    <View className="flex-1 items-center justify-center px-6">
      <View style={{ width: formWidth }}>
        <GlassPanel radius={28} padding={24} materialize>
          <View className="items-center gap-3">
            <View className="size-14 items-center justify-center rounded-full bg-foreground/10">
              <Icon as={Camera} size={26} className="text-foreground" />
            </View>
            <Text className="text-center font-heading text-2xl">{t("camera.title")}</Text>
            <Text className="text-center text-[15px] text-muted-foreground">{t("camera.permissionHintMobile")}</Text>
            <Button className="mt-2 self-stretch" onPress={canAskAgain ? onRequest : () => void Linking.openSettings()}>
              <Text>{canAskAgain ? t("camera.allow") : t("camera.openSettings")}</Text>
            </Button>
          </View>
        </GlassPanel>
      </View>
    </View>
  );
}
