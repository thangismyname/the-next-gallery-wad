import { useQueryClient } from "@tanstack/react-query";
import { formatBytes, storageQueryKey, trashQueryKey } from "@tng/shared";
import { router } from "expo-router";
import { HardDrive, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Alert, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/text";
import { mediaApi } from "@/services";

import { useStorage } from "../useProfile";
import { SettingsGroup, SettingsRow } from "./SettingsGroup";

/** Used space (photos · videos · trash bar) + Trash row + empty trash (web `StorageCard`). */
export function StorageGroup() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useStorage();
  const [emptying, setEmptying] = useState(false);
  const total = data ? data.photoBytes + data.videoBytes + data.trashBytes : 0;
  const part = (bytes: number) => (total ? `${(bytes / total) * 100}%` : "0%");

  const emptyTrash = () => {
    if (!data) return;
    Alert.alert(
      t("settings.storage.emptyTitle"),
      t("settings.storage.emptyDesc", { n: data.trashCount, size: formatBytes(data.trashBytes) }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.storage.emptyConfirm"),
          style: "destructive",
          onPress: async () => {
            setEmptying(true);
            try {
              await mediaApi.emptyTrash();
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: storageQueryKey }),
                queryClient.invalidateQueries({ queryKey: trashQueryKey }),
              ]);
            } catch {
              Alert.alert(t("settings.storage.emptyFailed"));
            } finally {
              setEmptying(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SettingsGroup title={t("settings.storage.title")} footer={t("settings.storage.desc")}>
      <SettingsRow icon={HardDrive} title={t("settings.storage.used")} value={data ? formatBytes(total) : "…"}>
        <View className="gap-2">
          <View className="h-2 flex-row overflow-hidden rounded-full bg-background">
            <View className="h-full bg-foreground" style={{ width: part(data?.photoBytes ?? 0) }} />
            <View className="h-full bg-foreground/50" style={{ width: part(data?.videoBytes ?? 0) }} />
            <View className="h-full bg-destructive/60" style={{ width: part(data?.trashBytes ?? 0) }} />
          </View>
          <View className="flex-row flex-wrap gap-x-4 gap-y-1">
            <Legend dot="bg-foreground" label={t("settings.storage.photos")} value={formatBytes(data?.photoBytes ?? 0)} />
            <Legend dot="bg-foreground/50" label={t("settings.storage.videos")} value={formatBytes(data?.videoBytes ?? 0)} />
            <Legend dot="bg-destructive/60" label={t("settings.storage.trash")} value={formatBytes(data?.trashBytes ?? 0)} />
          </View>
        </View>
      </SettingsRow>
      <SettingsRow
        icon={Trash2}
        title={t("trash.title")}
        value={data ? t("settings.storage.trashCount", { n: data.trashCount }) : undefined}
        chevron
        // Leave the sheet for the full-screen grid (its Lightbox portal lives in the root).
        onPress={() => router.replace("/trash")}
      />
      {data?.trashCount ? (
        <SettingsRow title={t("settings.storage.emptyTrash")} destructive busy={emptying} onPress={emptyTrash} />
      ) : null}
    </SettingsGroup>
  );
}

function Legend({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={`size-2 rounded-full ${dot}`} />
      <Text className="text-[12px] text-muted-foreground">
        {label} · {value}
      </Text>
    </View>
  );
}
