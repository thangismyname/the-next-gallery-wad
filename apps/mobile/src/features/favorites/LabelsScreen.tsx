import { LABEL_COLORS, type LabelColor, type UserLabel } from "@tng/shared";
import { router } from "expo-router";
import { Check, ChevronLeft, Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/shared/GlassButton";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useLayout } from "@/hooks/useLayout";
import { useTheme } from "@/hooks/useTheme";
import { fadeIn, fadeOut, layoutGlide } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { LABEL_DOT } from "./labelColors";
import { labelErrorKey, useLabelActions, useLabels } from "./useLabels";

const BAR = 44;

/**
 * Manage personal labels (web `LabelManagerDialog`, pushed from Favorites):
 * rename in place (saved when the field loses focus / Return), pick a color,
 * delete (confirm), and create a new one at the bottom. Suggested labels show
 * their translated name until renamed.
 */
export function LabelsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { formWidth } = useLayout();
  const { labels, isPending } = useLabels();
  const { colors } = useTheme();

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{
          paddingTop: insets.top + 8 + BAR + 12,
          paddingBottom: insets.bottom + 32,
          paddingLeft: insets.left + 16,
          paddingRight: insets.right + 16,
          alignItems: "center",
        }}
      >
        <View style={{ width: formWidth, maxWidth: "100%" }} className="gap-5">
          <View className="gap-1">
            <Text className="font-heading text-3xl font-semibold">{t("favorites.labels.manage")}</Text>
            <Text className="text-[15px] text-muted-foreground">{t("favorites.labels.manageDesc")}</Text>
          </View>

          {isPending ? (
            <ActivityIndicator color={colors.mutedForeground} />
          ) : labels.length ? (
            <View className="overflow-hidden rounded-2xl border border-border">
              {labels.map((label, i) => (
                <Animated.View key={label.id} layout={layoutGlide} exiting={fadeOut}>
                  {i > 0 ? <View className="ml-4 h-px bg-border" /> : null}
                  <LabelRow label={label} />
                </Animated.View>
              ))}
            </View>
          ) : (
            <Text className="text-[15px] text-muted-foreground">{t("favorites.labels.empty")}</Text>
          )}

          <NewLabel />
        </View>
      </ScrollView>

      <View pointerEvents="box-none" className="absolute" style={{ top: insets.top + 8, left: insets.left + 16 }}>
        <GlassButton size={BAR} accessibilityLabel={t("common.back")} onPress={() => router.back()}>
          <Icon as={ChevronLeft} size={24} />
        </GlassButton>
      </View>
    </KeyboardAvoidingView>
  );
}

/** One label: color (tap → palette), name field, delete. */
function LabelRow({ label }: { label: UserLabel }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { update, remove } = useLabelActions();
  const [name, setName] = useState(label.name);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveName = () => {
    const next = name.trim();
    if (!next || next === label.name) return setName(label.name);
    setError(null);
    update(label.id, { name: next }).catch((e) => {
      setError(labelErrorKey(e));
      setName(label.name);
    });
  };

  const confirmDelete = () =>
    Alert.alert(t("favorites.labels.delete"), label.name, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("favorites.labels.delete"),
        style: "destructive",
        onPress: () => void remove(label.id).catch((e) => setError(labelErrorKey(e))),
      },
    ]);

  return (
    <View className="bg-card px-2 py-1.5">
      <View className="flex-row items-center gap-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("favorites.labels.color")}
          onPress={() => setPicking((v) => !v)}
          className="size-11 items-center justify-center rounded-full active:bg-foreground/10"
        >
          <View className={cn("size-4 rounded-full", LABEL_DOT[label.color] ?? LABEL_DOT.slate)} />
        </Pressable>
        <TextInput
          value={name}
          onChangeText={setName}
          onEndEditing={saveName}
          onSubmitEditing={saveName}
          returnKeyType="done"
          maxLength={40}
          placeholder={t("favorites.labels.namePlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          className="h-11 flex-1 font-sans text-[17px] text-foreground"
        />
        <Text className="px-1 text-[14px] text-muted-foreground">{label.count}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("favorites.labels.delete")}
          onPress={confirmDelete}
          className="size-11 items-center justify-center rounded-full active:bg-foreground/10"
        >
          <Icon as={Trash2} size={18} className="text-destructive" />
        </Pressable>
      </View>
      {picking ? (
        <Animated.View entering={fadeIn} className="pb-2 pl-2">
          <ColorPalette
            value={label.color}
            onChange={(color) => {
              setPicking(false);
              update(label.id, { color }).catch((e) => setError(labelErrorKey(e)));
            }}
          />
        </Animated.View>
      ) : null}
      {error ? <Text className="pb-2 pl-3 text-[14px] text-destructive">{t(error)}</Text> : null}
    </View>
  );
}

/** Create a label: color + name + Add. */
function NewLabel() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { create } = useLabelActions();
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("rose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      await create(value, color);
      setName("");
    } catch (e) {
      setError(labelErrorKey(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-3 rounded-2xl border border-dashed border-border p-3">
      <View className="flex-row items-center gap-2">
        <TextInput
          value={name}
          onChangeText={setName}
          onSubmitEditing={() => void submit()}
          returnKeyType="done"
          maxLength={40}
          placeholder={t("favorites.labels.namePlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          className="h-11 flex-1 rounded-xl bg-muted px-3 font-sans text-[17px] text-foreground"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("favorites.labels.create")}
          disabled={!name.trim() || busy}
          onPress={() => void submit()}
          className={cn(
            "h-11 flex-row items-center gap-1.5 rounded-xl bg-primary px-4 active:opacity-80",
            (!name.trim() || busy) && "opacity-50",
          )}
        >
          {busy ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Icon as={Plus} size={18} className="text-primary-foreground" />
          )}
          <Text className="text-[15px] font-semibold text-primary-foreground">{t("favorites.labels.create")}</Text>
        </Pressable>
      </View>
      <ColorPalette value={color} onChange={setColor} />
      {error ? <Text className="text-[14px] text-destructive">{t(error)}</Text> : null}
    </View>
  );
}

function ColorPalette({ value, onChange }: { value: LabelColor; onChange: (color: LabelColor) => void }) {
  const { t } = useTranslation();
  return (
    <View className="flex-row gap-2">
      {LABEL_COLORS.map((color) => (
        <Pressable
          key={color}
          accessibilityRole="radio"
          accessibilityState={{ checked: color === value }}
          accessibilityLabel={t(`favorites.labels.colors.${color}`)}
          onPress={() => onChange(color)}
          className={cn(
            "size-9 items-center justify-center rounded-full",
            color === value ? "bg-foreground/10" : "active:bg-foreground/5",
          )}
        >
          <View className={cn("size-6 items-center justify-center rounded-full", LABEL_DOT[color])}>
            {color === value ? <Icon as={Check} size={14} strokeWidth={3} className="text-white" /> : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}
