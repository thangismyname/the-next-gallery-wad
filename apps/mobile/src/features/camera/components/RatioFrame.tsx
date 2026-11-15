import { StyleSheet, View } from "react-native";

import type { Rect } from "../cameraFrame";

/**
 * Darkens the preview outside `frame` (what will be cropped away) + a thin border;
 * the rule-of-thirds grid follows the frame (or the whole screen without one).
 * Pointer-transparent — gestures reach the layer underneath.
 */
export function RatioFrame({ frame, grid }: { frame: Rect | null; grid: boolean }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {frame ? (
        <>
          <View className="absolute inset-x-0 top-0 bg-black/55" style={{ height: frame.y }} />
          <View className="absolute inset-x-0 bottom-0 bg-black/55" style={{ top: frame.y + frame.height }} />
          <View className="absolute left-0 bg-black/55" style={{ top: frame.y, height: frame.height, width: frame.x }} />
          <View
            className="absolute right-0 bg-black/55"
            style={{ top: frame.y, height: frame.height, left: frame.x + frame.width }}
          />
          <View
            className="absolute rounded-sm border border-white/60"
            style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
          />
        </>
      ) : null}
      {grid ? (
        <View
          className="absolute"
          style={frame ? { left: frame.x, top: frame.y, width: frame.width, height: frame.height } : StyleSheet.absoluteFill}
        >
          {[1, 2].map((i) => (
            <View key={`v${i}`} className="absolute inset-y-0 w-px bg-white/40" style={{ left: `${(i * 100) / 3}%` }} />
          ))}
          {[1, 2].map((i) => (
            <View key={`h${i}`} className="absolute inset-x-0 h-px bg-white/40" style={{ top: `${(i * 100) / 3}%` }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
