import type { MomentFilter, MomentPerson } from "@tng/shared";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { UserPlus } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

import { PersonAvatar } from "@/components/shared/PersonAvatar";

/** Height of the row (pager sizing). */
export const FILTER_BAR_HEIGHT = 52;

const isPerson = (f: MomentFilter, userId: string) => typeof f === "object" && f.userId === userId;

/**
 * Who to watch (web `MomentFilterBar`): All · Me · one avatar per friend in the
 * loaded feed (newest poster first; soft foreground ring = something new). Tapping the
 * selected friend again goes back to All.
 */
export function MomentFilterBar({
  value,
  onChange,
  people,
  me,
}: {
  value: MomentFilter;
  onChange: (filter: MomentFilter) => void;
  people: MomentPerson[];
  me: { name: string; image: string | null } | null;
}) {
  const { t } = useTranslation();
  const pick = (f: MomentFilter) => {
    void Haptics.selectionAsync();
    onChange(f);
  };
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={t("moments.filter")}
      contentContainerClassName="items-center gap-2 px-4"
      style={{ height: FILTER_BAR_HEIGHT, flexGrow: 0 }}
    >
      <Pill active={value === "all"} onPress={() => pick("all")} label={t("moments.filterAll")} />
      {me ? (
        <Pill active={value === "me"} onPress={() => pick("me")} label={t("moments.you")}>
          <PersonAvatar name={me.name} image={me.image} size={22} />
        </Pill>
      ) : null}
      {people.length ? <View className="mx-1 h-5 w-px bg-border" /> : null}
      {people.map((p) => {
        const active = isPerson(value, p.userId);
        return (
          <Pressable
            key={p.userId}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={p.unseen ? `${p.userName} · ${t("moments.new")}` : p.userName}
            onPress={() => pick(active ? "all" : { userId: p.userId })}
            className={cn(
              "rounded-full border-2 p-0.5",
              active ? "border-foreground" : p.unseen ? "border-foreground/45" : "border-transparent",
            )}
          >
            <PersonAvatar name={p.userName} image={p.userAvatarUrl} size={34} />
          </Pressable>
        );
      })}
      {/* Add friends (→ Friends · Add) — more people, more moments. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("friends.addTitle")}
        onPress={() => router.push({ pathname: "/friends", params: { tab: "add" } })}
        className="size-[38px] items-center justify-center rounded-full border border-dashed border-border active:opacity-60"
      >
        <Icon as={UserPlus} size={17} className="text-muted-foreground" />
      </Pressable>
    </ScrollView>
  );
}

function Pill({
  active,
  onPress,
  label,
  children,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      className={cn(
        "h-9 flex-row items-center gap-1.5 rounded-full border px-3.5",
        active ? "border-foreground bg-foreground" : "border-border bg-background/70",
        children ? "pl-1.5" : null,
      )}
    >
      {children}
      <Text className={cn("text-[14px] font-semibold", active ? "text-background" : "text-muted-foreground")}>{label}</Text>
    </Pressable>
  );
}
