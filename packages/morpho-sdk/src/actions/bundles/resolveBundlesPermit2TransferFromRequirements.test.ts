import { addressesRegistry } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  InputExceedsMaxError,
  isRequirementApproval,
  isRequirementSignature,
  NegativeInputError,
  NonPositiveInputError,
  Permit2TransferFromNonceAlreadyUsedError,
} from "../../types/index.js";
import { resolveBundlesPermit2TransferFromRequirements } from "./resolveBundlesPermit2TransferFromRequirements.js";

const chainId = mainnet.id;
const { usdc, permit2 } = addressesRegistry[chainId];
const spender = getChainAddress(chainId, "bundles.vaultBundlesV1");
const owner = "0x0000000000000000000000000000000000000001" as const;
const deadline = 1_900_000_000n;

describe("resolveBundlesPermit2TransferFromRequirements", () => {
  test("default", () => {
    const requirements = resolveBundlesPermit2TransferFromRequirements({
      token: usdc,
      spender,
      owner,
      chainId,
      amount: 1_000_000n,
      deadline,
      permit2,
      allowance: 0n,
      nonce: 42n,
      nonceBitmap: 0n,
    });

    expect(isRequirementApproval(requirements[0])).toBe(true);
    expect(requirements[0]?.action).toMatchObject({
      type: "erc20Approval",
      args: { spender: permit2, amount: maxUint256 },
    });
    expect(isRequirementSignature(requirements[1])).toBe(true);
    expect(requirements[1]?.action).toEqual({
      type: "permit2TransferFrom",
      args: { spender, amount: 1_000_000n, deadline },
    });
  });

  test("behavior: skips the approval when Permit2 allowance is sufficient", () => {
    const requirements = resolveBundlesPermit2TransferFromRequirements({
      token: usdc,
      spender,
      owner,
      chainId,
      amount: 1_000_000n,
      deadline,
      permit2,
      allowance: 1_000_000n,
      nonce: 42n,
      nonceBitmap: 0n,
    });

    expect(requirements).toHaveLength(1);
    expect(isRequirementSignature(requirements[0])).toBe(true);
  });

  test("error: NegativeInputError", () => {
    expect(() =>
      resolveBundlesPermit2TransferFromRequirements({
        token: usdc,
        spender,
        owner,
        chainId,
        amount: 1n,
        deadline,
        permit2,
        allowance: 0n,
        nonce: -1n,
        nonceBitmap: 0n,
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: InputExceedsMaxError", () => {
    expect(() =>
      resolveBundlesPermit2TransferFromRequirements({
        token: usdc,
        spender,
        owner,
        chainId,
        amount: 1n,
        deadline,
        permit2,
        allowance: 0n,
        nonce: maxUint256 + 1n,
        nonceBitmap: 0n,
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: NonPositiveInputError", () => {
    expect(() =>
      resolveBundlesPermit2TransferFromRequirements({
        token: usdc,
        spender,
        owner,
        chainId,
        amount: 1n,
        deadline: 0n,
        permit2,
        allowance: 0n,
        nonce: 42n,
        nonceBitmap: 0n,
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: Permit2TransferFromNonceAlreadyUsedError", () => {
    expect(() =>
      resolveBundlesPermit2TransferFromRequirements({
        token: usdc,
        spender,
        owner,
        chainId,
        amount: 1n,
        deadline,
        permit2,
        allowance: maxUint256,
        nonce: 7n,
        nonceBitmap: 1n << 7n,
      }),
    ).toThrow(Permit2TransferFromNonceAlreadyUsedError);
  });
});
