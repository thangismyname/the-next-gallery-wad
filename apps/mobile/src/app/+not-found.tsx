import { Link, Stack } from "expo-router";
import { View } from "react-native";

import { Text } from "@/components/ui/text";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!", headerShown: true }} />
      <View className="flex-1 items-center justify-center bg-background p-5">
        <Text className="font-heading text-xl font-semibold">This screen doesn&apos;t exist.</Text>
        <Link href="/" className="mt-4 py-4">
          <Text className="text-sm text-muted-foreground underline">Go to home screen</Text>
        </Link>
      </View>
    </>
  );
}
