import { describe, expect, test } from "vitest";
import { computeVaultV2Reallocations } from "./index.js";

describe("package root exports", () => {
  test("exports computeVaultV2Reallocations", () => {
    expect(computeVaultV2Reallocations).toBeTypeOf("function");
  });
});
