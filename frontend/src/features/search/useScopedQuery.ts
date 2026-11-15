import { useCallback, useRef, useState } from "react";
import { parseScopedQuery, suggestScopes, type SearchScope } from "./searchScope";

/**
 * Ô tìm kiếm có phạm vi (chip Yêu thích / nhãn / album): chữ đang gõ, phạm vi đang
 * chọn, gợi ý "Tìm trong …" (↑ ↓ chọn, Tab / Enter chèn chip, Backspace ở đầu ô gỡ
 * chip) và cú pháp tắt "favorite.dog".
 */
export function useScopedQuery(scopes: SearchScope[]) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope | null>(null);
  const suggestions = scope ? [] : suggestScopes(query, scopes);
  // ↑ / ↓ chuyển gợi ý đang chọn (bỏ qua mục "Sắp có"); gõ chữ → về gợi ý đầu.
  const selectable = suggestions.filter((s) => !s.disabled);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSuggestion = selectable[Math.min(activeIndex, selectable.length - 1)];

  // Chèn / gỡ chip (hoặc bấm chuột vào gợi ý) → con trỏ về lại cuối ô nhập.
  const inputRef = useRef<HTMLInputElement>(null);
  const refocusInput = () =>
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });

  // Chữ vừa "đổi" thành chip (vd "fav"). Bộ gõ tiếng Việt chốt chữ đang gõ
  // dở khi bấm Tab → chèn lại chữ đó ngay sau khi đã xoá; bỏ qua lần chèn này.
  const consumedRef = useRef<{ text: string; until: number } | null>(null);

  const pickScope = (next: SearchScope, rest = "") => {
    if (next.disabled) return;
    consumedRef.current = { text: query, until: performance.now() + 300 };
    setScope(next);
    setQuery(rest);
    refocusInput();
  };

  const clearScope = () => {
    setScope(null);
    refocusInput();
  };

  const onChange = (value: string) => {
    setActiveIndex(0);
    const consumed = consumedRef.current;
    if (consumed && performance.now() < consumed.until && value.trim() === consumed.text.trim()) {
      consumedRef.current = null;
      setQuery("");
      return;
    }
    const parsed = scope ? null : parseScopedQuery(value, scopes);
    if (parsed) pickScope(parsed.scope, parsed.rest);
    else setQuery(value);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && selectable.length > 0) {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      const current = Math.min(activeIndex, selectable.length - 1);
      setActiveIndex((current + step + selectable.length) % selectable.length);
    } else if ((e.key === "Tab" || e.key === "Enter") && !e.shiftKey && activeSuggestion) {
      e.preventDefault();
      pickScope(activeSuggestion);
    } else if (
      e.key === "Backspace" &&
      scope &&
      e.currentTarget.selectionStart === 0 &&
      e.currentTarget.selectionEnd === 0
    ) {
      e.preventDefault();
      clearScope();
    }
  };

  /** Về trạng thái ban đầu (mở lại Spotlight). */
  const reset = useCallback(() => {
    setQuery("");
    setScope(null);
  }, []);

  /** Hover 1 gợi ý → thành gợi ý đang chọn. */
  const hover = (s: SearchScope) => !s.disabled && setActiveIndex(selectable.indexOf(s));

  return {
    query,
    setQuery,
    scope,
    suggestions,
    activeSuggestion,
    inputRef,
    pickScope,
    clearScope,
    onChange,
    onKeyDown,
    reset,
    hover,
  };
}
