import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";

/** "No account? Sign up" line under a form — switches the auth tab. */
export function SwitchPrompt({ prompt, action, onPress }: { prompt: string; action: string; onPress: () => void }) {
  return (
    <View className="flex-row items-center justify-center gap-1">
      <Text className="text-[15px] text-muted-foreground">{prompt}</Text>
      <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" className="active:opacity-60">
        <Text className="text-[15px] font-medium underline">{action}</Text>
      </Pressable>
    </View>
  );
}
