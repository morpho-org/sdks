import { format } from "./format";

describe("format", () => {
  const number = 12345.6789;
  const bigint = 123456789n;
  const decimals = 4;

  describe("hex", () => {
    describe("should properly format number in hex format", () => {
      it("without option", () => {
        expect(format.hex.of(number)).toEqual((123456789).toString(16));
      });
    });
    describe("should properly format bigint in hex format", () => {
      it("without option", () => {
        expect(format.hex.of(bigint, decimals)).toEqual(
          (123456789).toString(16),
        );
      });
    });
  });

  describe("number", () => {
    describe("should properly format number in number format", () => {
      it("without option", () => {
        expect(format.number.of(number)).toEqual("12345.6789");
      });
      it("with digits", () => {
        expect(format.number.digits(2).of(number)).toEqual("12345.67");
      });
      it("with min", () => {
        expect(format.number.min(20000).of(number)).toEqual("< 20000.0000");
      });
      it("with max", () => {
        expect(format.number.max(10000).of(number)).toEqual("> 10000.0000");
      });
      it("with sign", () => {
        expect(format.number.sign().of(number)).toEqual("+12345.6789");
      });
      it("with unit", () => {
        expect(format.number.unit("$").of(number)).toEqual("$12345.6789");
      });
      it("without trailing zeros", () => {
        expect(format.number.digits(6).of(number)).toEqual("12345.678900");
        expect(format.number.digits(6).removeTrailingZero().of(number)).toEqual(
          "12345.6789",
        );
      });
      it("with locale", () => {
        expect(format.number.locale("fr-FR").of(number)).toEqual("12345,6789");
      });
      it.only("with really small numbers", () => {
        expect(format.number.of(1.23e-30)).toEqual(
          "0.00000000000000000000000000000123",
        );
        expect(format.number.of(0.99e-12)).toEqual("0.00000000000099");
      });
      it.only("with really big numbers", () => {
        expect(format.number.of(1e30)).toEqual("1" + "0".repeat(30));
        expect(format.number.of(1.234e30)).toEqual("1234" + "0".repeat(27));
        expect(format.number.of(1.234e2)).toEqual("123.4");
      });
    });
    describe("should properly format bigint in number format", () => {
      it("without option", () => {
        expect(format.number.of(bigint, decimals)).toEqual("12345.6789");
      });
      it("with digits", () => {
        expect(format.number.digits(2).of(bigint, decimals)).toEqual(
          "12345.67",
        );
      });
      it("with min", () => {
        expect(format.number.min(20000).of(bigint, decimals)).toEqual(
          "< 20000.0000",
        );
      });
      it("with max", () => {
        expect(format.number.max(10000).of(bigint, decimals)).toEqual(
          "> 10000.0000",
        );
      });
      it("with sign", () => {
        expect(format.number.sign().of(bigint, decimals)).toEqual(
          "+12345.6789",
        );
      });
      it("with unit", () => {
        expect(format.number.unit("$").of(bigint, decimals)).toEqual(
          "$12345.6789",
        );
      });
      it("without trailing zeros", () => {
        expect(format.number.digits(6).of(bigint, decimals)).toEqual(
          "12345.678900",
        );
        expect(
          format.number.digits(6).removeTrailingZero().of(bigint, decimals),
        ).toEqual("12345.6789");
      });
      it("with locale", () => {
        expect(format.number.locale("fr-FR").of(bigint, decimals)).toEqual(
          "12345,6789",
        );
      });
    });
  });

  describe("short", () => {
    describe("should properly format number in short format", () => {
      it("without option", () => {
        expect(format.short.of(number)).toEqual("12.3456789k");
      });
      it("with digits", () => {
        expect(format.short.digits(2).of(number)).toEqual("12.34k");
      });
      it("with min", () => {
        expect(format.short.min(20000).of(number)).toEqual("< 20.0000000k");
      });
      it("with max", () => {
        expect(format.short.max(10000).of(number)).toEqual("> 10.0000000k");
      });
      it("with sign", () => {
        expect(format.short.sign().of(number)).toEqual("+12.3456789k");
      });
      it("with unit", () => {
        expect(format.short.unit("€").of(number)).toEqual("12.3456789k €");
      });
      it("without trailing zeros", () => {
        expect(format.short.digits(8).of(number)).toEqual("12.34567890k");
        expect(format.short.digits(8).removeTrailingZero().of(number)).toEqual(
          "12.3456789k",
        );
      });
      it("with small numbers with commas", () => {
        expect(format.short.smallValuesWithCommas().of(number / 10)).toEqual(
          "1,234.56789",
        );
      });
      it("with locale", () => {
        expect(format.short.locale("fr-FR").of(number)).toEqual("12,3456789k");
      });
    });
    describe("should properly format bigint in short format", () => {
      it("without option", () => {
        expect(format.short.of(bigint, decimals)).toEqual("12.3456789k");
      });
      it("with digits", () => {
        expect(format.short.digits(2).of(bigint, decimals)).toEqual("12.34k");
      });
      it("with min", () => {
        expect(format.short.min(20000).of(bigint, decimals)).toEqual(
          "< 20.0000000k",
        );
      });
      it("with max", () => {
        expect(format.short.max(10000).of(bigint, decimals)).toEqual(
          "> 10.0000000k",
        );
      });
      it("with sign", () => {
        expect(format.short.sign().of(bigint, decimals)).toEqual(
          "+12.3456789k",
        );
      });
      it("with unit", () => {
        expect(format.short.unit("€").of(bigint, decimals)).toEqual(
          "12.3456789k €",
        );
      });
      it("without trailing zeros", () => {
        expect(format.short.digits(8).of(bigint, decimals)).toEqual(
          "12.34567890k",
        );
        expect(
          format.short.digits(8).removeTrailingZero().of(bigint, decimals),
        ).toEqual("12.3456789k");
      });
      it("with locale", () => {
        expect(format.short.locale("fr-FR").of(bigint, decimals)).toEqual(
          "12,3456789k",
        );
      });
      it("with small numbers with commas", () => {
        expect(
          format.short.smallValuesWithCommas().of(bigint, decimals + 1),
        ).toEqual("1,234.56789");
      });
      it("with small numbers with commas with locale", () => {
        expect(
          format.short
            .smallValuesWithCommas()
            .locale("fr-FR")
            .of(bigint, decimals + 1),
          // the correct space in fr-FR is narrow no-break space (U+202F)
        ).toEqual("1\u202F234,56789");
      });
    });
  });

  describe("commas", () => {
    describe("should properly format number in commas format", () => {
      it("without option", () => {
        expect(format.commas.of(number)).toEqual("12,345.6789");
      });
      it("with digits", () => {
        expect(format.commas.digits(2).of(number)).toEqual("12,345.67");
      });
      it("with min", () => {
        expect(format.commas.min(20000).of(number)).toEqual("< 20,000.0000");
      });
      it("with max", () => {
        expect(format.commas.max(10000).of(number)).toEqual("> 10,000.0000");
      });
      it("with sign", () => {
        expect(format.commas.sign().of(number)).toEqual("+12,345.6789");
      });
      it("with unit", () => {
        expect(format.commas.unit("ETH").of(number)).toEqual("12,345.6789 ETH");
      });
      it("without trailing zeros", () => {
        expect(format.commas.digits(6).of(number)).toEqual("12,345.678900");
        expect(format.commas.digits(6).removeTrailingZero().of(number)).toEqual(
          "12,345.6789",
        );
      });
      it("with locale", () => {
        expect(format.commas.locale("fr-FR").of(number)).toEqual(
          "12\u202F345,6789",
        );
      });
    });
    describe("should properly format bigint in commas format", () => {
      it("without option", () => {
        expect(format.commas.of(bigint, decimals)).toEqual("12,345.6789");
      });
      it("with digits", () => {
        expect(format.commas.digits(2).of(bigint, decimals)).toEqual(
          "12,345.67",
        );
      });
      it("with min", () => {
        expect(format.commas.min(20000).of(bigint, decimals)).toEqual(
          "< 20,000.0000",
        );
      });
      it("with max", () => {
        expect(format.commas.max(10000).of(bigint, decimals)).toEqual(
          "> 10,000.0000",
        );
      });
      it("with sign", () => {
        expect(format.commas.sign().of(bigint, decimals)).toEqual(
          "+12,345.6789",
        );
      });
      it("with unit", () => {
        expect(format.commas.unit("ETH").of(bigint, decimals)).toEqual(
          "12,345.6789 ETH",
        );
      });
      it("without trailing zeros", () => {
        expect(format.commas.digits(6).of(bigint, decimals)).toEqual(
          "12,345.678900",
        );
        expect(
          format.commas.digits(6).removeTrailingZero().of(bigint, decimals),
        ).toEqual("12,345.6789");
      });
      it("with locale", () => {
        // the correct space in fr-FR is narrow no-break space (U+202F)
        expect(format.commas.locale("fr-FR").of(bigint, decimals)).toEqual(
          "12\u202F345,6789",
        );
      });
    });
  });

  describe("percent", () => {
    describe("should properly format number in percent format", () => {
      it("without option", () => {
        expect(format.percent.of(number)).toEqual("1234567.8900");
      });
      it("with digits", () => {
        expect(format.percent.digits(1).of(number)).toEqual("1234567.8");
      });
      it("with min", () => {
        expect(format.percent.min(20000).of(number)).toEqual("< 2000000.0000");
      });
      it("with max", () => {
        expect(format.percent.max(10000).of(number)).toEqual("> 1000000.0000");
      });
      it("with sign", () => {
        expect(format.percent.sign().of(number)).toEqual("+1234567.8900");
      });
      it("with unit", () => {
        expect(format.percent.unit("%").of(number)).toEqual("1234567.8900%");
      });
      it("without trailing zeros", () => {
        expect(format.percent.removeTrailingZero().of(number)).toEqual(
          "1234567.89",
        );
      });
      it("with locale", () => {
        expect(format.percent.locale("fr-FR").of(number)).toEqual(
          "1234567,8900",
        );
      });
    });
    describe("should properly format bigint in percent format", () => {
      it("without option", () => {
        expect(format.percent.of(bigint, decimals)).toEqual("1234567.8900");
      });
      it("with digits", () => {
        expect(format.percent.digits(1).of(bigint, decimals)).toEqual(
          "1234567.8",
        );
      });
      it("with min", () => {
        expect(format.percent.min(20000).of(bigint, decimals)).toEqual(
          "< 2000000.0000",
        );
      });
      it("with max", () => {
        expect(format.percent.max(10000).of(bigint, decimals)).toEqual(
          "> 1000000.0000",
        );
      });
      it("with sign", () => {
        expect(format.percent.sign().of(bigint, decimals)).toEqual(
          "+1234567.8900",
        );
      });
      it("with unit", () => {
        expect(format.percent.unit("%").of(bigint, decimals)).toEqual(
          "1234567.8900%",
        );
      });
      it("without trailing zeros", () => {
        expect(
          format.percent.removeTrailingZero().of(bigint, decimals),
        ).toEqual("1234567.89");
      });
      it("with locale", () => {
        expect(format.percent.locale("fr-FR").of(bigint, decimals)).toEqual(
          "1234567,8900",
        );
      });
    });
  });
});
