import { describe, expect, test } from "vitest";
import { MissingTransactionPlanCallError } from "./errors.js";

describe("MissingTransactionPlanCallError", () => {
  test("default", () => {
    const error = new MissingTransactionPlanCallError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MissingTransactionPlanCallError");
  });
});
