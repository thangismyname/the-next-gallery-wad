/**
 * Đổi theme kèm hiệu ứng vòng tròn màu mới toả ra từ `origin` (View
 * Transitions API). Browser không hỗ trợ / không có origin → đổi thẳng.
 */
export function changeThemeWithTransition(
  apply: () => void,
  origin?: HTMLElement | null,
) {
  if (!document.startViewTransition || !origin) {
    apply();
    return;
  }

  const rect = origin.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const maxRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  const transition = document.startViewTransition(apply);

  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${maxRadius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 420,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        pseudoElement: "::view-transition-new(root)",
      },
    );
  });
}
