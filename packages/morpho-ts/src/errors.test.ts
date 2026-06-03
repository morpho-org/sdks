import { describe, expect, test } from "vitest";

import { UnsupportedChainIdError } from "./errors.js";

describe("UnsupportedChainIdError", () => {
  test("default", () => {
    const error = new UnsupportedChainIdError(999);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("UnsupportedChainIdError");
    expect(error.code).toBe("UNSUPPORTED_CHAIN");
    expect(error.chainId).toBe(999);
    expect(error.message).toContain("999");
  });
});
