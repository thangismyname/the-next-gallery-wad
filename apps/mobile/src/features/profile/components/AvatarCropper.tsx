import { AVATAR_MAX_ZOOM, avatarCrop, type AvatarCrop, type MediaListItem } from "@tng/shared";
import { Image } from "expo-image";
import { forwardRef, useImperativeHandle, useState } from "react";
import { View } from "react-native";
import { GestureDetector, usePanGesture, usePinchGesture, useSimultaneousGestures } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

export interface AvatarCropperHandle {
  /** Current crop, or null while the photo size is unknown. */
  getCrop: () => AvatarCrop | null;
}

/** Same model as web `AvatarCropDialog` / `@tng/shared` `avatarLayout` (worklet copy of the clamp). */
function clampPan(t: number, length: number, base: number, zoom: number, view: number) {
  "worklet";
  const max = Math.max(0, (length * base * zoom - view) / 2);
  return Math.min(max, Math.max(-max, t));
}

/**
 * Crop the photo to the avatar circle: one-finger drag moves it, pinch zooms
 * (1 … AVATAR_MAX_ZOOM); the photo always covers the circle. The image is laid
 * out "cover" at zoom 1 and moved with transforms only (UI thread).
 */
export const AvatarCropper = forwardRef<AvatarCropperHandle, { media: MediaListItem; size: number }>(function AvatarCropper(
  { media, size: view },
  ref,
) {
  const [natural, setNatural] = useState(
    media.width && media.height ? { width: media.width, height: media.height } : null,
  );
  const zoom = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const saved = useSharedValue({ zoom: 1, tx: 0, ty: 0 });

  const w = natural?.width ?? 1;
  const h = natural?.height ?? 1;
  const base = view / Math.min(w, h);

  useImperativeHandle(ref, () => ({
    getCrop: () => (natural ? avatarCrop(natural, view, zoom.get(), tx.get(), ty.get()) : null),
  }));

  const pan = usePanGesture({
    maxPointers: 1,
    onActivate: () => {
      "worklet";
      saved.set({ zoom: zoom.get(), tx: tx.get(), ty: ty.get() });
    },
    onUpdate: (e) => {
      "worklet";
      tx.set(clampPan(saved.get().tx + e.translationX, w, base, zoom.get(), view));
      ty.set(clampPan(saved.get().ty + e.translationY, h, base, zoom.get(), view));
    },
  });
  const pinch = usePinchGesture({
    onActivate: () => {
      "worklet";
      saved.set({ zoom: zoom.get(), tx: tx.get(), ty: ty.get() });
    },
    onUpdate: (e) => {
      "worklet";
      const z = Math.min(AVATAR_MAX_ZOOM, Math.max(1, saved.get().zoom * e.scale));
      const k = z / saved.get().zoom;
      zoom.set(z);
      // Zoom around the image center, then keep the photo covering the circle.
      tx.set(clampPan(saved.get().tx * k, w, base, z, view));
      ty.set(clampPan(saved.get().ty * k, h, base, z, view));
    },
  });
  const gesture = useSimultaneousGestures(pan, pinch);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: zoom.get() }],
  }));

  const r = view / 2;
  return (
    <GestureDetector gesture={gesture}>
      <View className="overflow-hidden rounded-3xl bg-black" style={{ width: view, height: view }}>
        <Animated.View
          style={[
            { position: "absolute", width: w * base, height: h * base, left: (view - w * base) / 2, top: (view - h * base) / 2 },
            imageStyle,
          ]}
        >
          <Image
            source={{ uri: media.displayUrl || media.thumbnailUrlLarge || media.url }}
            placeholder={{ uri: media.thumbnailUrl }}
            contentFit="cover"
            onLoad={(e) => !natural && setNatural({ width: e.source.width, height: e.source.height })}
            style={{ width: "100%", height: "100%" }}
          />
        </Animated.View>
        {/* Circle mask: outside dimmed (even-odd square with a round hole) + a thin ring. */}
        <Svg pointerEvents="none" width={view} height={view} style={{ position: "absolute" }}>
          <Path
            d={`M0 0H${view}V${view}H0Z M${r} 0A${r} ${r} 0 1 0 ${r} ${view}A${r} ${r} 0 1 0 ${r} 0Z`}
            fill="rgba(0,0,0,0.55)"
            fillRule="evenodd"
          />
          <Circle cx={r} cy={r} r={r - 1} stroke="rgba(255,255,255,0.8)" strokeWidth={2} fill="none" />
        </Svg>
      </View>
    </GestureDetector>
  );
});
