/**
 * Shortens a long string by keeping both ends and inserting an ellipsis.
 *
 * @param str - String to shorten.
 * @param maxLength - Optional maximum output length. Returns `str` unchanged when omitted.
 * @returns The original string or an ellipsis-shortened string no longer than `maxLength`.
 * @example
 * ```ts
 * import { formatLongString } from "@morpho-org/morpho-ts";
 *
 * const value = formatLongString("0x1234567890", 8);
 * // "0x1...90"
 * ```
 */
export function formatLongString(str: string, maxLength?: number) {
  if (maxLength == null || maxLength >= str.length) return str;
  if (maxLength <= 3) return "...";

  const nChar = maxLength - 3;

  if (nChar === 1) return `${str.slice(0, 1)}...`;

  return `${str.slice(0, Math.round(nChar / 2))}...${str.slice(-nChar / 2)}`;
}
