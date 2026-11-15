import { CircleAlert } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { fadeOut, riseIn } from "@/lib/motion";

/** Error banner above the submit button; `messageKey` is an i18n key. */
export function FormError({ messageKey, values }: { messageKey: string | null; values?: Record<string, string> }) {
  const { t } = useTranslation();
  if (!messageKey) return null;
  return (
    <Animated.View entering={riseIn} exiting={fadeOut}>
      <Alert variant="destructive" icon={CircleAlert}>
        <AlertTitle>{t(messageKey, values)}</AlertTitle>
      </Alert>
    </Animated.View>
  );
}
