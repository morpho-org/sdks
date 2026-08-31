import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
} from "../../test/fixtures/midnight.js";
import { UnsupportedErc20ApprovalSpenderError } from "../types/index.js";
import { validateRequirementSpender } from "./validateRequirementSpender.js";

describe("validateRequirementSpender", () => {
  test("default", () => {
    expect(() =>
      validateRequirementSpender({
        chainId: midnightChainId,
        spender: midnightAddresses.midnightBundles,
        allowed: ["midnightBundles"],
      }),
    ).not.toThrow();
  });

  test("error: UnsupportedErc20ApprovalSpenderError", () => {
    expect(() =>
      validateRequirementSpender({
        chainId: midnightChainId,
        spender: midnightAddresses.midnightBundles,
        allowed: ["midnight"],
      }),
    ).toThrow(UnsupportedErc20ApprovalSpenderError);
  });
});
