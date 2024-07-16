import { safeParseNumber } from "./utils";

describe("safeParseNumber", () => {
  it("should parse excessively small number", () => {
    expect(safeParseNumber(0.000000000000000000000000000000042, 18)).toEqual(
      0n,
    );
  });

  it("should parse excessively large number", () => {
    expect(
      safeParseNumber(4200000000000000000000000000000000000, 18).toString(),
    ).toEqual(
      4200000000000000000000000000000000000000000000000000000n.toString(),
    );
  });
});
