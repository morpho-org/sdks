import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { InvalidAddressError, maxUint96, maxUint256, zeroAddress } from "viem";
import { base, mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { UnsupportedErc20ApprovalSpenderError } from "../../types/index.js";
import {
  getParsedRequirementsApproval,
  getRequirementsApproval,
  parseRequirementsApproval,
} from "./getRequirementsApproval.js";

const usdc = getChainAddress(ChainId.EthMainnet, "usdc");
const usdt = getChainAddress(ChainId.EthMainnet, "usdt");
const lowercaseUsdt = usdt.toLowerCase() as Address;
const blueBundlesV1 = getChainAddress(
  ChainId.EthMainnet,
  "bundles.blueBundlesV1",
);
const uni = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" as Address;

describe("getRequirementsApproval", () => {
  test.each([
    { allowances: 0n, error: UnsupportedErc20ApprovalSpenderError },
    { allowances: 1n, error: InvalidAddressError },
  ])(
    "keeps main's reset-token error precedence with allowance $allowances",
    ({ allowances, error }) => {
      expect(() =>
        getRequirementsApproval({
          address: "0x123",
          chainId: mainnet.id,
          args: { spendAmount: 2n, spender: zeroAddress },
          allowances,
        }),
      ).toThrow(error);
    },
  );

  test("without a reset-token list the spender error still wins over the malformed token", () => {
    expect(() =>
      getRequirementsApproval({
        address: "0x123",
        chainId: base.id,
        args: { spendAmount: 2n, spender: zeroAddress },
        allowances: 0n,
      }),
    ).toThrow(UnsupportedErc20ApprovalSpenderError);
  });

  test("no-op allowance skips even malformed token, spender and chain inputs", () => {
    expect(
      getRequirementsApproval({
        address: "0x123",
        chainId: 999_999,
        args: { spendAmount: 2n, spender: zeroAddress },
        allowances: 2n,
      }),
    ).toEqual([]);
  });

  test("the complete constructor owns reset order, approval caps and invocation values", () => {
    const args = { spendAmount: 2n, spender: blueBundlesV1 };
    const params = { address: usdt, chainId: mainnet.id, args, allowances: 1n };
    const parsed = parseRequirementsApproval(params);
    params.address = uni;
    args.spender = zeroAddress;
    args.spendAmount = 0n;
    const approvals = getParsedRequirementsApproval(parsed);
    expect(
      approvals.map(({ to, action }) => ({ to, args: action.args })),
    ).toEqual([
      { to: usdt, args: { spender: blueBundlesV1, amount: 0n } },
      { to: usdt, args: { spender: blueBundlesV1, amount: maxUint256 } },
    ]);
    expect(approvals.every(Object.isFrozen)).toBe(true);
  });

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
