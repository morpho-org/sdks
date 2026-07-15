import { describe, expect, test } from "vitest";
import { MidnightOfferSideMismatchError } from "../types/index.js";
import { validateOfferSides } from "./validateOfferSides.js";

describe("validateOfferSides", () => {
  test.each([true, false])("default: accepts matching buy=%s offers", (buy) => {
    expect(() => validateOfferSides([{ buy }, { buy }], buy)).not.toThrow();
  });

  test("behavior: accepts an empty iterable", () => {
    expect(() => validateOfferSides([], true)).not.toThrow();
  });

  test("error: MidnightOfferSideMismatchError at a nonzero index", () => {
    expect(() =>
      validateOfferSides([{ buy: true }, { buy: false }], true),
    ).toThrow(MidnightOfferSideMismatchError);
  });
});
