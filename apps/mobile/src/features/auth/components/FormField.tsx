import type { ReactNode } from "react";
import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import type { TextInputProps } from "react-native";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { fadeIn, fadeOut } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { PasswordInput } from "./PasswordInput";

type Props<T extends FieldValues> = Omit<TextInputProps, "value" | "onChangeText" | "onBlur"> & {
  control: Control<T>;
  name: Path<T>;
  label: string;
  /** Element on the right of the label (e.g. "Forgot password?"). */
  labelRight?: ReactNode;
  password?: boolean;
};

/** Label + input + translated zod error, bound to react-hook-form. */
export function FormField<T extends FieldValues>({
  control,
  name,
  label,
  labelRight,
  password,
  ...inputProps
}: Props<T>) {
  const { t } = useTranslation();
  const labelId = `field-${name}`;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const invalid = !!fieldState.error;
        const props = {
          ...inputProps,
          ref: field.ref,
          value: field.value ?? "",
          onChangeText: field.onChange,
          onBlur: field.onBlur,
          "aria-labelledby": labelId,
          "aria-invalid": invalid,
          // Translucent so the glass card shows through.
          className: cn("h-12 border-foreground/10 bg-background/60 dark:bg-background/40", invalid && "border-destructive", inputProps.className),
        };
        return (
          <View className="gap-1.5">
            <View className="flex-row items-center justify-between">
              <Label nativeID={labelId}>{label}</Label>
              {labelRight}
            </View>
            {password ? <PasswordInput {...props} /> : <Input {...props} />}
            {fieldState.error?.message ? (
              <Animated.View entering={fadeIn} exiting={fadeOut}>
                <Text role="alert" className="text-sm text-destructive">
                  {t(fieldState.error.message)}
                </Text>
              </Animated.View>
            ) : null}
          </View>
        );
      }}
    />
  );
}
