import { describe, expect, test } from "vitest";
import { addresses } from "../__test__/fixtures.js";
import { RatifierUtils } from "./RatifierUtils.js";

describe("RatifierUtils.getRatifierInfo", () => {
  test("default", () => {
    expect(
      RatifierUtils.getRatifierInfo({
        bytecode: "0x",
        ecrecoverRatifier: addresses.ecrecoverRatifier,
        setterRatifier: addresses.setterRatifier,
      }),
    ).toEqual({ type: "ecrecover", ratifier: addresses.ecrecoverRatifier });

    expect(
      RatifierUtils.getRatifierInfo({
        bytecode: "0x6000",
        ecrecoverRatifier: addresses.ecrecoverRatifier,
        setterRatifier: addresses.setterRatifier,
      }).type,
    ).toBe("setter");
  });
});
