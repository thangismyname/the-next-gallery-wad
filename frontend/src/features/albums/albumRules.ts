import { type SmartRule } from "@tng/shared";

/** Truy vấn album thông minh đủ để lưu chưa (có ít nhất 1 tag / câu không rỗng). */
export function isSmartRuleValid(rule: SmartRule): boolean {
  return rule.type === "tags"
    ? rule.tags.length > 0
    : rule.query.trim().length > 0;
}
