import { Format, createFormat, format } from "../src";

import { describe, expect, test } from "vitest";

describe("format", () => {
  const number = 12345.6789;
  const bigint = 123456789n;
  const decimals = 4;

  describe("createFormat", () => {
    test("should properly initialize format options", () => {
      const customFormat = createFormat(
        {
          all: { digits: 2, sign: true },
          hex: { default: "default hex" },
          number: {
            sign: false,
            unit: "number",
          },
          short: {
            sign: false,
            unit: "short",
            smallValuesWithCommas: true,
          },
          percent: {
            sign: false,
            unit: "percent",
          },
          commas: {
            sign: false,
            unit: "commas",
          },
        },
        { custom: { format: Format.number, digits: 10, unit: "custom" } },
      );

      //@ts-ignore
      const hexOptions = customFormat.hex._options;
      expect(hexOptions.format).toBe(Format.hex);
      expect(hexOptions.default).toBe("default hex");
      expect(hexOptions.prefix).toBe(false);

      //@ts-ignore
      const numberOptions = customFormat.number._options;
      expect(numberOptions.format).toBe(Format.number);
      expect(numberOptions.unit).toBe("number");
      expect(numberOptions.sign).toBe(false);
      expect(numberOptions.digits).toBe(2);
      expect(numberOptions.default).toBe(undefined);

      //@ts-ignore
      const shortOptions = customFormat.short._options;
      expect(shortOptions.format).toBe(Format.short);
      expect(shortOptions.unit).toBe("short");
      expect(shortOptions.sign).toBe(false);
      expect(shortOptions.digits).toBe(2);
      expect(shortOptions.default).toBe(undefined);
      expect(shortOptions.smallValuesWithCommas).toBe(true);

      //@ts-ignore
      const percentOptions = customFormat.percent._options;
      expect(percentOptions.format).toBe(Format.percent);
      expect(percentOptions.unit).toBe("percent");
      expect(percentOptions.sign).toBe(false);
      expect(percentOptions.digits).toBe(2);
      expect(percentOptions.default).toBe(undefined);

      //@ts-ignore
      const commasOptions = customFormat.commas._options;
      expect(commasOptions.format).toBe(Format.commas);
      expect(commasOptions.unit).toBe("commas");
      expect(commasOptions.sign).toBe(false);
      expect(commasOptions.digits).toBe(2);
      expect(commasOptions.default).toBe(undefined);

      const customFormatter = customFormat.custom;
      //@ts-ignore
      const customOptions = customFormatter._options;
      expect(customOptions.format).toBe(Format.number);
      expect(customOptions.unit).toBe("custom");
      expect(customOptions.sign).toBe(true);
      expect(customOptions.digits).toBe(10);
      expect(customOptions.default).toBe(undefined);
    });

    test("shouldn't create conflicts between formatters", () => {
      const formatters = createFormat();

      const formatter1 = formatters.number.digits(10);
      const formatter2 = formatters.number.digits(0);
      const formatter3 = formatter1.digits(5);

      //@ts-ignore
      const options1 = formatter1._options;
      //@ts-ignore
      const options2 = formatter2._options;
      //@ts-ignore
      const options3 = formatter3._options;

      expect(options1.digits).toBe(10);
      expect(options2.digits).toBe(0);
      expect(options3.digits).toBe(5);
    });
  });

  describe("createOf", () => {
    test("should allow creating a function from formatter", () => {
      const formatter = format.number.digits(2);
      const formatFunction = formatter.createOf();

      expect(formatFunction(number)).toEqual("12345.67");
      formatter.digits(4);
      expect(formatFunction(number)).toEqual("12345.67");
    });
  });

  describe(Format.hex, () => {
    describe("should properly format number in hex format", () => {
      test("without option", () => {
        expect(format.hex.of(number)).toEqual((123456789).toString(16));
      });

      test("with a default value", () => {
        expect(format.hex.default("default").of(undefined)).toEqual("default");
        expect(format.hex.default("default").of(null)).toEqual("default");
      });

      test("with nullable values", () => {
        expect(format.hex.of(undefined)).toEqual(undefined);
        expect(format.hex.of(null)).toEqual(null);
      });
    });

    describe("should properly format bigint in hex format", () => {
      test("without option", () => {
        expect(format.hex.of(bigint, decimals)).toEqual(
          (123456789).toString(16),
        );
      });

      test("with a default value", () => {
        expect(format.hex.default("default").of(undefined, 18)).toEqual(
          "default",
        );
        expect(format.hex.default("default").of(null, 18)).toEqual("default");
        expect(format.hex.default("default").of(bigint, undefined)).toEqual(
          "default",
        );
        expect(format.hex.default("default").of(bigint, null)).toEqual(
          "default",
        );
      });

      test("with nullable values", () => {
        expect(format.hex.of(undefined, decimals)).toEqual(undefined);
        expect(format.hex.of(null, decimals)).toEqual(null);
        expect(format.hex.of(bigint, undefined)).toEqual(undefined);
        expect(format.hex.of(bigint, null)).toEqual(null);
        expect(format.hex.of(null, undefined)).toEqual(null);
        expect(format.hex.of(undefined, null)).toEqual(undefined);
      });
    });
  });

  describe("number", () => {
    describe("should properly handle options", () => {
      const formatter = format.number
        .digits(2)
        .locale("en-US")
        .unit("unit")
        .min(0)
        .max(100);

      test("it shouldn't update options if parameter is undefined", () => {
        const newFormatter = formatter
          .digits(undefined)
          .locale(undefined)
          .unit(undefined)
          .min(undefined)
          .max(undefined);

        //@ts-ignore
        const options = newFormatter._options;
        expect(options.digits).toBe(2);
        expect(options.locale).toBe("en-US");
        expect(options.unit).toBe("unit");
        expect(options.min).toBe(0);
        expect(options.max).toBe(100);
      });

      test("it shouldn't update options if parameter is null", () => {
        const newFormatter = formatter
          .digits(null)
          .locale(null)
          .unit(null)
          .min(null)
          .max(null);

        //@ts-ignore
        const options = newFormatter._options;
        expect(options.digits).toBe(2);
        expect(options.locale).toBe("en-US");
        expect(options.unit).toBe("unit");
        expect(options.min).toBe(0);
        expect(options.max).toBe(100);
      });
    });

    describe("should properly format number in number format", () => {
      test("without option", () => {
        expect(format.number.of(number)).toEqual("12345.6789");
      });

      test("with digits", () => {
        expect(format.number.digits(2).of(number)).toEqual("12345.67");
      });

      test("with min", () => {
        expect(format.number.min(20000).of(number)).toEqual("< 20000.0000");
      });

      test("with max", () => {
        expect(format.number.max(10000).of(number)).toEqual("> 10000.0000");
      });

      test("with sign", () => {
        expect(format.number.sign().of(number)).toEqual("+12345.6789");
      });

      test("with unit", () => {
        expect(format.number.unit("$").of(number)).toEqual("$12345.6789");
      });

      test("without trailing zeros", () => {
        expect(format.number.digits(6).of(number)).toEqual("12345.678900");
        expect(format.number.digits(6).removeTrailingZero().of(number)).toEqual(
          "12345.6789",
        );
      });

      test("with locale", () => {
        expect(format.number.locale("fr-FR").of(number)).toEqual("12345,6789");
      });

      test("with really small numbers", () => {
        expect(format.number.of(1.23e-30)).toEqual(
          "0.00000000000000000000000000000123",
        );
        expect(format.number.of(0.99e-12)).toEqual("0.00000000000099");
      });

      test("with really big numbers", () => {
        expect(format.number.of(1e30)).toEqual(
          "1000000000000000000000000000000",
        );
        expect(format.number.of(1.234e30)).toEqual(
          "1234000000000000000000000000000",
        );
        expect(format.number.of(1.234e2)).toEqual("123.4");
      });

      test("with a default value", () => {
        expect(format.number.default("default").of(undefined)).toEqual(
          "default",
        );
        expect(format.number.default("default").of(null)).toEqual("default");
      });

      test("with nullable values", () => {
        expect(format.number.of(undefined)).toEqual(undefined);
        expect(format.number.of(null)).toEqual(null);
      });
    });

    describe("should properly format bigint in number format", () => {
      test("without option", () => {
        expect(format.number.of(bigint, decimals)).toEqual("12345.6789");
      });

      test("with digits", () => {
        expect(format.number.digits(2).of(bigint, decimals)).toEqual(
          "12345.67",
        );
      });

      test("with min", () => {
        expect(format.number.min(20000).of(bigint, decimals)).toEqual(
          "< 20000.0000",
        );
      });

      test("with max", () => {
        expect(format.number.max(10000).of(bigint, decimals)).toEqual(
          "> 10000.0000",
        );
      });

      test("with sign", () => {
        expect(format.number.sign().of(bigint, decimals)).toEqual(
          "+12345.6789",
        );
      });

      test("with unit", () => {
        expect(format.number.unit("$").of(bigint, decimals)).toEqual(
          "$12345.6789",
        );
      });

      test("without trailing zeros", () => {
        expect(format.number.digits(6).of(bigint, decimals)).toEqual(
          "12345.678900",
        );
        expect(
          format.number.digits(6).removeTrailingZero().of(bigint, decimals),
        ).toEqual("12345.6789");
      });

      test("with locale", () => {
        expect(format.number.locale("fr-FR").of(bigint, decimals)).toEqual(
          "12345,6789",
        );
      });

      test("with a default value", () => {
        expect(format.number.default("default").of(undefined, 18)).toEqual(
          "default",
        );
        expect(format.number.default("default").of(null, 18)).toEqual(
          "default",
        );
        expect(format.number.default("default").of(bigint, undefined)).toEqual(
          "default",
        );
        expect(format.number.default("default").of(bigint, null)).toEqual(
          "default",
        );
      });

      test("with nullable values", () => {
        expect(format.number.of(undefined, decimals)).toEqual(undefined);
        expect(format.number.of(null, decimals)).toEqual(null);
        expect(format.number.of(bigint, undefined)).toEqual(undefined);
        expect(format.number.of(bigint, null)).toEqual(null);
        expect(format.number.of(null, undefined)).toEqual(null);
        expect(format.number.of(undefined, null)).toEqual(undefined);
      });
    });
  });

  describe("short", () => {
    describe("should properly format number in short format", () => {
      test("with small integers", () => {
        expect(format.short.of(123)).toEqual("123");
      });

      test("without option", () => {
        expect(format.short.of(number)).toEqual("12.3456789k");
      });

      test("with digits", () => {
        expect(format.short.digits(2).of(number)).toEqual("12.34k");
      });

      test("with min", () => {
        expect(format.short.min(20000).of(number)).toEqual("< 20.0000000k");
      });

      test("with max", () => {
        expect(format.short.max(10000).of(number)).toEqual("> 10.0000000k");
      });

      test("with sign", () => {
        expect(format.short.sign().of(number)).toEqual("+12.3456789k");
      });

      test("with unit", () => {
        expect(format.short.unit("€").of(number)).toEqual("12.3456789k €");
      });

      test("without trailing zeros", () => {
        expect(format.short.digits(8).of(number)).toEqual("12.34567890k");
        expect(format.short.digits(8).removeTrailingZero().of(number)).toEqual(
          "12.3456789k",
        );
      });

      test("with small numbers with commas", () => {
        expect(format.short.smallValuesWithCommas().of(number / 10)).toEqual(
          "1,234.56789",
        );
      });

      test("with locale", () => {
        expect(format.short.locale("fr-FR").of(number)).toEqual("12,3456789k");
      });

      test("with a default value", () => {
        expect(format.short.default("default").of(undefined)).toEqual(
          "default",
        );
        expect(format.short.default("default").of(null)).toEqual("default");
      });

      test("with nullable values", () => {
        expect(format.short.of(undefined)).toEqual(undefined);
        expect(format.short.of(null)).toEqual(null);
      });
    });

    describe("should properly format bigint in short format", () => {
      test("with small integers", () => {
        expect(format.short.of(123n, 0)).toEqual("123");
      });

      test("without option", () => {
        expect(format.short.of(bigint, decimals)).toEqual("12.3456789k");
      });

      test("with digits", () => {
        expect(format.short.digits(2).of(bigint, decimals)).toEqual("12.34k");
      });

      test("with min", () => {
        expect(format.short.min(20000).of(bigint, decimals)).toEqual(
          "< 20.0000000k",
        );
      });

      test("with max", () => {
        expect(format.short.max(10000).of(bigint, decimals)).toEqual(
          "> 10.0000000k",
        );
      });

      test("with sign", () => {
        expect(format.short.sign().of(bigint, decimals)).toEqual(
          "+12.3456789k",
        );
      });

      test("with unit", () => {
        expect(format.short.unit("€").of(bigint, decimals)).toEqual(
          "12.3456789k €",
        );
      });

      test("without trailing zeros", () => {
        expect(format.short.digits(8).of(bigint, decimals)).toEqual(
          "12.34567890k",
        );
        expect(
          format.short.digits(8).removeTrailingZero().of(bigint, decimals),
        ).toEqual("12.3456789k");
      });

      test("with locale", () => {
        expect(format.short.locale("fr-FR").of(bigint, decimals)).toEqual(
          "12,3456789k",
        );
      });

      test("with small numbers with commas", () => {
        expect(
          format.short.smallValuesWithCommas().of(bigint, decimals + 1),
        ).toEqual("1,234.56789");
      });

      test("with small numbers with commas with locale", () => {
        expect(
          format.short
            .smallValuesWithCommas()
            .locale("fr-FR")
            .of(bigint, decimals + 1),
          // the correct space in fr-FR is narrow no-break space (U+202F)
        ).toEqual("1\u202F234,56789");
      });

      test("with a default value", () => {
        expect(format.short.default("default").of(undefined, 18)).toEqual(
          "default",
        );
        expect(format.short.default("default").of(null, 18)).toEqual("default");
        expect(format.short.default("default").of(bigint, undefined)).toEqual(
          "default",
        );
        expect(format.short.default("default").of(bigint, null)).toEqual(
          "default",
        );
      });

      test("with nullable values", () => {
        expect(format.short.of(undefined, decimals)).toEqual(undefined);
        expect(format.short.of(null, decimals)).toEqual(null);
        expect(format.short.of(bigint, undefined)).toEqual(undefined);
        expect(format.short.of(bigint, null)).toEqual(null);
        expect(format.short.of(null, undefined)).toEqual(null);
        expect(format.short.of(undefined, null)).toEqual(undefined);
      });
    });
  });

  describe("commas", () => {
    describe("should properly format number in commas format", () => {
      test("without option", () => {
        expect(format.commas.of(number)).toEqual("12,345.6789");
      });

      test("with digits", () => {
        expect(format.commas.digits(2).of(number)).toEqual("12,345.67");
      });

      test("with min", () => {
        expect(format.commas.min(20000).of(number)).toEqual("< 20,000.0000");
      });

      test("with max", () => {
        expect(format.commas.max(10000).of(number)).toEqual("> 10,000.0000");
      });

      test("with sign", () => {
        expect(format.commas.sign().of(number)).toEqual("+12,345.6789");
      });

      test("with unit", () => {
        expect(format.commas.unit("ETH").of(number)).toEqual("12,345.6789 ETH");
      });

      test("without trailing zeros", () => {
        expect(format.commas.digits(6).of(number)).toEqual("12,345.678900");
        expect(format.commas.digits(6).removeTrailingZero().of(number)).toEqual(
          "12,345.6789",
        );
      });

      test("with locale", () => {
        expect(format.commas.locale("fr-FR").of(number)).toEqual(
          "12\u202F345,6789",
        );
      });

      test("with a default value", () => {
        expect(format.commas.default("default").of(undefined)).toEqual(
          "default",
        );
        expect(format.commas.default("default").of(null)).toEqual("default");
      });

      test("with nullable values", () => {
        expect(format.commas.of(undefined)).toEqual(undefined);
        expect(format.commas.of(null)).toEqual(null);
      });
    });

    describe("should properly format bigint in commas format", () => {
      test("without option", () => {
        expect(format.commas.of(bigint, decimals)).toEqual("12,345.6789");
      });

      test("with digits", () => {
        expect(format.commas.digits(2).of(bigint, decimals)).toEqual(
          "12,345.67",
        );
      });

      test("with min", () => {
        expect(format.commas.min(20000).of(bigint, decimals)).toEqual(
          "< 20,000.0000",
        );
      });

      test("with max", () => {
        expect(format.commas.max(10000).of(bigint, decimals)).toEqual(
          "> 10,000.0000",
        );
      });

      test("with sign", () => {
        expect(format.commas.sign().of(bigint, decimals)).toEqual(
          "+12,345.6789",
        );
      });

      test("with unit", () => {
        expect(format.commas.unit("ETH").of(bigint, decimals)).toEqual(
          "12,345.6789 ETH",
        );
      });

      test("without trailing zeros", () => {
        expect(format.commas.digits(6).of(bigint, decimals)).toEqual(
          "12,345.678900",
        );
        expect(
          format.commas.digits(6).removeTrailingZero().of(bigint, decimals),
        ).toEqual("12,345.6789");
      });

      test("with locale", () => {
        // the correct space in fr-FR is narrow no-break space (U+202F)
        expect(format.commas.locale("fr-FR").of(bigint, decimals)).toEqual(
          "12\u202F345,6789",
        );
      });

      test("with a default value", () => {
        expect(format.commas.default("default").of(undefined, 18)).toEqual(
          "default",
        );
        expect(format.commas.default("default").of(null, 18)).toEqual(
          "default",
        );
        expect(format.commas.default("default").of(bigint, undefined)).toEqual(
          "default",
        );
        expect(format.commas.default("default").of(bigint, null)).toEqual(
          "default",
        );
      });

      test("with nullable values", () => {
        expect(format.commas.of(undefined, decimals)).toEqual(undefined);
        expect(format.commas.of(null, decimals)).toEqual(null);
        expect(format.commas.of(bigint, undefined)).toEqual(undefined);
        expect(format.commas.of(bigint, null)).toEqual(null);
        expect(format.commas.of(null, undefined)).toEqual(null);
        expect(format.commas.of(undefined, null)).toEqual(undefined);
      });
    });
  });

  describe("percent", () => {
    describe("should properly format number in percent format", () => {
      test("without option", () => {
        expect(format.percent.of(number)).toEqual("1234567.8900");
      });

      test("with digits", () => {
        expect(format.percent.digits(1).of(number)).toEqual("1234567.8");
      });

      test("with min", () => {
        expect(format.percent.min(20000).of(number)).toEqual("< 2000000.0000");
      });

      test("with max", () => {
        expect(format.percent.max(10000).of(number)).toEqual("> 1000000.0000");
      });

      test("with sign", () => {
        expect(format.percent.sign().of(number)).toEqual("+1234567.8900");
      });

      test("with unit", () => {
        expect(format.percent.unit("%").of(number)).toEqual("1234567.8900%");
      });

      test("without trailing zeros", () => {
        expect(format.percent.removeTrailingZero().of(number)).toEqual(
          "1234567.89",
        );
      });

      test("with locale", () => {
        expect(format.percent.locale("fr-FR").of(number)).toEqual(
          "1234567,8900",
        );
      });

      test("with a default value", () => {
        expect(format.percent.default("default").of(undefined)).toEqual(
          "default",
        );
        expect(format.percent.default("default").of(null)).toEqual("default");
      });

      test("with nullable values", () => {
        expect(format.percent.of(undefined)).toEqual(undefined);
        expect(format.percent.of(null)).toEqual(null);
      });
    });

    describe("should properly format bigint in percent format", () => {
      test("without option", () => {
        expect(format.percent.of(bigint, decimals)).toEqual("1234567.8900");
      });

      test("with digits", () => {
        expect(format.percent.digits(1).of(bigint, decimals)).toEqual(
          "1234567.8",
        );
      });

      test("with min", () => {
        expect(format.percent.min(20000).of(bigint, decimals)).toEqual(
          "< 2000000.0000",
        );
      });

      test("with max", () => {
        expect(format.percent.max(10000).of(bigint, decimals)).toEqual(
          "> 1000000.0000",
        );
      });

      test("with sign", () => {
        expect(format.percent.sign().of(bigint, decimals)).toEqual(
          "+1234567.8900",
        );
      });

      test("with unit", () => {
        expect(format.percent.unit("%").of(bigint, decimals)).toEqual(
          "1234567.8900%",
        );
      });

      test("without trailing zeros", () => {
        expect(
          format.percent.removeTrailingZero().of(bigint, decimals),
        ).toEqual("1234567.89");
      });

      test("with locale", () => {
        expect(format.percent.locale("fr-FR").of(bigint, decimals)).toEqual(
          "1234567,8900",
        );
      });

      test("with a default value", () => {
        expect(format.percent.default("default").of(undefined, 18)).toEqual(
          "default",
        );
        expect(format.percent.default("default").of(null, 18)).toEqual(
          "default",
        );
        expect(format.percent.default("default").of(bigint, undefined)).toEqual(
          "default",
        );
        expect(format.percent.default("default").of(bigint, null)).toEqual(
          "default",
        );
      });

      test("with nullable values", () => {
        expect(format.percent.of(undefined, decimals)).toEqual(undefined);
        expect(format.percent.of(null, decimals)).toEqual(null);
        expect(format.percent.of(bigint, undefined)).toEqual(undefined);
        expect(format.percent.of(bigint, null)).toEqual(null);
        expect(format.percent.of(null, undefined)).toEqual(null);
        expect(format.percent.of(undefined, null)).toEqual(undefined);
      });
    });
  });
});
