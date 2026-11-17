import { expect, test } from "vitest";
import { NonPositiveInputError } from "../types/error.js";
import { validatePositiveInput } from "./validatePositiveInput.js";

test("accepts positive amounts without imposing an upper bound", () => {
  expect(() => validatePositiveInput("assets", 1n)).not.toThrow();
  expect(() => validatePositiveInput("assets", 1n << 256n)).not.toThrow();
});

test.each([0n, -1n])(
  "rejects non-positive amount %s with the original error",
  (value) => {
    expect(() => validatePositiveInput("assets", value)).toThrow(
      new NonPositiveInputError("assets", value),
    );
  },
);
