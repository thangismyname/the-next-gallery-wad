import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { Children, Fragment, type ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

/** Inset grouped list section (iOS Settings style): title · rounded card of rows · footnote. */
export function SettingsGroup({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View className="gap-2 px-4">
      {title ? <Text className="px-4 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">{title}</Text> : null}
      <View className="overflow-hidden rounded-3xl bg-muted/60">
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 ? <View className="ml-14 h-px bg-foreground/10" /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? <Text className="px-4 text-[13px] text-muted-foreground">{footer}</Text> : null}
    </View>
  );
}

/** One row: icon · title (+ subtitle) · value / trailing · chevron when it opens something. */
export function SettingsRow({
  icon,
  iconClass,
  title,
  subtitle,
  value,
  trailing,
  chevron,
  destructive,
  busy,
  disabled,
  onPress,
  children,
}: {
  icon?: LucideIcon;
  iconClass?: string;
  title: string;
  subtitle?: string;
  value?: string;
  trailing?: ReactNode;
  chevron?: boolean;
  destructive?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  /** Extra content under the title row (e.g. a progress bar). */
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress || disabled || busy}
      onPress={onPress}
      className={cn("gap-2 px-4 py-3", onPress && "active:bg-foreground/5", disabled && "opacity-50")}
    >
      <View className="min-h-8 flex-row items-center gap-3">
        {icon ? (
          <View className="size-8 items-center justify-center">
            <Icon as={icon} size={20} className={cn(destructive ? "text-destructive" : "text-foreground", iconClass)} />
          </View>
        ) : null}
        <View className="flex-1">
          <Text className={cn("text-[16px]", destructive && "text-destructive")}>{title}</Text>
          {subtitle ? <Text className="text-[13px] text-muted-foreground">{subtitle}</Text> : null}
        </View>
        {value ? <Text className="text-[15px] text-muted-foreground">{value}</Text> : null}
        {busy ? <ActivityIndicator size="small" color={colors.mutedForeground} /> : trailing}
        {chevron ? <Icon as={ChevronRight} size={18} className="text-muted-foreground" /> : null}
      </View>
      {children ? <View className={icon ? "pl-11" : undefined}>{children}</View> : null}
    </Pressable>
  );
}

/** Pill segmented control inside a row (theme, language). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <View className="flex-row rounded-full bg-background/80 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            className={cn("h-8 flex-1 items-center justify-center rounded-full px-2", active && "bg-foreground")}
          >
            <Text numberOfLines={1} className={cn("text-[13px] font-semibold", active ? "text-background" : "text-muted-foreground")}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
