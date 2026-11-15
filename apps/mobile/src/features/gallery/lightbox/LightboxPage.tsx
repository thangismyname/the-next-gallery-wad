import type { MediaListItem } from "@tng/shared";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { memo } from "react";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { DetectionOverlay } from "./DetectionOverlay";
import { fitRect } from "./geometry";
import { mediaSources } from "./sources";
import { PAGE_GAP, type ViewerValues } from "./useViewerGestures";

/** How the current photo moves out of the way of the info sheet: lift + shrink. */
export interface InfoLayout {
  /** Top of the free area (below the top bar) and its height above the sheet. */
  top: number;
  height: number;
}

/**
 * One viewer page, absolutely positioned from shared values only — paging,
 * zoom, dismiss drag and the info lift all run on the UI thread, and the page
 * never re-renders for them (memo + stable props).
 */
export const LightboxPage = memo(function LightboxPage({
  item,
  pageIndex,
  width,
  height,
  values,
  hiRes,
  playing,
  infoLayout,
  onLoaded,
  detections,
}: {
  item: MediaListItem;
  pageIndex: number;
  width: number;
  height: number;
  values: ViewerValues;
  /** Show the original instead of the `display` image (deep zoom). */
  hiRes: boolean;
  /** Current video page → mount the player (one player at a time). */
  playing: boolean;
  infoLayout: InfoLayout;
  onLoaded: (id: string) => void;
  /** Developer Mode, current page: draw its YOLO boxes. */
  detections?: boolean;
}) {
  const base = fitRect(item.width, item.height, width, height);
  const sources = mediaSources(item);
  // Photo above the info sheet: centered in the free area, shrunk to fit it.
  const infoScale = Math.min(1, infoLayout.height / base.height);
  const infoLift = height / 2 - (infoLayout.top + infoLayout.height / 2);

  const style = useAnimatedStyle(() => {
    const i = values.index.get();
    const offset = (pageIndex - i) * (width + PAGE_GAP) + values.pagerX.get();
    if (pageIndex !== i) return { transform: [{ translateX: offset }] };
    const info = values.info.get();
    const shrink = (1 - values.dismiss.get() * 0.35) * (1 - info * (1 - infoScale));
    return {
      transform: [
        { translateX: offset + values.tx.get() + values.dismissX.get() },
        { translateY: values.ty.get() + values.dismissY.get() - info * infoLift },
        { scale: values.scale.get() * shrink },
      ],
    };
  });

  const showOriginal = hiRes && !!sources.original;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[{ position: "absolute", left: base.x, top: base.y, width: base.width, height: base.height }, style]}
    >
      {item.mediaType === "video" && playing ? (
        <VideoPlayer url={item.url} />
      ) : (
        <Image
          source={{ uri: showOriginal ? sources.original! : sources.display }}
          // The smaller image stays visible while the bigger one loads (no flash).
          placeholder={{ uri: showOriginal ? sources.display : sources.thumb }}
          placeholderContentFit="contain"
          contentFit="contain"
          transition={0}
          cachePolicy="memory-disk"
          onLoad={() => onLoaded(item.id)}
          style={{ width: "100%", height: "100%" }}
        />
      )}
      {detections && item.mediaType !== "video" ? <DetectionOverlay mediaId={item.id} /> : null}
    </Animated.View>
  );
});

/** Native controls (scrub, mute, fullscreen); starts playing when mounted. */
function VideoPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });
  return <VideoView player={player} nativeControls contentFit="contain" style={{ width: "100%", height: "100%" }} />;
}
