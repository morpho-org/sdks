import { addressesRegistry } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  ApprovalAmountLessThanSpendAmountError,
  isRequirementApproval,
  NegativeInputError,
} from "../../types/index.js";
import { resolveBundlesApprovalRequirements } from "./resolveBundlesApprovalRequirements.js";

const chainId = mainnet.id;
const { usdc } = addressesRegistry[chainId];
const spender = getChainAddress(chainId, "bundles.vaultBundlesV1");

describe("resolveBundlesApprovalRequirements", () => {
  test("default", () => {
    const requirements = resolveBundlesApprovalRequirements({
      token: usdc,
      spender,
      chainId,
      amount: 1_000_000n,
      allowance: 0n,
      approvalAmount: 1_000_000n,
    });

    expect(requirements).toHaveLength(1);
    expect(isRequirementApproval(requirements[0])).toBe(true);
    expect(requirements[0]?.action).toMatchObject({
      type: "erc20Approval",
      args: { spender, amount: 1_000_000n },
    });
  });

  test("behavior: returns no requirements when the allowance is sufficient", () => {
    expect(
      resolveBundlesApprovalRequirements({
        token: usdc,
        spender,
        chainId,
        amount: 1_000_000n,
        allowance: 1_000_000n,
        approvalAmount: 1_000_000n,
      }),
    ).toEqual([]);
  });

  test("error: NegativeInputError", () => {
    expect(() =>
      resolveBundlesApprovalRequirements({
        token: usdc,
        spender,
        chainId,
        amount: -1n,
        allowance: 0n,
        approvalAmount: 0n,
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: ApprovalAmountLessThanSpendAmountError", () => {
    expect(() =>
      resolveBundlesApprovalRequirements({
        token: usdc,
        spender,
        chainId,
        amount: 2n,
        allowance: 0n,
        approvalAmount: 1n,
      }),
    ).toThrow(ApprovalAmountLessThanSpendAmountError);
  });
});
