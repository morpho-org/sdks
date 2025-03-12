import { getEnUSNumberToLocalParts } from "../locale";

/**
 * Enum representing the available formatter types.
 */
export enum Format {
  number = "number",
  commas = "commas",
  short = "short",
  hex = "hex",
  percent = "percent",
}

interface UniversalFormatOptions {
  format: Format;
  default?: string;
}

interface BaseFormatOptions extends UniversalFormatOptions {
  digits?: number;
  removeTrailingZero?: boolean;
  min?: number;
  max?: number;
  sign?: boolean;
  unit?: string;
  readable?: boolean;
  locale?: string;
}

interface FormatShortOptions extends BaseFormatOptions {
  format: Format.short;
  smallValuesWithCommas?: boolean;
}
interface FormatHexOptions extends UniversalFormatOptions {
  format: Format.hex;
  prefix?: boolean;
}
interface FormatCommasOptions extends BaseFormatOptions {
  format: Format.commas;
}
interface FormatNumberOptions extends BaseFormatOptions {
  format: Format.number;
}

interface FormatPercentOptions extends BaseFormatOptions {
  format: Format.percent;
}

type FormatOptions =
  | FormatHexOptions
  | FormatShortOptions
  | FormatNumberOptions
  | FormatCommasOptions
  | FormatPercentOptions;

declare global {
  interface String {
    insert(index: number, substr: string, fillWith?: string): string;
  }
}

String.prototype.insert = function (index, substr, fillWith) {
  if (index < 0) index = this.length + index;

  let filler = "";
  if (index < 0) {
    if (fillWith) filler = fillWith.repeat(-index).slice(index);
    index = 0;
  }
  return this.slice(0, index) + substr + filler + this.slice(index);
};

const RANGES = [
  {
    minDecimals: 24,
    symbol: "Y",
  },
  {
    minDecimals: 21,
    symbol: "Z",
  },
  {
    minDecimals: 18,
    symbol: "E",
  },
  {
    minDecimals: 15,
    symbol: "P",
  },
  {
    minDecimals: 12,
    symbol: "T",
  },
  {
    minDecimals: 9,
    symbol: "B",
  },
  {
    minDecimals: 6,
    symbol: "M",
  },
  {
    minDecimals: 4,
    power: 3,
    symbol: "k",
  },
];
const _formatShort = (
  bi: bigint,
  decimals: number,
  formatOptions: Omit<FormatShortOptions, "format">,
) => {
  const stringValue = bi.toString();
  const params = RANGES.find(
    (range) => stringValue.length > range.minDecimals + decimals,
  );
  if (params) {
    return (
      _applyOptions(
        stringValue.insert(
          -((params.power ?? params.minDecimals) + decimals),
          ".",
          "0",
        ),
        formatOptions,
      ) + params.symbol
    );
  }
  if (formatOptions.smallValuesWithCommas) {
    return _formatCommas(bi, decimals, formatOptions);
  }
  return _applyOptions(
    decimals ? stringValue.insert(-decimals, ".", "0") : stringValue,
    formatOptions,
  );
};

const _formatCommas = (
  bi: bigint,
  decimals: number,
  formatOptions: Omit<FormatCommasOptions, "format">,
) => {
  const stringValue = decimals
    ? bi.toString().insert(-decimals, ".", "0")
    : bi.toString();

  const [wholePart, decimalPart] = stringValue.split(".");

  return _applyOptions(
    wholePart!
      .split("")
      .reduce(
        (formattedNumber, digit, i, arr) =>
          `${formattedNumber}${!i || (arr.length - i) % 3 ? "" : ","}${digit}`,
        "",
      ) + (decimalPart ? `.${decimalPart}` : ""),
    formatOptions,
  );
};

const _formatNumber = (
  bi: bigint,
  decimals: number,
  formatOptions: Omit<FormatNumberOptions, "format">,
) => {
  if (decimals === 0) return _applyOptions(bi.toString(), formatOptions);
  return _applyOptions(
    bi.toString().insert(-decimals, ".", "0"),
    formatOptions,
  );
};

const _withUnit = (value: string, unit?: string) => {
  if (!unit) return value;
  switch (unit) {
    case "$":
      return `$${value}`;
    case "":
    case "%":
      return `${value}${unit}`;
    default:
      return `${value} ${unit}`;
  }
};

const _applyOptions = (
  value: string,
  formatOptions: Omit<BaseFormatOptions, "format">,
) => {
  let [wholePart, decimalPart = ""] = value.split(".");
  const isZero = value.match(/[1-9]/)?.index === undefined;

  if (formatOptions.digits !== undefined) {
    decimalPart = decimalPart + "0".repeat(formatOptions.digits);
    decimalPart = decimalPart.slice(0, formatOptions.digits);
  }

  if (formatOptions.removeTrailingZero) {
    decimalPart = decimalPart.replace(/\.?0+$/, "");
  }

  value = (wholePart || "0") + (decimalPart ? `.${decimalPart}` : "");

  const { value: _value, decimalSymbol } = getEnUSNumberToLocalParts(
    value,
    formatOptions.locale,
  );
  value = _value;

  const firstNonZero = value.match(/[1-9]/);
  if (
    firstNonZero?.index === undefined &&
    formatOptions.digits &&
    !isZero &&
    formatOptions.readable
  )
    return `< 0${decimalSymbol}${"0".repeat(formatOptions.digits - 1)}1`;

  return value;
};

function formatBI(
  bi: bigint,
  decimals: number,
  formatOptions: FormatOptions = { format: Format.hex },
): string {
  if (formatOptions.format === Format.hex)
    return (formatOptions.prefix ? "0x" : "") + bi.toString(16);

  if (formatOptions.max != null) {
    const maxBI = BigInt(formatOptions.max.toFixed(decimals).replace(".", ""));
    if (bi > maxBI) return `> ${formatBI(maxBI, decimals, formatOptions)}`;
  }

  if (formatOptions.min != null) {
    const minBI = BigInt(formatOptions.min.toFixed(decimals).replace(".", ""));
    if (bi < minBI && bi !== 0n)
      return `< ${formatBI(minBI, decimals, formatOptions)}`;
  }

  let value: string;
  const isNegative = bi < 0n;
  const absBI = bi > 0n ? bi : -bi;

  switch (formatOptions.format) {
    case Format.commas:
      value = _formatCommas(absBI, decimals, formatOptions);
      break;
    case Format.number:
      value = _formatNumber(absBI, decimals, formatOptions);
      break;
    case Format.short:
      value = _formatShort(absBI, decimals, formatOptions);
      break;
    case Format.percent:
      value = _formatNumber(absBI * 100n, decimals, formatOptions);
      break;
  }

  return (
    (isNegative && !/^0\.0+$/.test(value)
      ? "-"
      : formatOptions.sign
        ? "+"
        : "") + _withUnit(value, formatOptions.unit)
  );
}

type FormatterWithDefault<F extends BaseFormatter> = {
  of(
    value: bigint | null | undefined,
    decimals: number | null | undefined,
  ): string;
  of(value: number | null | undefined): string;
} & {
  [K in keyof Omit<F, "of">]: F[K] extends (...args: infer A) => F
    ? (...args: A) => FormatterWithDefault<F>
    : F[K];
};

/**
 * Abstract base class for formatters.
 */
export abstract class BaseFormatter {
  protected abstract _options: Readonly<FormatOptions>;

  protected abstract _clone(_options: FormatOptions): this;

  /**
   * Sets a default value for the formatter. If the provided value is `undefined` or `null`,
   * the method returns the current instance without modifying it. Otherwise, it creates
   * a new formatter instance with the specified default value.
   *
   * @param _d - The default value to set. Accepts a string or `undefined`/`null`.
   * @returns A new formatter instance with the updated default value, or the current instance
   *          if `_d` is `undefined` or `null`.
   *
   * @overload
   * - `default(_d: string): FormatterWithDefault<this>;`
   * - `default(_d: string | undefined | null): this;`
   *
   * @example
   * const formatter = new Formatter();
   * const updatedFormatter = formatter.default("N/A");
   *
   * console.log(updatedFormatter.of(null)); // Outputs: "N/A"
   */
  default(_d: string): FormatterWithDefault<this>;
  default(_d: string | undefined | null): this;
  default(_d: string | undefined | null) {
    if (_d == null) return this;
    const newOptions = { ...this._options, default: _d };

    return this._clone(newOptions) as FormatterWithDefault<this>;
  }

  /**
   * Creates a bound version of the `of` method, retaining the current formatter options.
   *
   * @returns A bound `of` function.
   */
  createOf() {
    return this.of.bind({ _options: { ...this._options } });
  }

  /**
   * Formats a given value according to the formatter's configuration.
   *
   * @param value - The value to format. It can be:
   *  - A `bigint` for precise numeric representation.
   *  - A `number` for floating-point or scientific notation input.
   *  - `null` or `undefined`, in which case the method will retain the nullability of the input unless a default value is set.
   *
   * @param decimals - If input value is a bigint. It can be  `null` or `undefined`, in which case the method will retain the nullability of the input unless a default value is set.
   *
   * @returns The formatted value as a string, or:
   *  - The default value `value` or `decimals` is `null` or `undefined`.
   *  - `null`or `undefined` in case `value` or `decimals` is `null` or `undefined` and no default value is set
   *
   * @example
   * // Example with bigint input
   * console.log(formatter.of(123456789n, 2)); // Output: "1234567.89"
   *
   * @example
   * // Example with number input
   * console.log(formatter.of(123.45)); // Output: "123.45"
   *
   * @example
   * // Handling null or undefined
   * console.log(formatter.of(null, 2)); // Output: null
   */
  of<T extends bigint | null | undefined, D extends number | null | undefined>(
    value: T,
    decimals: D,
  ): Exclude<T, bigint> | Exclude<D, number> | string;
  of<T extends number | null | undefined>(
    value: T,
  ): Exclude<T, number> | string;
  of(
    value: bigint | number | null | undefined,
    decimals?: number | null | undefined,
  ) {
    if (value == null || (typeof value === "bigint" && decimals == null))
      return this._options.default ?? (value == null ? value : decimals);

    if (typeof value === "number") {
      const str = value.toString();
      const [significant, exp] = str.split(/[eE]/);
      const [whole, digits = ""] = significant!.split(".");

      const numberExp = Number(exp ?? 0);

      decimals = Math.min(100, Math.max(0, -numberExp)) + digits.length;

      if (numberExp > 0) {
        const newDigits =
          digits + "0".repeat(Math.max(0, numberExp - digits.length));

        const strValue = `${whole}${newDigits.slice(0, numberExp)}.${newDigits.slice(numberExp)}`;

        decimals = strValue.split(".")[1]?.length ?? 0;
        value = BigInt(strValue.replace(".", ""));
      } else {
        value = BigInt(value.toFixed(decimals).replace(".", ""));
      }
    }

    return formatBI(value, decimals!, this._options);
  }
}

export class HexFormatter extends BaseFormatter {
  protected _options: Readonly<FormatHexOptions> = {
    format: Format.hex,
    prefix: false,
  };

  constructor(__options: Partial<FormatHexOptions> = {}) {
    super();
    this._options = { ...this._options, ...__options };
  }

  /**
   * Enables the `0x` prefix for the hexadecimal format.
   *
   * @returns A new `HexFormatter` instance with the prefix enabled.
   */
  prefix() {
    const newOptions = { ...this._options, prefix: true };

    return this._clone(newOptions);
  }

  _clone(_options: FormatHexOptions) {
    return new HexFormatter(_options) as this;
  }
}

export abstract class CommonFormatter extends BaseFormatter {
  protected abstract _options: Readonly<BaseFormatOptions>;

  /**
   * Sets the number of decimal places for the formatter.
   *
   * If `_d` is `null` or `undefined`, the current instance is returned without modification.
   * Otherwise, a new formatter instance is created with the specified number of decimal places.
   *
   * @param _d - The number of decimal places to use in formatting. Can be `null` or `undefined`.
   * @returns A new formatter instance with the updated `digits` option, or the current instance
   *          if `_d` is `null` or `undefined`.
   *
   * @example
   * const updatedFormatter = formatter.digits(2);
   * console.log(updatedFormatter.of(1234.567)); // Output: "1234.57"
   */
  digits(_d: number | undefined | null) {
    if (_d == null) return this;
    const newOptions = { ...this._options, digits: _d };

    return this._clone(newOptions);
  }

  /**
   * Enables the removal of trailing zeros in the formatted output.
   *
   * This method modifies the formatter's configuration to remove unnecessary trailing zeros
   * from decimal numbers. A new formatter instance is created with this option enabled.
   *
   * @returns A new formatter instance with the `removeTrailingZero` option set to `true`.
   *
   * @example
   * const updatedFormatter = formatter.removeTrailingZero();
   * console.log(updatedFormatter.of(123.4500)); // Output: "123.45"
   */
  removeTrailingZero() {
    const newOptions = { ...this._options, removeTrailingZero: true };

    return this._clone(newOptions);
  }

  /**
   * Enables or disables trailing zeros in the formatted output.
   *
   * This method modifies the formatter's configuration to remove or keep unnecessary trailing zeros
   * from decimal numbers based on the `enable` parameter. A new formatter instance is created with
   * this option enabled or disabled.
   *
   * @param enable - A boolean indicating whether to enable trailing zeros. Defaults to `true`.
   * @returns A new formatter instance with the `removeTrailingZero` option set to the opposite of `enable`.
   *
   * @example
   * const updatedFormatter = formatter.trailingZero(false);
   * console.log(updatedFormatter.of(123.4500)); // Output: "123.45"
   *
   * @example
   * const updatedFormatterDisabled = formatter.trailingZero(true);
   * console.log(updatedFormatterDisabled.of(123.4500)); // Output: "123.4500"
   */
  trailingZero(enable = true) {
    const newOptions = { ...this._options, removeTrailingZero: !enable };

    return this._clone(newOptions);
  }

  /**
   * Enables readable formatting for small values.
   *
   * This method adjusts the formatter's configuration to ensure that small values are represented
   * in a more human-readable format. For instance, very small non-zero numbers might be formatted
   * using a notation like `< 0.01` instead of showing many insignificant digits.
   *
   * @returns A new formatter instance with the `readable` option set to `true`.
   *
   * @example
   * const updatedFormatter = formatter.readable();
   * console.log(updatedFormatter.of(0.0001, 2)); // Output: "< 0.01"
   */
  readable() {
    const newOptions = { ...this._options, readable: true };

    return this._clone(newOptions);
  }

  /**
   * Sets the minimum value for the formatter.
   *
   * This method configures the formatter to apply a lower bound to the values being formatted.
   * If the value being formatted is below the specified minimum, it will be replaced with a
   * representation like `< minValue`.
   *
   * If `_m` is `null` or `undefined`, the current instance is returned without modification.
   *
   * @param _m - The minimum value to enforce. Can be `null` or `undefined`.
   * @returns A new formatter instance with the `min` option set to the specified value,
   *          or the current instance if `_m` is `null` or `undefined`.
   *
   * @example
   * const updatedFormatter = formatter.min(10);
   * console.log(updatedFormatter.of(5)); // Output: "< 10"
   */
  min(_m: number | undefined | null) {
    if (_m == null) return this;
    const newOptions = { ...this._options, min: _m };

    return this._clone(newOptions);
  }

  /**
   * Sets the maximum value for the formatter.
   *
   * This method configures the formatter to apply an upper bound to the values being formatted.
   * If the value being formatted exceeds the specified maximum, it will be replaced with a
   * representation like `> maxValue`.
   *
   * If `_m` is `null` or `undefined`, the current instance is returned without modification.
   *
   * @param _m - The maximum value to enforce. Can be `null` or `undefined`.
   * @returns A new formatter instance with the `max` option set to the specified value,
   *          or the current instance if `_m` is `null` or `undefined`.
   *
   * @example
   * const updatedFormatter = formatter.max(100);
   * console.log(updatedFormatter.of(150)); // Output: "> 100"
   */
  max(_m: number | undefined | null) {
    if (_m == null) return this;
    const newOptions = { ...this._options, max: _m };

    return this._clone(newOptions);
  }

  /**
   * Enables the inclusion of a sign (+/-) in the formatted output.
   *
   * This method configures the formatter to explicitly display a positive sign (`+`) for positive
   * values, and a negative sign (`-`) for negative values. By default, positive values are displayed
   * without a sign.
   *
   * @returns A new formatter instance with the `sign` option set to `true`.
   *
   * @example
   * const updatedFormatter = formatter.sign();
   * console.log(updatedFormatter.of(123));  // Output: "+123"
   * console.log(updatedFormatter.of(-123)); // Output: "-123"
   */
  sign() {
    const newOptions = { ...this._options, sign: true };

    return this._clone(newOptions);
  }

  /**
   * Adds a unit symbol to the formatted output.
   *
   * This method configures the formatter to append or prepend a unit symbol to the formatted value.
   * Common examples include currency symbols (`$`), percentage symbols (`%`), or custom units.
   *
   * If `_u` is `null` or `undefined`, the current instance is returned without modification.
   *
   * @param _u - The unit symbol to add to the formatted value. Can be `null` or `undefined`.
   * @returns A new formatter instance with the `unit` option set to the specified symbol,
   *          or the current instance if `_u` is `null` or `undefined`.
   *
   * @example
   * const updatedFormatter = formatter.unit("$");
   * console.log(updatedFormatter.of(1234.56)); // Output: "$1234.56"
   *
   * const percentFormatter = formatter.unit("%");
   * console.log(percentFormatter.of(50)); // Output: "50%"
   *
   * const otherFormatter = formatter.unit("UNIT");
   * console.log(percentFormatter.of(50)); // Output: "50 UNIT"
   */
  unit(_u: string | undefined | null) {
    if (_u == null) return this;

    const newOptions = { ...this._options, unit: _u };

    return this._clone(newOptions);
  }

  /**
   * Sets the locale for the formatted output.
   *
   * This method configures the formatter to format numbers according to the specified locale,
   * which can affect decimal symbols, thousand separators, and other locale-specific formatting rules.
   *
   * If `_l` is `null` or `undefined`, the current instance is returned without modification.
   *
   * @param _l - The locale identifier (e.g., `"en-US"`, `"fr-FR"`, `"de-DE"`) to use for formatting.
   *             Can be `null` or `undefined`.
   * @returns A new formatter instance with the `locale` option set to the specified locale,
   *          or the current instance if `_l` is `null` or `undefined`.
   *
   * @example
   * const updatedFormatter = formatter.locale("fr-FR");
   * console.log(updatedFormatter.of(1234.56)); // Output: "1 234,56" (French locale)
   *
   * const usFormatter = formatter.locale("en-US");
   * console.log(usFormatter.of(1234.56)); // Output: "1,234.56" (US locale)
   */
  locale(_l: string | undefined | null) {
    if (_l == null) return this;
    const newOptions = { ...this._options, locale: _l };

    return this._clone(newOptions);
  }
}

/**
 * A formatter for numeric values.
 *
 * The `NumberFormatter` class provides functionality to format numbers according to various
 * configurable options such as decimal precision, locale, unit, and more. It supports methods
 * for customizing the formatting behavior and returns formatted strings based on the input
 * value and settings.
 *
 * @example
 * // Basic usage
 * const formatter = formatter;
 * console.log(formatter.of(1234.567)); // Output: "1234.567"
 *
 * @example
 * // Customizing decimal places
 * const formatterWithDigits = formatter.digits(2);
 * console.log(formatterWithDigits.of(1234.567)); // Output: "1234.57"
 *
 * @example
 * // Adding a unit
 * const formatterWithUnit = formatter.unit("$");
 * console.log(formatterWithUnit.of(1234.56)); // Output: "$1234.56"
 */
export class NumberFormatter extends CommonFormatter {
  protected _options: Readonly<FormatNumberOptions> = { format: Format.number };

  constructor(__options: Partial<FormatNumberOptions> = {}) {
    super();
    this._options = { ...this._options, ...__options };
  }

  _clone(_options: FormatNumberOptions) {
    return new NumberFormatter(_options) as this;
  }
}

/**
 * A formatter for numeric values with comma-separated formatting.
 *
 * The `CommasFormatter` class formats numbers with commas as thousands separators,
 * providing better readability for large numbers. It supports various customization
 * options such as decimal precision, units, and locale.
 *
 * @example
 * // Basic usage
 * const formatter = formatter;
 * console.log(formatter.of(1234567.89)); // Output: "1,234,567.89"
 *
 * @example
 * // Customizing decimal places
 * const formatterWithDigits = formatter.digits(2);
 * console.log(formatterWithDigits.of(1234567.89)); // Output: "1,234,567.89"
 *
 * @example
 * // Adding a unit
 * const formatterWithUnit = formatter.unit("$");
 * console.log(formatterWithUnit.of(1234567.89)); // Output: "$1,234,567.89"
 */
export class CommasFormatter extends CommonFormatter {
  protected _options: Readonly<FormatCommasOptions> = { format: Format.commas };

  constructor(__options: Partial<FormatCommasOptions> = {}) {
    super();
    this._options = { ...this._options, ...__options };
  }

  _clone(_options: FormatCommasOptions) {
    return new CommasFormatter(_options) as this;
  }
}

/**
 * A formatter for compact numeric values.
 *
 * The `ShortFormatter` class formats numbers in a short or compact notation, such as `1.2k` for
 * thousands or `3.4M` for millions. It is useful for presenting large numbers in a concise and
 * readable manner. This formatter supports customization options like decimal precision,
 * units, and readability for small values.
 *
 * @example
 * // Basic usage
 * const formatter = formatter;
 * console.log(formatter.of(1234567.89)); // Output: "1.23M"
 *
 * @example
 * // Customizing decimal places
 * const formatterWithDigits = formatter.digits(1);
 * console.log(formatterWithDigits.of(1234567.89)); // Output: "1.2M"
 *
 * @example
 * // Enabling small values with commas
 * const formatterWithCommas = formatter.smallValuesWithCommas();
 * console.log(formatterWithCommas.of(1234.56)); // Output: "1,234.56"
 */
export class ShortFormatter extends CommonFormatter {
  protected _options: Readonly<FormatShortOptions> = { format: Format.short };

  constructor(__options: Partial<FormatShortOptions> = {}) {
    super();
    this._options = { ...this._options, ...__options };
  }

  /**
   * Enables the use of commas for small values in the formatted output.
   *
   * When this option is enabled, values between 999 and 9999  are formatted using comma-separated notation
   * for better readability.
   *
   * @returns A new `ShortFormatter` instance with the `smallValuesWithCommas` option set to `true`.
   *
   * @example
   * // Basic usage
   * const formatter = formatter.smallValuesWithCommas();
   * console.log(formatter.of(1234.567)); // Output: "1,234.567"
   *
   * @example
   * // Combining with other options
   * const formatter = formatter.smallValuesWithCommas().digits(2);
   * console.log(formatter.of(1234.567)); // Output: "1,234.56"
   */
  smallValuesWithCommas() {
    const newOptions = { ...this._options, smallValuesWithCommas: true };

    return this._clone(newOptions);
  }

  _clone(_options: FormatShortOptions) {
    return new ShortFormatter(_options) as this;
  }
}

/**
 * A formatter for percentage values.
 *
 * The `PercentFormatter` class formats numeric values as percentages by multiplying the input
 * value by 100. It supports customization options like
 * decimal precision, locale, and more for tailored output.
 *
 * @example
 * // Basic usage
 * console.log(formatter.of(0.1234)); // Output: "12.34"
 *
 * @example
 * // Customizing decimal places
 * const formatterWithDigits = formatter.digits(0);
 * console.log(formatterWithDigits.of(0.1234)); // Output: "12"
 *
 * @example
 * // Adding readability
 * const formatterReadable = formatter.readable();
 * console.log(formatterReadable.of(0.0001234)); // Output: "< 0.01"
 */
export class PercentFormatter extends CommonFormatter {
  protected _options: Readonly<FormatPercentOptions> = {
    format: Format.percent,
  };

  constructor(__options: Partial<FormatPercentOptions> = {}) {
    super();
    this._options = { ...this._options, ...__options };
  }

  _clone(_options: FormatPercentOptions) {
    return new PercentFormatter(_options) as this;
  }
}

type TDefaultOptions = {
  all: Partial<Omit<BaseFormatOptions, "format">>;
  number: Partial<Omit<FormatNumberOptions, "format">>;
  short: Partial<Omit<FormatShortOptions, "format">>;
  percent: Partial<Omit<FormatPercentOptions, "format">>;
  commas: Partial<Omit<FormatCommasOptions, "format">>;
  hex: Partial<Omit<FormatHexOptions, "format">>;
};

type TFormatters = {
  [Format.hex]: HexFormatter;
  [Format.number]: NumberFormatter;
  [Format.commas]: CommasFormatter;
  [Format.short]: ShortFormatter;
  [Format.percent]: PercentFormatter;
};

/**
 * Creates a set of pre-configured formatters for various numeric formats.
 *
 * The `createFormat` function generates formatters for hex, number, commas-separated, short, and percentage formats.
 * It allows setting default options for all formatters and defining custom formatters for specific use cases.
 *
 * @typeParam TCustom - A custom configuration object where keys are custom formatter names and values are
 *                      format options specific to the desired format.
 *
 * @param defaultOptions - Default options to apply to all formatters or specific format types.
 * @param customFormatters - An object defining additional custom formatters with specific configurations.
 * @returns An object containing pre-configured formatters and custom formatters if provided.
 *
 * @example
 * // Create default formatters
 * const format = createFormat();
 * console.log(format.number.of(1234.56)); // Output: "1234.56"
 * console.log(format.commas.of(1234.56)); // Output: "1,234.56"
 *
 * @example
 * // Create formatters with default options
 * const format = createFormat({
 *   all: { digits: 2 },
 *   number: { unit: "$" },
 * });
 * console.log(format.number.of(1234.56)); // Output: "$1234.56"
 * console.log(format.short.of(1234567.89)); // Output: "1.23M"
 *
 * @example
 * // Adding custom formatters
 * const format = createFormat({}, { customHex: { format: Format.hex, prefix: true } });
 * console.log(format.customHex.of(255)); // Output: "0xff"
 */
export function createFormat<
  TCustom extends Record<
    string,
    | FormatNumberOptions
    | FormatShortOptions
    | FormatPercentOptions
    | FormatCommasOptions
    | FormatHexOptions
  > & { [K in keyof TDefaultOptions]?: never } = {},
>(
  defaultOptions: Partial<TDefaultOptions> = {},
  customFormatters: TCustom = {} as TCustom,
) {
  const formatters = {
    get hex() {
      return new HexFormatter({ ...defaultOptions.all, ...defaultOptions.hex });
    },
    get number() {
      return new NumberFormatter({
        ...defaultOptions.all,
        ...defaultOptions.number,
      });
    },
    get commas() {
      return new CommasFormatter({
        ...defaultOptions.all,
        ...defaultOptions.commas,
      });
    },
    get short() {
      return new ShortFormatter({
        ...defaultOptions.all,
        ...defaultOptions.short,
      });
    },
    get percent() {
      return new PercentFormatter({
        ...defaultOptions.all,
        ...defaultOptions.percent,
      });
    },
  };

  Object.entries(customFormatters).forEach(([name, options]) => {
    Object.defineProperty(formatters, name, {
      get() {
        switch (options.format) {
          case Format.hex:
            return new HexFormatter({ ...defaultOptions.all, ...options });
          case Format.number:
            return new NumberFormatter({ ...defaultOptions.all, ...options });
          case Format.commas:
            return new CommasFormatter({ ...defaultOptions.all, ...options });
          case Format.percent:
            return new PercentFormatter({ ...defaultOptions.all, ...options });
          case Format.short:
            return new ShortFormatter({ ...defaultOptions.all, ...options });
        }
      },
    });
  });

  return formatters as {
    /**
     * Return the value as an integer in hex format
     */
    readonly hex: HexFormatter;
    /**
     * Return the value as a stringified number (12345.6789)
     */
    readonly number: NumberFormatter;
    /**
     * Return the value as a commas-separated stringified number (12,345.6789)
     */
    readonly commas: CommasFormatter;
    /**
     * Return the value as a shorted stringified number (12.3456789k)
     */
    readonly short: ShortFormatter;
    /**
     * Return the value as a percent based stringified number (10.00 instead of 0.1)
     */
    readonly percent: PercentFormatter;
  } & { readonly [K in keyof TCustom]: TFormatters[TCustom[K]["format"]] };
}

export const format = createFormat();
