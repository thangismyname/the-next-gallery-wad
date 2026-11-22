import { framingRect, type MomentFraming } from "@tng/shared";
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/**
 * Photo / video placed in its moment frame like the web CSS (cover + object-position + zoom):
 * children fill an absolutely positioned box from `framingRect`. Works for VideoView too, which has
 * no object-position. No framing / size yet → children just fill the frame (centre crop).
 */
export function Framed({
  framing,
  media,
  children,
}: {
  framing?: MomentFraming | null;
  /** Pixel size of the photo / video (only its aspect matters). */
  media?: { width: number; height: number } | null;
  children: ReactNode;
}) {
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const rect = framing && media?.width && media.height && frame?.width ? framingRect(framing, frame, media) : null;
  return (
    <View
      style={StyleSheet.absoluteFill}
      className="overflow-hidden"
      pointerEvents="box-none"
      onLayout={(e) => setFrame(e.nativeEvent.layout)}
    >
      <View style={rect ? { position: "absolute", ...rect } : StyleSheet.absoluteFill} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}
