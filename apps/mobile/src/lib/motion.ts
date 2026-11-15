import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  withTiming,
  type EntryExitAnimationFunction,
  type WithTimingConfig,
} from "react-native-reanimated";

/**
 * Shared motion for the app — same rhythm as the web (`frontend/src/lib/motion.ts`):
 * fast, functional, never makes the user wait. **No overshoot / bounce** — things
 * glide to their place with an ease-out, like system UI. Everything follows the
 * system "Reduce Motion" setting.
 */
export const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

/** ms — fast 150 / base 220 / slow 320 (web APP_DURATION). */
export const APP_DURATION = { fast: 150, base: 220, slow: 320 } as const;

/** Press feedback (scale down while touching). */
export const PRESS_TIMING: WithTimingConfig = {
  duration: 120,
  easing: EASE_OUT,
  reduceMotion: ReduceMotion.System,
};
/** Something gliding to a new place (tab indicator). */
export const SLIDE_TIMING: WithTimingConfig = {
  duration: APP_DURATION.base,
  easing: EASE_OUT,
  reduceMotion: ReduceMotion.System,
};

// ── Layout animations (`entering` / `exiting` / `layout` props) ──────────────

/** Plain fade in. */
export const fadeIn = FadeIn.duration(APP_DURATION.base).easing(EASE_OUT);
/** Fade out (quicker than in, so replaced content gets out of the way). */
export const fadeOut = FadeOut.duration(APP_DURATION.fast);
/** Fade in while rising 8px — new content / swapped form / success state. */
export const riseIn = FadeInDown.duration(APP_DURATION.slow)
  .easing(EASE_OUT)
  .withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] });
/** Siblings moving when something above changes height. */
export const layoutGlide = LinearTransition.duration(APP_DURATION.base).easing(EASE_OUT);

/*
 * ⚠ Liquid Glass (iOS 26 UIGlassEffect) stops rendering when the glass view or
 * ANY ancestor has opacity < 1 — never fade (opacity-animate) a view that
 * contains a GlassView. Animate transform only, let the glass appear natively
 * (`GlassPanel materialize`), and fade the content *inside* the glass.
 */

/**
 * Floating menu opening from its button (set `transformOrigin` on the panel to the
 * button's corner): grow from 90% + drop 6px, no opacity (see ⚠ above) — the glass
 * itself materializes natively.
 */
export const menuIn: EntryExitAnimationFunction = () => {
  "worklet";
  const timing = { duration: APP_DURATION.base, easing: EASE_OUT, reduceMotion: ReduceMotion.System };
  return {
    initialValues: { transform: [{ translateY: -6 }, { scale: 0.9 }] },
    animations: { transform: [{ translateY: withTiming(0, timing) }, { scale: withTiming(1, timing) }] },
  };
};

/** Menu closing: quick shrink back toward the button (no opacity, see ⚠ above). */
export const menuOut: EntryExitAnimationFunction = () => {
  "worklet";
  const timing = { duration: APP_DURATION.fast, easing: EASE_OUT, reduceMotion: ReduceMotion.System };
  return {
    initialValues: { transform: [{ translateY: 0 }, { scale: 1 }] },
    animations: { transform: [{ translateY: withTiming(-4, timing) }, { scale: withTiming(0.85, timing) }] },
  };
};
