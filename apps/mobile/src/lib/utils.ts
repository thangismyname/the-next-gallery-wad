import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Lift of the active item in a segmented control (`shadow-sm shadow-black/10`).
 * ⚠ Pass it as `style`, never as a class added conditionally: NativeWind
 * "upgrades" a component whose className gains shadow / transition / animation
 * classes after its first render and its upgrade warning stringifies the props →
 * infinite recursion (crash). Toggle colors with classes, shadows with `style`.
 */
export const SEGMENT_SHADOW = {
  shadowColor: 'black',
  shadowOpacity: 0.1,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
} as const;
