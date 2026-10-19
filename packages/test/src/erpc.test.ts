import { describe, expect, test } from "vitest";
import { getErpcForkUrl } from "./erpc.js";

describe("getErpcForkUrl", () => {
  test("behavior: builds the eRPC URL with an encoded secret", () => {
    expect(getErpcForkUrl(8453, "a b/c")).toBe(
      "https://rpc.morpho.dev/cache/evm/8453?secret=a%20b%2Fc",
    );
  });

  test("behavior: returns undefined without a secret", () => {
    expect(getErpcForkUrl(8453, undefined)).toBeUndefined();
  });

  test("behavior: returns undefined for an empty secret", () => {
    expect(getErpcForkUrl(8453, "")).toBeUndefined();
  });
});
