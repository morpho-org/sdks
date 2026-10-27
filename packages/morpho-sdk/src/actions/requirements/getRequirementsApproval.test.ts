import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { maxUint96, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { UnsupportedErc20ApprovalSpenderError } from "../../types/index.js";
import { getRequirementsApproval } from "./getRequirementsApproval.js";

const usdc = getChainAddress(ChainId.EthMainnet, "usdc");
const usdt = getChainAddress(ChainId.EthMainnet, "usdt");
const lowercaseUsdt = usdt.toLowerCase() as Address;
const blueBundlesV1 = getChainAddress(
  ChainId.EthMainnet,
  "bundles.blueBundlesV1",
);
const uni = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" as Address;

describe("getRequirementsApproval", () => {
  test("default", () => {
    const requirements = getRequirementsApproval({
      address: usdc,
      chainId: mainnet.id,
      args: {
        spendAmount: 1_000n,
        spender: blueBundlesV1,
      },
      allowances: 0n,
    });

    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.action.args.amount).toBe(maxUint256);
  });

  test("behavior: returns no approval when allowance already covers spend", () => {
    expect(
      getRequirementsApproval({
        address: usdc,
        chainId: mainnet.id,
        args: {
          spendAmount: 1_000n,
          spender: blueBundlesV1,
        },
        allowances: 1_000n,
      }),
    ).toEqual([]);
  });

  test.each([
    { casing: "lowercase", address: lowercaseUsdt },
    { casing: "checksummed", address: usdt },
  ])(
    "behavior: resets approve-only-once token with $casing address",
    ({ address }) => {
      const requirements = getRequirementsApproval({
        address,
        chainId: mainnet.id,
        args: {
          spendAmount: 1_000n,
          spender: blueBundlesV1,
        },
        allowances: 1n,
      });

      expect(
        requirements.map((requirement) => requirement.action.args.amount),
      ).toEqual([0n, maxUint256]);
    },
  );

  test("behavior: applies the per-token uint96 approval cap", () => {
    const [approval] = getRequirementsApproval({
      address: uni,
      chainId: mainnet.id,
      args: { spendAmount: 1_000n, spender: blueBundlesV1 },
      allowances: 0n,
    });

    expect(approval?.action.args.amount).toBe(maxUint96);
  });

  test("error: UnsupportedErc20ApprovalSpenderError", () => {
    expect(() =>
      getRequirementsApproval({
        address: usdc,
        chainId: mainnet.id,
        args: {
          spendAmount: 1_000n,
          spender: "0x0000000000000000000000000000000000000001",
        },
        allowances: 0n,
      }),
    ).toThrow(UnsupportedErc20ApprovalSpenderError);
  });
});
