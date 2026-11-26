import { MathLib } from "@morpho-org/blue-sdk";
import { expect, test } from "vitest";
import {
  InputExceedsMaxError,
  InvalidBigIntInputError,
  NegativeInputError,
} from "../types/error.js";
import { resolveMaxPenalty } from "./reallocationPenalty.js";

test.each([undefined, 0n, 1n, MathLib.WAD])(
  "resolves a valid bound %s",
  (value) => {
    expect(resolveMaxPenalty(value)).toBe(value === undefined ? 0n : value);
  },
);

test.each([0, 1, NaN, Infinity, "1", null, true, {}])(
  "rejects a non-bigint bound %s",
  (value) => {
    expect(() => resolveMaxPenalty(value)).toThrow(InvalidBigIntInputError);
    expect(() => resolveMaxPenalty(value)).toThrow(
      expect.objectContaining({
        field: "maxPenalty",
        value,
      }),
    );
  },
);

test.each([
  { value: -1n, ErrorClass: NegativeInputError },
  { value: MathLib.WAD + 1n, ErrorClass: InputExceedsMaxError },
])("rejects an out-of-range bound $value", ({ value, ErrorClass }) => {
  expect(() => resolveMaxPenalty(value)).toThrow(ErrorClass);
});
