import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError, albumQueryKey, albumsQueryKey, type Album, type SmartRule } from "@tng/shared";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { CircleAlert, Images, Search, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/shared/GlassButton";
import { Button } from "@/components/ui/button";
import { FilterField } from "@/components/shared/FilterField";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { TAG_GROUPS, TAG_ICONS, normalize } from "@/features/studio/tagCatalog";
import { useTagCatalog } from "@/features/studio/useTagCatalog";
import { useTheme } from "@/hooks/useTheme";
import { SEGMENT_SHADOW, cn } from "@/lib/utils";
import { albumsApi } from "@/services";

const MAX_TAGS = 3;
const MAX_LABEL_MATCHES = 24;
const EMPTY_RULE: SmartRule = { type: "tags", tags: [], minConfidence: null };
/** Confidence options of a tag rule: null = each tag's own (calibrated) threshold. */
const THRESHOLDS: (number | null)[] = [null, 0.5, 0.7, 0.9];
const PREVIEW_DELAY = 400;

const isRuleValid = (rule: SmartRule) => (rule.type === "tags" ? rule.tags.length > 0 : rule.query.trim().length > 0);

/** What the backend accepts (trimmed query) — also the preview cache key. */
const cleanRule = (rule: SmartRule): SmartRule =>
  rule.type === "tags" ? rule : { type: "query", query: rule.query.trim() };

/** `value` once it stopped changing for `delay` ms (typing a query, toggling chips). */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Server message (4xx: what is wrong, e.g. a field) instead of a generic "failed". */
function describeError(error: unknown, fallback: string): string {
  if (!(error instanceof HttpError) || error.status === 0 || error.status >= 500) return fallback;
  const details = (error.payload as { error?: { details?: { field: string; message: string }[] } })?.error?.details;
  const detail = details?.length ? ` (${details.map((d) => d.field || d.message).join(", ")})` : "";
  return `${error.message}${detail}`;
}

/**
 * Create / edit an album (web `AlbumFormDialog`), modal route `/album-form`
 * (`?id=` = edit). Kind (manual / smart, create only) · name · description ·
 * smart rule = content tags (17 categories + detailed labels, photos must have
 * ALL, ≤ 3) or a search sentence like Spotlight. New album → opens it.
 */
export function AlbumFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useQuery({
    queryKey: albumQueryKey(id ?? ""),
    queryFn: () => albumsApi.fetchAlbum(id!),
    enabled: !!id,
  });
  if (id && !existing.data) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }
  return <AlbumForm album={existing.data} />;
}

function AlbumForm({ album }: { album?: Album }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [name, setName] = useState(album?.name ?? "");
  const [description, setDescription] = useState(album?.description ?? "");
  const [kind, setKind] = useState<Album["kind"]>(album?.kind ?? "manual");
  const [rule, setRule] = useState<SmartRule>(album?.smartRule ?? EMPTY_RULE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const smart = kind === "smart";
  const canSave = name.trim().length > 0 && (!smart || isRuleValid(rule)) && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    let saved: Album;
    try {
      saved = album
        ? await albumsApi.updateAlbum(album.id, {
            name: name.trim(),
            description: description.trim() || null,
            ...(album.kind === "smart" ? { smartRule: cleanRule(rule) } : {}),
          })
        : await albumsApi.createAlbum({
            name: name.trim(),
            description: description.trim() || undefined,
            ...(smart ? { smartRule: cleanRule(rule) } : { mediaIds: [] }),
          });
    } catch (err) {
      setError(describeError(err, t("albums.saveFailed")));
      setSaving(false);
      return;
    }
    // Saved — refresh caches in the background (a slow smart-album list must not
    // block or "fail" the save), then leave the modal.
    void queryClient.invalidateQueries({ queryKey: albumsQueryKey });
    router.back();
    // New album: open it from the screen under the modal (replacing the modal itself
    // would keep the album inside the modal presentation).
    if (!album) router.push({ pathname: "/albums/[id]", params: { id: saved.id } });
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View
        className="flex-row items-center gap-3 px-4 pb-3"
        style={{ paddingTop: Platform.OS === "ios" ? 16 : insets.top + 12 }}
      >
        <GlassButton size={40} accessibilityLabel={t("common.cancel")} onPress={() => router.back()}>
          <Icon as={X} size={20} />
        </GlassButton>
        <Text className="flex-1 text-center text-[17px] font-semibold">
          {album ? t("albums.editTitle") : t("albums.createTitle")}
        </Text>
        <Button size="sm" className="rounded-full px-4" disabled={!canSave} onPress={() => void save()}>
          {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : null}
          <Text>{album ? t("albums.save") : t("albums.create")}</Text>
        </Button>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerClassName="gap-6 px-4 pt-2"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        <Text className="text-[14px] text-muted-foreground">{smart ? t("albums.smart.desc") : t("albums.createDesc")}</Text>

        {!album ? (
          <Field label={t("albums.kind")}>
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: "manual", label: t("albums.kindManual") },
                { value: "smart", label: t("albums.kindSmart") },
              ]}
            />
          </Field>
        ) : null}

        <Field label={t("albums.name")}>
          <Input
            value={name}
            onChangeText={setName}
            maxLength={255}
            autoFocus={!album}
            placeholder={t("albums.namePlaceholder")}
            returnKeyType="done"
            className="h-12 rounded-2xl text-[16px]"
          />
        </Field>
        <Field label={t("albums.description")}>
          <Input
            value={description}
            onChangeText={setDescription}
            maxLength={2000}
            multiline
            className="min-h-20 rounded-2xl py-3 text-[16px]"
            style={{ textAlignVertical: "top" }}
          />
        </Field>

        {smart ? <SmartRuleFields value={rule} onChange={setRule} /> : null}
        {smart ? <SmartPreview rule={rule} /> : null}
        {error ? (
          <View accessibilityRole="alert" className="flex-row items-start gap-2 rounded-2xl bg-destructive/10 px-3.5 py-3">
            <Icon as={CircleAlert} size={16} className="mt-0.5 text-destructive" />
            <Text className="flex-1 text-[14px] text-destructive">{error}</Text>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Smart rule (web `SmartRuleFields`): content tags (ALL must match, ≤ 3) or a search sentence. */
function SmartRuleFields({ value, onChange }: { value: SmartRule; onChange: (rule: SmartRule) => void }) {
  const { t } = useTranslation();
  const catalog = useTagCatalog();
  const [labelFilter, setLabelFilter] = useState("");
  const selected = useMemo(() => (value.type === "tags" ? value.tags : []), [value]);
  const { labels, labelName } = catalog;

  // Chosen labels always show; typing finds more (current language + English, accents ignored).
  const labelMatches = useMemo(() => {
    const q = normalize(labelFilter);
    const chosen = labels.filter((l) => selected.includes(l.id));
    if (!q) return chosen;
    const found = labels.filter(
      (l) => !selected.includes(l.id) && (normalize(labelName(l)).includes(q) || normalize(l.names.en).includes(q)),
    );
    return [...chosen, ...found.slice(0, MAX_LABEL_MATCHES)];
  }, [labels, labelName, labelFilter, selected]);

  const full = selected.length >= MAX_TAGS;
  // At the limit, other chips are disabled (no longer silently dropping the oldest pick).
  const toggleTag = (tag: string) => {
    if (value.type !== "tags") return;
    if (value.tags.includes(tag)) onChange({ ...value, tags: value.tags.filter((x) => x !== tag) });
    else if (!full) onChange({ ...value, tags: [...value.tags, tag] });
  };
  const tagName = (tag: string) => catalog.describe(tag)?.name ?? tag;

  return (
    <View className="gap-5">
      <Field label={t("albums.smart.ruleType")}>
        <Segmented
          value={value.type}
          onChange={(type) =>
            onChange(type === "tags" ? { type: "tags", tags: [], minConfidence: null } : { type: "query", query: "" })
          }
          options={[
            { value: "tags", label: t("albums.smart.byTags") },
            { value: "query", label: t("albums.smart.byQuery") },
          ]}
        />
      </Field>

      {value.type === "tags" ? (
        <View className="gap-4">
          <Text className="text-[13px] text-muted-foreground">{t("albums.smart.tagsHint", { max: MAX_TAGS })}</Text>

          {/* Picked tags (remove with ×) + n / 3. */}
          <View className="gap-2 rounded-2xl border border-border bg-card p-3">
            <Text className="text-[13px] font-medium text-muted-foreground">
              {t("albums.smart.selected", { n: selected.length, max: MAX_TAGS })}
            </Text>
            {selected.length ? (
              <View className="flex-row flex-wrap gap-2">
                {selected.map((tag) => (
                  <Pressable
                    key={tag}
                    accessibilityRole="button"
                    accessibilityLabel={t("albums.smart.removeTag", { name: tagName(tag) })}
                    onPress={() => toggleTag(tag)}
                    className="flex-row items-center gap-1 rounded-full bg-foreground py-1.5 pl-3 pr-2 active:opacity-70"
                  >
                    <Text className="text-[14px] text-background">{tagName(tag)}</Text>
                    <Icon as={X} size={14} className="text-background" />
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text className="text-[14px] text-muted-foreground">{t("albums.smart.noneSelected")}</Text>
            )}
            {full ? <Text className="text-[12px] text-muted-foreground">{t("albums.smart.maxReached", { max: MAX_TAGS })}</Text> : null}
          </View>

          <Field label={t("albums.smart.threshold")}>
            <Segmented
              value={String(value.minConfidence)}
              onChange={(v) => onChange({ ...value, minConfidence: v === "null" ? null : Number(v) })}
              options={THRESHOLDS.map((th) => ({
                value: String(th),
                label: th === null ? t("studio.thresholdAuto") : `≥ ${Math.round(th * 100)}%`,
              }))}
            />
            <Text className="text-[13px] text-muted-foreground">{t("albums.smart.thresholdHint")}</Text>
          </Field>

          {TAG_GROUPS.map(({ group, tags }) => (
            <View key={group} className="gap-2">
              <Text className="text-[13px] font-medium text-muted-foreground">{t(`studio.groups.${group}.title`)}</Text>
              <View className="flex-row flex-wrap gap-2">
                {tags.map((tag) => (
                  <Chip
                    key={tag}
                    active={selected.includes(tag)}
                    disabled={full && !selected.includes(tag)}
                    onPress={() => toggleTag(tag)}
                    icon={TAG_ICONS[tag]}
                    name={t(`studio.tags.${tag}`)}
                  />
                ))}
              </View>
            </View>
          ))}
          {labels.length ? (
            <View className="gap-2">
              <FilterField value={labelFilter} onChangeText={setLabelFilter} placeholder={t("albums.smart.labelFilter", { n: labels.length })} className="rounded-full" />
              <View className="flex-row flex-wrap gap-2">
                {labelMatches.map((l) => (
                  <Chip
                    key={l.id}
                    active={selected.includes(l.id)}
                    disabled={full && !selected.includes(l.id)}
                    onPress={() => toggleTag(l.id)}
                    icon={catalog.describe(l.id)?.icon ?? Search}
                    name={labelName(l)}
                  />
                ))}
              </View>
              {labelFilter.trim() && labelMatches.length === selected.filter((x) => x.startsWith("oi.")).length ? (
                <Text className="text-[13px] text-muted-foreground">{t("studio.labels.noMatch")}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : (
        <Field label={t("albums.smart.query")}>
          <Input
            value={value.query}
            onChangeText={(query) => onChange({ type: "query", query })}
            maxLength={120}
            placeholder={t("albums.smart.queryPlaceholder")}
            className="h-12 rounded-2xl text-[16px]"
          />
          <Text className="text-[13px] text-muted-foreground">{t("albums.smart.queryHint")}</Text>
        </Field>
      )}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-[14px] font-medium">{label}</Text>
      {children}
    </View>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <View className="flex-row rounded-full bg-muted p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            className={cn("h-9 flex-1 items-center justify-center rounded-full", active && "bg-background")}
            style={active ? SEGMENT_SHADOW : undefined}
          >
            <Text className={cn("text-[14px] font-semibold", !active && "text-muted-foreground")}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Chip({
  active,
  disabled,
  onPress,
  icon,
  name,
}: {
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  icon: typeof Search;
  name: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 active:opacity-70",
        active ? "border-foreground bg-foreground" : "border-border bg-card",
        disabled && "opacity-40",
      )}
    >
      <Icon as={icon} size={14} className={active ? "text-background" : "text-muted-foreground"} />
      <Text className={cn("text-[14px]", active ? "text-background" : "text-foreground")}>{name}</Text>
    </Pressable>
  );
}

/**
 * Live result of the rule (debounced): how many photos match now + the first few,
 * so an empty album is caught before saving ("loosen the threshold / drop a tag").
 */
function SmartPreview({ rule }: { rule: SmartRule }) {
  const { t } = useTranslation();
  const valid = isRuleValid(rule);
  const debounced = useDebounced(cleanRule(rule), PREVIEW_DELAY);
  const preview = useQuery({
    queryKey: ["smartPreview", debounced],
    queryFn: () => albumsApi.previewSmartRule(debounced),
    enabled: valid && isRuleValid(debounced),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });
  if (!valid) return null;
  const data = preview.data;
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-3.5">
      <View className="flex-row items-center gap-2">
        <Icon as={Images} size={16} className="text-muted-foreground" />
        <Text className="flex-1 text-[14px] font-medium">
          {preview.isError
            ? t("albums.smart.previewFailed")
            : data
              ? t("albums.smart.previewCount", { n: data.total })
              : t("albums.smart.previewLoading")}
        </Text>
        {preview.isFetching ? <ActivityIndicator size="small" /> : null}
      </View>
      {data?.thumbnails.length ? (
        <View className="flex-row gap-2">
          {data.thumbnails.map((th) => (
            <Image key={th.id} source={{ uri: th.url }} contentFit="cover" style={{ width: 64, height: 64, borderRadius: 12 }} />
          ))}
        </View>
      ) : null}
      {data && data.total === 0 && !preview.isFetching ? (
        <Text className="text-[13px] text-muted-foreground">
          {rule.type === "tags" ? t("albums.smart.previewEmptyTags") : t("albums.smart.previewEmptyQuery")}
        </Text>
      ) : null}
    </View>
  );
}
