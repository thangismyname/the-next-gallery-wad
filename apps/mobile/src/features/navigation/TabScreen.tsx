import type { ReactNode } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";

import { AppHeader } from "./AppHeader";
import { useTabContentInsets } from "./layout";
import { useHeaderScroll } from "./useHeaderScroll";
import { useTabEnterStyle } from "./useTabEnterStyle";

/**
 * Tab screen = collapsing glass header + a scroll view whose content runs under
 * the header and the floating BottomBar. For a list (FlashList) use
 * `useHeaderScroll` + `useTabContentInsets` + `<AppHeader>` directly.
 */
export function TabScreen({ title, children }: { title?: string; children: ReactNode }) {
  const { scrollY, onScroll } = useHeaderScroll();
  const insets = useTabContentInsets();
  const enterStyle = useTabEnterStyle();
  return (
    <View className="flex-1 bg-background">
      <Animated.ScrollView
        style={enterStyle}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerClassName="grow"
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        {children}
      </Animated.ScrollView>
      <AppHeader scrollY={scrollY} title={title} />
    </View>
  );
}
