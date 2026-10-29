import { useEffect, useState } from "react";

/**
 * Gõ dần `text` từng ký tự khi `start` = true (vd khi khối lọt vào màn hình).
 * Trả { typed, done }. `instant` (giảm chuyển động) → hiện đủ ngay.
 */
export function useTypewriter(text: string, start: boolean, { speed = 45, instant = false } = {}) {
  const [count, setCount] = useState(instant ? text.length : 0);

  // Đổi ngôn ngữ → câu mới, gõ lại từ đầu.
  const [shownText, setShownText] = useState(text);
  if (shownText !== text) {
    setShownText(text);
    setCount(instant ? text.length : 0);
  }

  useEffect(() => {
    if (!start || instant || count >= text.length) return;
    const timer = setTimeout(() => setCount((c) => c + 1), speed);
    return () => clearTimeout(timer);
  }, [start, instant, count, text.length, speed]);

  return { typed: text.slice(0, count), done: count >= text.length };
}
