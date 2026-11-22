import { labQueryKeys } from "@tng/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react-native";
import { Alert, Pressable } from "react-native";
import { useTranslation } from "react-i18next";

import { Icon } from "@/components/ui/icon";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";
import { labApi } from "@/services";

/** Xoá 1 run khỏi Results/ (web `DeleteRunButton`) — Developer đã duyệt; run latest không xoá. */
export function DeleteRunButton({
  exp,
  runId,
  isLatest,
  onDeleted,
}: {
  exp: string;
  runId: string;
  isLatest: boolean;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const { isDeveloper } = useDeveloperMode();
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => labApi.deleteLabRun(exp, runId),
    onSuccess: () => {
      onDeleted();
      void qc.invalidateQueries({ queryKey: labQueryKeys.experiments });
    },
    onError: (e: Error) => Alert.alert(e.message),
  });
  if (!isDeveloper || isLatest) return null;
  return (
    <Pressable
      accessibilityLabel={t("lab.runner.deleteRun")}
      hitSlop={8}
      disabled={del.isPending}
      onPress={() =>
        Alert.alert(t("lab.runner.deleteTitle"), t("lab.runner.deleteDesc", { run: `${exp}/${runId}` }), [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("lab.runner.deleteRun"), style: "destructive", onPress: () => del.mutate() },
        ])
      }
    >
      <Icon as={Trash2} size={16} className="text-muted-foreground" />
    </Pressable>
  );
}
