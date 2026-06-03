import { describe, expect, test } from "vitest";

import { ORACLE_PRICE_SCALE } from "./constants.js";
import { MathLib } from "./math.js";

describe("ORACLE_PRICE_SCALE", () => {
  test("default", () => {
    expect(ORACLE_PRICE_SCALE).toBe(MathLib.WAD * MathLib.WAD);
  });
});
