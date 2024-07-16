export function formatLongString(str: string, maxLength?: number) {
  if (maxLength == null || maxLength >= str.length) return str;
  if (maxLength <= 3) return "...";

  const nChar = maxLength - 3;

  if (nChar === 1) return str.slice(0, 1) + "...";

  return str.slice(0, Math.round(nChar / 2)) + "..." + str.slice(-nChar / 2);
}
