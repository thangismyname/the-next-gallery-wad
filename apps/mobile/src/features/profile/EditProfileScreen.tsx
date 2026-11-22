import { avatarImagePath, getInitials, resolveMediaUrl, type MediaListItem } from "@tng/shared";
import { router } from "expo-router";
import { ChevronLeft, ImagePlus } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useSession } from "@/features/auth/session";
import { LibraryPickGrid } from "@/features/gallery/components/LibraryPickGrid";
import { authClient } from "@/lib/authClient";

import { AvatarCropper, type AvatarCropperHandle } from "./components/AvatarCropper";
import { FormLabel, FormModal } from "./components/FormModal";

const NAME_MAX = 64;

type Step = { kind: "form" } | { kind: "pick"; selected: MediaListItem | null } | { kind: "crop"; media: MediaListItem };

/**
 * Edit display name + avatar (web `EditProfileForm` + `AvatarPickerDialog` +
 * `AvatarCropDialog`), modal `/profile-edit`. Avatar = pick a library photo →
 * crop it to the circle → saved as the relative `/api/profile/avatar/<id>?c=…`
 * (`avatarImagePath`, cropped by the backend). The picker and the cropper are
 * steps of this same modal — no screen stacked on top of the account sheet.
 */
export function EditProfileScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data, refetch } = useSession();
  const user = data?.user;
  const [name, setName] = useState(user?.name ?? "");
  const [image, setImage] = useState<string | null>(user?.image ?? null);
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cropper = useRef<AvatarCropperHandle>(null);
  const trimmed = name.trim();
  const dirty = trimmed !== (user?.name ?? "") || image !== (user?.image ?? null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const { error: failed } = await authClient.updateUser({ name: trimmed, image });
    setSaving(false);
    if (failed) return setError(failed.message || t("profile.saveFailed"));
    await refetch();
    router.back();
  };

  if (step.kind === "pick") {
    return (
      <FormModal
        title={t("profile.avatarPickTitle")}
        action={t("profile.avatarNext")}
        canSubmit={!!step.selected}
        saving={false}
        onSubmit={() => step.selected && setStep({ kind: "crop", media: step.selected })}
        leading={{ icon: ChevronLeft, label: t("common.back"), onPress: () => setStep({ kind: "form" }) }}
        scroll={false}
      >
        <LibraryPickGrid
          hint={t("profile.avatarPickDesc")}
          selectedIds={step.selected ? [step.selected.id] : []}
          onSelect={(item) => setStep({ kind: "pick", selected: item })}
          bottomInset={insets.bottom}
        />
      </FormModal>
    );
  }

  if (step.kind === "crop") {
    return (
      <FormModal
        title={t("profile.avatarCropTitle")}
        action={t("profile.avatarUse")}
        canSubmit
        saving={false}
        onSubmit={() => {
          const crop = cropper.current?.getCrop();
          if (!crop) return;
          setImage(avatarImagePath(step.media.id, crop));
          setStep({ kind: "form" });
        }}
        leading={{ icon: ChevronLeft, label: t("common.back"), onPress: () => setStep({ kind: "pick", selected: step.media }) }}
        // No scroll view here: it would steal the cropper's vertical drags.
        scroll={false}
      >
        <View className="gap-5 px-4 pt-2">
          <Text className="text-[14px] text-muted-foreground">{t("profile.avatarCropDesc")}</Text>
          <View className="items-center">
            <AvatarCropper ref={cropper} media={step.media} size={Math.min(width - 32, 420)} />
          </View>
        </View>
      </FormModal>
    );
  }

  return (
    <FormModal
      title={t("profile.infoTitle")}
      action={t("profile.save")}
      canSubmit={!!trimmed && dirty}
      saving={saving}
      onSubmit={() => void save()}
    >
      <Text className="text-[14px] text-muted-foreground">{t("profile.infoDesc")}</Text>
      <View className="items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("profile.avatarChoose")}
          onPress={() => setStep({ kind: "pick", selected: null })}
          className="active:opacity-80"
        >
          <Avatar alt={trimmed} style={{ width: 96, height: 96 }}>
            {image ? <AvatarImage source={{ uri: resolveMediaUrl(image) }} /> : null}
            <AvatarFallback>
              <Text className="text-2xl font-semibold">{getInitials(trimmed || user?.name)}</Text>
            </AvatarFallback>
          </Avatar>
          <View className="absolute bottom-0 right-0 size-8 items-center justify-center rounded-full border-2 border-background bg-foreground">
            <Icon as={ImagePlus} size={15} className="text-background" />
          </View>
        </Pressable>
        <View className="flex-row gap-5">
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setStep({ kind: "pick", selected: null })}>
            <Text className="text-[14px] font-medium">{t("profile.avatarChoose")}</Text>
          </Pressable>
          {image ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setImage(null)}>
              <Text className="text-[14px] font-medium text-destructive">{t("profile.avatarRemove")}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <View className="gap-2">
        <FormLabel>{t("profile.name")}</FormLabel>
        <Input value={name} onChangeText={setName} maxLength={NAME_MAX} className="h-12 rounded-2xl text-[16px]" />
      </View>
      <View className="gap-2">
        <FormLabel>{t("profile.email")}</FormLabel>
        <Input value={user?.email ?? ""} editable={false} className="h-12 rounded-2xl text-[16px] opacity-60" />
        <Text className="text-[13px] text-muted-foreground">{t("profile.emailHint")}</Text>
      </View>
      {error ? <Text className="text-[14px] text-destructive">{error}</Text> : null}
    </FormModal>
  );
}
