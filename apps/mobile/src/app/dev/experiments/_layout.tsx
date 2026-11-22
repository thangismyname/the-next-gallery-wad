import { Stack } from "expo-router";

/** Experiments tab: list → detail pushed inside the tab (the tab bar stays). */
export default function DevExperimentsLayout() {
  return <Stack screenOptions={{ headerShown: false, fullScreenGestureEnabled: true }} />;
}
