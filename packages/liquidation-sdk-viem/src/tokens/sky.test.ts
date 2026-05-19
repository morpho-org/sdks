import { describe, expect, test } from "vitest";
// importing the index causes registerCustomAddresses to run, populating
// the mainnetAddresses (sky/usds/dai/mkr) used by the helpers below.
import "../addresses.js";
import { mainnetAddresses } from "../addresses.js";
import { Sky } from "./sky.js";

describe("Sky.getAlternativeToken", () => {
  test("usds <-> dai", () => {
    expect(Sky.getAlternativeToken(mainnetAddresses.usds!)).toBe(
      mainnetAddresses.dai,
    );
    expect(Sky.getAlternativeToken(mainnetAddresses.dai!)).toBe(
      mainnetAddresses.usds,
    );
  });
  test("sky <-> mkr", () => {
    expect(Sky.getAlternativeToken(mainnetAddresses.sky!)).toBe(
      mainnetAddresses.mkr,
    );
    expect(Sky.getAlternativeToken(mainnetAddresses.mkr!)).toBe(
      mainnetAddresses.sky,
    );
  });
  test("throws for unsupported tokens", () => {
    expect(() =>
      Sky.getAlternativeToken("0x0000000000000000000000000000000000000001"),
    ).toThrow(/Unsupported token/);
  });
});

describe("Sky.isTokenPair", () => {
  test("returns false when either side is missing", () => {
    expect(Sky.isTokenPair(undefined, mainnetAddresses.dai)).toBe(false);
    expect(Sky.isTokenPair(mainnetAddresses.dai, undefined)).toBe(false);
  });
  test("recognizes the four canonical pairs (both directions)", () => {
    expect(Sky.isTokenPair(mainnetAddresses.usds, mainnetAddresses.dai)).toBe(
      true,
    );
    expect(Sky.isTokenPair(mainnetAddresses.dai, mainnetAddresses.usds)).toBe(
      true,
    );
    expect(Sky.isTokenPair(mainnetAddresses.sky, mainnetAddresses.mkr)).toBe(
      true,
    );
    expect(Sky.isTokenPair(mainnetAddresses.mkr, mainnetAddresses.sky)).toBe(
      true,
    );
  });
  test("returns false for unrelated pairs", () => {
    expect(Sky.isTokenPair(mainnetAddresses.dai, mainnetAddresses.sky)).toBe(
      false,
    );
    expect(Sky.isTokenPair(mainnetAddresses.mkr, mainnetAddresses.dai)).toBe(
      false,
    );
  });
});

describe("Sky.isSkyToken", () => {
  test("returns true for the four sky/maker tokens", () => {
    expect(Sky.isSkyToken(mainnetAddresses.mkr!)).toBe(true);
    expect(Sky.isSkyToken(mainnetAddresses.sky!)).toBe(true);
    expect(Sky.isSkyToken(mainnetAddresses.usds!)).toBe(true);
    expect(Sky.isSkyToken(mainnetAddresses.dai!)).toBe(true);
  });
  test("returns false for unrelated addresses", () => {
    expect(Sky.isSkyToken("0x0000000000000000000000000000000000000001")).toBe(
      false,
    );
  });
});

describe("Sky.getConversionFunction", () => {
  test("usds -> dai", () => {
    expect(
      Sky.getConversionFunction(mainnetAddresses.usds!, mainnetAddresses.dai!),
    ).toBe("usdsToDai");
  });
  test("dai -> usds", () => {
    expect(
      Sky.getConversionFunction(mainnetAddresses.dai!, mainnetAddresses.usds!),
    ).toBe("daiToUsds");
  });
  test("sky -> mkr", () => {
    expect(
      Sky.getConversionFunction(mainnetAddresses.sky!, mainnetAddresses.mkr!),
    ).toBe("skyToMkr");
  });
  test("mkr -> sky", () => {
    expect(
      Sky.getConversionFunction(mainnetAddresses.mkr!, mainnetAddresses.sky!),
    ).toBe("mkrToSky");
  });
  test("throws on unsupported conversion", () => {
    expect(() =>
      Sky.getConversionFunction(mainnetAddresses.dai!, mainnetAddresses.sky!),
    ).toThrow(/Unsupported token conversion/);
  });
});
