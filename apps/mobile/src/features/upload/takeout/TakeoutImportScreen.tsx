import { useQuery } from "@tanstack/react-query";
import { formatDateTime, importsQueryKey, itemsForMode, type EditedMode, type ImportSession } from "@tng/shared";
import { Directory } from "expo-file-system";
import { router } from "expo-router";
import { ChevronLeft, FileArchive, FolderOpen } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/shared/GlassButton";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { queryClient } from "@/lib/queryClient";
import { importsApi } from "@/services";

import { folderSource, useImport } from "./useImport";

const BAR = 44;

/** Rows of numbers in a bordered card. */
function StatList({ rows }: { rows: [string, number][] }) {
  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-card">
      {rows.map(([label, n], i) => (
        <View key={label} className={`flex-row items-center justify-between px-4 py-3 ${i ? "border-t border-border" : ""}`}>
          <Text className="text-[15px]">{label}</Text>
          <Text className="font-semibold tabular-nums">{n.toLocaleString()}</Text>
        </View>
      ))}
    </View>
  );
}

function sessionRows(t: (k: string) => string, s: ImportSession): [string, number][] {
  return [
    [t("takeout.report.imported"), s.counts.imported],
    [t("takeout.report.duplicates"), s.counts.duplicates],
    [t("takeout.report.skippedExisting"), s.counts.skippedExisting],
    [t("takeout.report.failed"), s.counts.failed],
  ];
}

/**
 * Import from Google Takeout (route `/import-takeout`, header "+" menu): how to get + extract the
 * export · pick the folder · preview · import (shared engine, keeps going if you leave) · report
 * (`/api/imports`) + retry failed · past imports.
 */
export function TakeoutImportScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { phase, progress, failures, session, scan, start, retryFailed, cancel, reset } = useImport();
  const history = useQuery({ queryKey: importsQueryKey, queryFn: importsApi.listImports });
  const [edited, setEdited] = useState<EditedMode>("both");
  const toUpload =
    phase.kind === "ready" ? itemsForMode(phase.plan.items, edited).filter((it) => !phase.existing.has(it.path)).length : 0;

  // A finished run changes the history.
  useEffect(() => {
    if (phase.kind === "finished") void queryClient.invalidateQueries({ queryKey: importsQueryKey });
  }, [phase.kind]);

  const pick = async () => {
    let root: Directory;
    try {
      root = await Directory.pickDirectoryAsync();
    } catch {
      return; // cancelled
    }
    void scan(folderSource(root));
  };

  return (
    <View className="flex-1 bg-background">
      <View
        className="flex-row items-center gap-3"
        style={{ paddingTop: insets.top + 8, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }}
      >
        <GlassButton size={BAR} accessibilityLabel={t("common.back")} onPress={() => router.back()}>
          <Icon as={ChevronLeft} size={24} />
        </GlassButton>
        <Text className="flex-1 font-heading text-2xl font-semibold" numberOfLines={1}>
          {t("takeout.title")}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 16 }}>
        {phase.kind === "idle" || phase.kind === "error" ? (
          <>
            <View className="items-center gap-3 py-4">
              <View className="size-14 items-center justify-center rounded-2xl bg-muted">
                <Icon as={FileArchive} size={28} />
              </View>
              <Text className="text-center text-[15px] text-muted-foreground">{t("takeout.intro")}</Text>
            </View>
            <View className="gap-3 rounded-2xl border border-border bg-card p-4">
              {(["step1", "step2", "step3"] as const).map((step, i) => (
                <View key={step} className="flex-row gap-3">
                  <Text className="w-5 font-semibold">{i + 1}.</Text>
                  <Text className="flex-1 text-[15px]">{t(`takeout.${step}`)}</Text>
                </View>
              ))}
            </View>
            {phase.kind === "error" ? (
              <Text className="text-center text-destructive">{t(`takeout.errors.${phase.error}`)}</Text>
            ) : null}
            <Button onPress={() => void pick()}>
              <Icon as={FolderOpen} size={18} className="text-primary-foreground" />
              <Text>{t("takeout.pickFolder")}</Text>
            </Button>

            {history.data?.length ? (
              <View className="gap-2 pt-4">
                <Text className="text-[13px] font-semibold uppercase text-muted-foreground">{t("takeout.history")}</Text>
                {history.data.map((s) => (
                  <View key={s.id} className="gap-1 rounded-2xl border border-border bg-card px-4 py-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-[14px]">{formatDateTime(s.startedAt, i18n.language)}</Text>
                      <Text className="text-[13px] text-muted-foreground">{t(`takeout.status.${s.status}`)}</Text>
                    </View>
                    <Text className="text-[13px] text-muted-foreground">
                      {t("takeout.historyLine", {
                        imported: s.counts.imported,
                        duplicates: s.counts.duplicates + s.counts.skippedExisting,
                        failed: s.counts.failed,
                      })}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {phase.kind === "scanning" || phase.kind === "checking" ? (
          <View className="items-center gap-3 py-12">
            <ActivityIndicator color={colors.mutedForeground} />
            <Text className="text-muted-foreground">
              {phase.kind === "scanning" ? t("takeout.scanning", { n: phase.files }) : t("takeout.checking")}
            </Text>
          </View>
        ) : null}

        {phase.kind === "ready" ? (
          <>
            <StatList
              rows={[
                [t("takeout.stats.photos"), phase.plan.stats.media - phase.plan.stats.videos],
                [t("takeout.stats.videos"), phase.plan.stats.videos],
                [t("takeout.stats.albums"), phase.plan.albums.length],
                [t("takeout.stats.duplicates"), phase.plan.stats.duplicates],
                [t("takeout.stats.existing"), phase.existing.size],
                [t("takeout.stats.missingJson"), phase.plan.stats.missingJson],
                [t("takeout.stats.skipped"), phase.plan.stats.skipped],
                [t("takeout.stats.livePhotos"), phase.plan.stats.livePhotos],
                [t("takeout.stats.edited"), phase.plan.stats.edited],
              ]}
            />
            {phase.plan.stats.edited > 0 ? (
              <View className="gap-2">
                <Text className="text-[15px] font-medium">{t("takeout.editedMode.label")}</Text>
                {(["both", "original", "edited"] as const).map((mode) => (
                  <Button
                    key={mode}
                    variant={edited === mode ? "secondary" : "outline"}
                    accessibilityState={{ selected: edited === mode }}
                    onPress={() => setEdited(mode)}
                  >
                    <Text>{t(`takeout.editedMode.${mode}`)}</Text>
                  </Button>
                ))}
              </View>
            ) : null}
            <Text className="text-[13px] text-muted-foreground">{t("takeout.readyHint")}</Text>
            <Button disabled={toUpload === 0} onPress={() => void start({ edited })}>
              <Text>{t("takeout.import", { n: toUpload })}</Text>
            </Button>
            <Button variant="ghost" onPress={reset}>
              <Text>{t("takeout.pickAnother")}</Text>
            </Button>
          </>
        ) : null}

        {phase.kind === "running" ? (
          <View className="items-center gap-4 py-10">
            <ActivityIndicator color={colors.mutedForeground} />
            <Text className="text-muted-foreground">
              {t(`takeout.steps.${phase.step}`, { done: phase.done, total: phase.total })}
            </Text>
            {phase.step === "upload" && progress ? (
              <View className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <View
                  className="h-full bg-primary"
                  style={{ width: `${Math.round(((progress.done + progress.failed) / Math.max(1, progress.total)) * 100)}%` }}
                />
              </View>
            ) : null}
            <Text className="text-center text-[13px] text-muted-foreground">{t("takeout.runningHint")}</Text>
            <Button variant="outline" onPress={cancel}>
              <Text>{t("common.cancel")}</Text>
            </Button>
          </View>
        ) : null}

        {phase.kind === "finished" ? (
          <>
            <Text className="text-center font-heading text-xl">{t(`takeout.finished.${phase.status}`)}</Text>
            {session ? <StatList rows={sessionRows(t, session)} /> : null}
            {failures.length ? (
              <View className="gap-1 rounded-2xl border border-border bg-card p-4">
                {failures.slice(0, 20).map((f) => (
                  <Text key={f.path} numberOfLines={1} className="text-[13px] text-muted-foreground">
                    {t(`takeout.reasons.${f.reason}`)} · {f.path.split("/").pop()}
                  </Text>
                ))}
                {failures.length > 20 ? (
                  <Text className="text-[13px] text-muted-foreground">{t("takeout.moreFailures", { n: failures.length - 20 })}</Text>
                ) : null}
              </View>
            ) : null}
            {failures.length ? (
              <Button variant="outline" onPress={() => void retryFailed()}>
                <Text>{t("takeout.retryFailed", { n: failures.length })}</Text>
              </Button>
            ) : null}
            <Button onPress={reset}>
              <Text>{t("takeout.done")}</Text>
            </Button>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
