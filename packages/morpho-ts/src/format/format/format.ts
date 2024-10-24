import { getEnUSNumberToLocalParts } from "../locale";

enum Format {
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

const _withUnit = (value: string, unit: string) => {
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

  const formattedValue =
    (isNegative && !/^0\.0+$/.test(value)
      ? "-"
      : formatOptions.sign
        ? "+"
        : "") + value;

  if (formatOptions.unit) {
    return _withUnit(formattedValue, formatOptions.unit);
  }

  return formattedValue;
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

export abstract class BaseFormatter {
  protected abstract _options: FormatOptions;

  default(_d: string) {
    this._options.default = _d;

    return this as FormatterWithDefault<this>;
  }

  createOf() {
    return this.of.bind({ _options: { ...this._options } });
  }

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
  protected _options: FormatHexOptions = { format: Format.hex, prefix: false };

  constructor(__options: Partial<FormatHexOptions> = {}) {
    super();
    this._options = { ...this._options, ...__options };
  }

  prefix() {
    this._options.prefix = true;
    return this;
  }
}

export abstract class CommonFormatter extends BaseFormatter {
  protected abstract _options: BaseFormatOptions;

  digits(_d: number) {
    this._options.digits = _d;
    return this;
  }

  removeTrailingZero() {
    this._options.removeTrailingZero = true;
    return this;
  }

  readable() {
    this._options.readable = true;
    return this;
  }

  min(_m: number) {
    this._options.min = _m;
    return this;
  }

  max(_m: number) {
    this._options.max = _m;
    return this;
  }

  sign() {
    this._options.sign = true;
    return this;
  }

  unit(_u: string) {
    this._options.unit = _u;
    return this;
  }

  locale(_l: string) {
    this._options.locale = _l;
    return this;
  }
}

export class NumberFormatter extends CommonFormatter {
  protected _options: FormatNumberOptions = { format: Format.number };

  constructor(__options: Partial<FormatNumberOptions> = {}) {
    super();
    this._options = { ...this._options, ...__options };
  }
}

export class CommasFormatter extends CommonFormatter {
  protected _options: FormatCommasOptions = { format: Format.commas };

  constructor(__options: Partial<FormatCommasOptions> = {}) {
    super();
    this._options = { ...this._options, ...__options };
  }
}

export class ShortFormatter extends CommonFormatter {
  protected _options: FormatShortOptions = { format: Format.short };

  constructor(__options: Partial<FormatShortOptions> = {}) {
    super();
    this._options = { ...this._options, ...__options };
  }

  smallValuesWithCommas() {
    this._options.smallValuesWithCommas = true;
    return this;
  }
}

export class PercentFormatter extends CommonFormatter {
  protected _options: FormatPercentOptions = { format: Format.percent };

  constructor(__options: Partial<FormatPercentOptions> = {}) {
    super();
    this._options = { ...this._options, ...__options };
  }
}

export function createFormat(
  defaultOptions: {
    all?: Partial<Omit<BaseFormatOptions, "format">>;
    number?: Partial<Omit<FormatNumberOptions, "format">>;
    short?: Partial<Omit<FormatShortOptions, "format">>;
    percent?: Partial<Omit<FormatPercentOptions, "format">>;
    commas?: Partial<Omit<FormatCommasOptions, "format">>;
    hex?: Partial<Omit<FormatHexOptions, "format">>;
  } = {},
) {
  return {
    /**
     * Return the value as an integer in hex format
     */
    get hex() {
      return new HexFormatter({ ...defaultOptions.all, ...defaultOptions.hex });
    },
    /**
     * Return the value as a stringified number (12345.6789)
     */
    get number() {
      return new NumberFormatter({
        ...defaultOptions.all,
        ...defaultOptions.number,
      });
    },
    /**
     * Return the value as a commas-separated stringified number (12,345.6789)
     */
    get commas() {
      return new CommasFormatter({
        ...defaultOptions.all,
        ...defaultOptions.commas,
      });
    },
    /**
     * Return the value as a shorted stringified number (12.3456789k)
     */
    get short() {
      return new ShortFormatter({
        ...defaultOptions.all,
        ...defaultOptions.short,
      });
    },
    /**
     * Return the value as a percent based stringified number (10.00 instead of 0.1)
     */
    get percent() {
      return new PercentFormatter({
        ...defaultOptions.all,
        ...defaultOptions.percent,
      });
    },
  };
}

export const format = createFormat();
