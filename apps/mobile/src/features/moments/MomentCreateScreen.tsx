import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  framingOrNull,
  moveInCells,
  toggleInCells,
  type MomentFraming,
  type MomentTemplate,
  type MomentVisibility,
} from "@tng/shared";
import { router } from "expo-router";
import { Check, ChevronLeft, ImagePlus, Lock, Users } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, TextInput, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { friendsKeys } from "@/features/friends/useFriends";
import { LibraryPickGrid } from "@/features/gallery/components/LibraryPickGrid";
import { FormLabel, FormModal } from "@/features/profile/components/FormModal";
import { useTheme } from "@/hooks/useTheme";
import { friendsApi, momentsApi } from "@/services";

import { MomentFramer, type FramerPhoto } from "./components/MomentFramer";
import { toFramerPhoto } from "./framerPhoto";

const SLOT_COUNT: Record<MomentTemplate, number> = { single: 1, duo_square: 2, trio_wide: 3 };
const TEMPLATES: { value: MomentTemplate; key: string }[] = [
  { value: "single", key: "moments.templateSingle" },
  { value: "duo_square", key: "moments.templateDuo" },
  { value: "trio_wide", key: "moments.templateTrio" },
];
const CAPTION_MAX = 280;


/**
 * `/moment-create` (Moments "+" → Multi-photo / with friends; web `CreateMomentDialog`):
 * layout 1 / 2 / 3 photos · on your own or with friends (they fill the other frames) · photos from
 * your library · frame each photo + pick which frames are yours · caption · who sees it.
 */
export function MomentCreateScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const [template, setTemplate] = useState<MomentTemplate>("duo_square");
  const [collab, setCollab] = useState(true);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [cells, setCells] = useState<(string | null)[]>([]);
  const [photos, setPhotos] = useState<Record<string, FramerPhoto>>({});
  const [framings, setFramings] = useState<Record<string, MomentFraming>>({});
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<MomentVisibility>("circle");
  const [picking, setPicking] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const friends = useQuery({ queryKey: friendsKeys.list, queryFn: friendsApi.fetchFriends, staleTime: 30_000 });

  const slotCount = SLOT_COUNT[template];
  const multi = template !== "single";
  const withFriends = multi && collab;
  const slotCells = Array.from({ length: slotCount }, (_, i) => cells[i] ?? null);
  const selectedIds = slotCells.filter((id): id is string => Boolean(id));
  // Same limits as web `useMomentDraft`: with friends you keep ≥ 1 frame free for each of them.
  const photoLimit = !multi ? 1 : !withFriends ? slotCount : Math.max(1, Math.min(slotCount - friendIds.length, slotCount - 1));
  const maxFriends = withFriends ? Math.max(1, slotCount - Math.max(selectedIds.length, 1)) : 0;
  const canPost = withFriends
    ? selectedIds.length >= 1 && friendIds.length >= 1 && selectedIds.length + friendIds.length <= slotCount
    : selectedIds.length >= photoLimit;

  const framerPhotos = selectedIds.map((id) => photos[id]).filter(Boolean);
  const layout = useMemo(() => slotCells.map((id) => (id ? selectedIds.indexOf(id) : null)), [slotCells, selectedIds]);

  const changeTemplate = (value: MomentTemplate) => {
    setTemplate(value);
    setCells([]);
    setFriendIds([]);
  };

  const toggleFriend = (id: string) =>
    setFriendIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= maxFriends ? prev : [...prev, id]));

  const post = async () => {
    setPosting(true);
    setError(null);
    try {
      const framingList = selectedIds.map((id) => framingOrNull(framings[id]));
      await momentsApi.createMoment(
        multi
          ? {
              template,
              mediaIds: selectedIds,
              framings: framingList,
              ...(withFriends
                ? { collaboratorIds: friendIds, creatorSlots: slotCells.flatMap((id, i) => (id ? [i] : [])) }
                : {}),
              caption: caption.trim() || undefined,
              visibility,
            }
          : { template: "single", mediaId: selectedIds[0], framings: framingList, caption: caption.trim() || undefined, visibility },
      );
      void queryClient.invalidateQueries({ queryKey: ["moments"] });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPosting(false);
    }
  };

  if (picking) {
    return (
      <FormModal
        title={t("moments.pickPhotos")}
        action={t("moments.donePicking")}
        canSubmit
        saving={false}
        onSubmit={() => setPicking(false)}
        leading={{ icon: ChevronLeft, label: t("common.back"), onPress: () => setPicking(false) }}
        scroll={false}
      >
        <LibraryPickGrid
          includeVideos
          browse
          hint={t("moments.pickMax", { n: photoLimit })}
          selectedIds={selectedIds}
          bottomInset={insets.bottom}
          onSelect={(item) => {
            setPhotos((prev) => ({ ...prev, [item.id]: toFramerPhoto(item) }));
            setCells((prev) => toggleInCells(prev, item.id, slotCount, photoLimit));
          }}
        />
      </FormModal>
    );
  }

  return (
    <FormModal title={t("moments.newMoment")} action={t("moments.post")} canSubmit={canPost} saving={posting} onSubmit={() => void post()}>
      {error ? <Text className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</Text> : null}

      <View className="gap-2">
        <FormLabel>{t("moments.sectionLayout")}</FormLabel>
        <Segments
          options={TEMPLATES.map((o) => ({ value: o.value, label: t(o.key) }))}
          value={template}
          onChange={changeTemplate}
        />
        {multi ? (
          <Segments
            options={[
              { value: "collab", label: t("moments.modeCollab") },
              { value: "self", label: t("moments.modeSelf") },
            ]}
            value={collab ? "collab" : "self"}
            onChange={(v) => {
              setCollab(v === "collab");
              setFriendIds([]);
              setCells([]);
            }}
          />
        ) : null}
      </View>

      {withFriends ? (
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <FormLabel>{t("moments.sectionFriends")}</FormLabel>
            <Text className="text-[13px] text-muted-foreground">
              {friendIds.length}/{maxFriends}
            </Text>
          </View>
          <View className="overflow-hidden rounded-2xl border border-border bg-card">
            {(friends.data ?? []).map((f, i) => {
              const on = friendIds.includes(f.id);
              const disabled = !on && friendIds.length >= maxFriends;
              return (
                <Pressable
                  key={f.id}
                  disabled={disabled}
                  onPress={() => toggleFriend(f.id)}
                  className={`flex-row items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-border" : ""} ${disabled ? "opacity-40" : ""}`}
                >
                  <PersonAvatar name={f.name} image={f.avatarUrl} size={32} />
                  <Text className="flex-1 text-[15px]">{f.name}</Text>
                  <View className={`size-6 items-center justify-center rounded-full border ${on ? "border-primary bg-primary" : "border-border"}`}>
                    {on ? <Icon as={Check} size={14} className="text-primary-foreground" /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text className="text-[12px] text-muted-foreground">{t("moments.collabHint")}</Text>
        </View>
      ) : null}

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <FormLabel>
            {withFriends ? t("moments.yourPhotoSlots", { max: photoLimit, total: slotCount }) : t("moments.sectionPhotos")}
          </FormLabel>
          <Text className="text-[13px] text-muted-foreground">
            {selectedIds.length}/{photoLimit}
          </Text>
        </View>
        <Button variant="outline" onPress={() => setPicking(true)}>
          <Icon as={ImagePlus} size={16} />
          <Text>{t("moments.pickPhotos")}</Text>
        </Button>
        {framerPhotos.length ? (
          <MomentFramer
            photos={framerPhotos}
            layout={layout}
            framings={framings}
            onFrame={(id, f) => setFramings((prev) => ({ ...prev, [id]: f }))}
            canPlace={(slot) => slot >= 0 && slot < slotCount}
            onMove={(from, to) => setCells((prev) => moveInCells(prev, from, to, slotCount))}
            width={Math.min(width - 64, 300)}
          />
        ) : null}
      </View>

      <View className="gap-2">
        <FormLabel>{t("moments.sectionCaption")}</FormLabel>
        <CaptionInput value={caption} onChange={setCaption} />
      </View>

      <View className="gap-2">
        <FormLabel>{t("moments.visibility")}</FormLabel>
        <Segments
          options={[
            { value: "circle", label: t("moments.visibilityCircle"), icon: Users },
            { value: "private", label: t("moments.visibilityPrivate"), icon: Lock },
          ]}
          value={visibility}
          onChange={setVisibility}
        />
      </View>
    </FormModal>
  );
}

function CaptionInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      maxLength={CAPTION_MAX}
      multiline
      placeholder={t("moments.captionPlaceholder")}
      placeholderTextColor={colors.mutedForeground}
      className="min-h-20 rounded-2xl border border-border bg-card px-4 py-3 font-sans text-[15px] text-foreground"
      style={{ textAlignVertical: "top" }}
    />
  );
}

function Segments<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: typeof Users }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row gap-1 rounded-2xl bg-muted/60 p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2 ${on ? "bg-background" : ""}`}
          >
            {o.icon ? <Icon as={o.icon} size={14} className={on ? "text-foreground" : "text-muted-foreground"} /> : null}
            <Text className={`text-[14px] ${on ? "font-semibold" : "text-muted-foreground"}`}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
