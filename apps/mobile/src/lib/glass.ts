import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { Platform } from "react-native";

/** Native Liquid Glass: iOS 26+ built with Xcode 26. Elsewhere use a blur / solid fallback. */
export const LIQUID_GLASS =
  Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
