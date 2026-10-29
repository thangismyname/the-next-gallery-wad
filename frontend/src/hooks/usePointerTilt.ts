import { useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";

/**
 * Nghiêng 3D theo vị trí chuột trên 1 khung (lò xo cho mượt). Chỉ với chuột —
 * cảm ứng / giảm chuyển động → không nghiêng.
 * Gắn `handlers` vào khung ngoài (có perspective), `style` vào motion con.
 */
export function usePointerTilt(maxX = 10, maxY = 12) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const spring = { stiffness: 150, damping: 18 };
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-maxY, maxY]), spring);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [maxX, -maxX]), spring);

  const handlers = {
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (reduce || e.pointerType !== "mouse") return;
      const rect = e.currentTarget.getBoundingClientRect();
      px.set((e.clientX - rect.left) / rect.width - 0.5);
      py.set((e.clientY - rect.top) / rect.height - 0.5);
    },
    onPointerLeave: () => {
      px.set(0);
      py.set(0);
    },
  };
  return { handlers, style: reduce ? undefined : { rotateX, rotateY } };
}
