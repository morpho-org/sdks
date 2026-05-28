type LocaleSymbols = {
  decimalSymbol: string;
  groupSymbol: string;
  locale: string;
};

/**
 * Represents a localized numeric string and the symbols used to produce it.
 */
export type LocaleParts = LocaleSymbols & {
  value: string;
};

const _convertEnNumStrToLocale = (
  numStr: string,
  localSymbols: LocaleSymbols,
) => {
  return numStr
    .replaceAll(",", "#TEMP#")
    .replaceAll(".", localSymbols.decimalSymbol)
    .replaceAll("#TEMP#", localSymbols.groupSymbol);
};

/**
 * Returns the decimal and grouping symbols for a locale.
 *
 * @param locale - Locale identifier to inspect, falling back to `en-US` when invalid.
 * @returns The decimal symbol, grouping symbol, and requested locale string.
 * @example
 * ```ts
 * import { getLocaleSymbols } from "@morpho-org/morpho-ts";
 *
 * const symbols = getLocaleSymbols("en-US");
 * // { decimalSymbol: ".", groupSymbol: ",", locale: "en-US" }
 * ```
 */
export const getLocaleSymbols = (locale: string): LocaleSymbols => {
  let formatter: Intl.NumberFormat;
  const formatterOptions = {
    useGrouping: true,
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  };

  try {
    formatter = new Intl.NumberFormat(locale, formatterOptions);
  } catch {
    formatter = new Intl.NumberFormat("en-US", formatterOptions);
  }

  const parts = formatter.formatToParts(12345.6);

  const decimalSymbol = parts.find((part) => part.type === "decimal")!.value;
  const groupSymbol = parts.find((part) => part.type === "group")!.value;

  return { decimalSymbol, groupSymbol, locale };
};

/**
 * Returns the browser locale when available.
 *
 * @returns The effective browser locale, or `en-US` outside a browser or after locale validation fails.
 * @example
 * ```ts
 * import { getEffectiveLocale } from "@morpho-org/morpho-ts";
 *
 * const locale = getEffectiveLocale();
 * // "en-US"
 * ```
 */
export const getEffectiveLocale = () => {
  if (typeof window !== "undefined") {
    try {
      const locale =
        navigator?.language || document?.documentElement?.lang || "en-US";
      new Intl.NumberFormat(locale);
      return locale;
    } catch {
      return "en-US";
    }
  }
  return "en-US";
};

/**
 * Converts a localized numeric string from one locale's separators to another.
 *
 * @param numStr - Number string formatted in the `from` locale.
 * @param from - Locale that `numStr` currently uses.
 * @param to - Locale to convert separators to.
 * @returns The numeric string with separators from the `to` locale.
 * @example
 * ```ts
 * import { convertNumStrToLocal } from "@morpho-org/morpho-ts";
 *
 * const value = convertNumStrToLocal("1,234.6", "en-US", "de-DE");
 * // "1.234,6"
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
export const convertNumStrToLocal = (
  numStr: string,
  from: string,
  to: string,
) => {
  const fromSymbols = getLocaleSymbols(from);
  const toSymbols = getLocaleSymbols(to);

  return numStr
    .replaceAll(fromSymbols.groupSymbol, "#GROUP#")
    .replaceAll(fromSymbols.decimalSymbol, "#DECIMAL#")
    .replaceAll("#GROUP#", toSymbols.groupSymbol)
    .replaceAll("#DECIMAL#", toSymbols.decimalSymbol);
};

/**
 * Converts a numeric string from the effective locale to another locale.
 *
 * @param numStr - Number string formatted in the effective browser locale.
 * @param to - Locale to convert separators to.
 * @returns The numeric string with separators from the `to` locale.
 * @example
 * ```ts
 * import { convertNumStrFromEffectiveTo } from "@morpho-org/morpho-ts";
 *
 * const value = convertNumStrFromEffectiveTo("1,234.6", "de-DE");
 * // "1.234,6" when the effective locale is `en-US`
 * ```
 */
export const convertNumStrFromEffectiveTo = (numStr: string, to: string) => {
  const from = getEffectiveLocale();
  return convertNumStrToLocal(numStr, from, to);
};

/**
 * Converts an `en-US` numeric string to localized parts.
 *
 * @param numStr - Number string formatted with `en-US` separators.
 * @param locale - Optional locale to convert to. Uses the effective browser locale when omitted.
 * @returns The localized value with the symbols and locale used for conversion.
 * @example
 * ```ts
 * import { getEnUSNumberToLocalParts } from "@morpho-org/morpho-ts";
 *
 * const parts = getEnUSNumberToLocalParts("1,234.6", "en-US");
 * // { decimalSymbol: ".", groupSymbol: ",", locale: "en-US", value: "1,234.6" }
 * ```
 */
export const getEnUSNumberToLocalParts = (
  numStr: string,
  locale?: string,
): LocaleParts => {
  const _locale = locale || getEffectiveLocale();
  const localSymbols = getLocaleSymbols(_locale);
  const value = _convertEnNumStrToLocale(numStr, localSymbols);

  return { ...localSymbols, value };
};
