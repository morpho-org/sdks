import { addressesRegistry, MathLib } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import fc from "fast-check";
import { maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  isRequirementApproval,
  isRequirementSignature,
  Permit2TransferFromNonceAlreadyUsedError,
} from "../../types/index.js";
import { resolveBundlesTokenRequirements } from "./resolveBundlesTokenRequirements.js";

const chainId = mainnet.id;
const { usdc, permit2 } = addressesRegistry[chainId];
const spender = getChainAddress(chainId, "bundles.vaultBundlesV1");
const owner = "0x0000000000000000000000000000000000000001" as const;
const deadline = 1_900_000_000n;

describe("resolveBundlesTokenRequirements", () => {
  test("behavior: direct approval resolution is deterministic", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: (1n << 128n) - 1n }),
        fc.boolean(),
        (amount, sufficient) => {
          const requirements = resolveBundlesTokenRequirements({
            token: usdc,
            spender,
            owner,
            chainId,
            amount,
            deadline,
            state: {
              type: "approval",
              allowance: sufficient ? amount : amount - 1n,
              approvalAmount: amount,
            },
          });
          expect(requirements).toHaveLength(sufficient ? 0 : 1);
          if (!sufficient) {
            expect(isRequirementApproval(requirements[0])).toBe(true);
            expect(requirements[0]?.action).toMatchObject({
              type: "erc20Approval",
              args: { spender, amount },
            });
          }
        },
      ),
      { numRuns: 100, seed: 20_260_910 },
    );
  });

  test("behavior: Permit2 approval precedes SignatureTransfer and preserves nonce", () => {
    const amount = MathLib.MAX_UINT_160 + 1n;
    const requirements = resolveBundlesTokenRequirements({
      token: usdc,
      spender,
      owner,
      chainId,
      amount,
      deadline,
      state: {
        type: "permit2TransferFrom",
        permit2,
        permit2Allowance: 0n,
        permit2Nonce: 257n,
        nonceBitmap: 0n,
      },
    });

    expect(isRequirementApproval(requirements[0])).toBe(true);
    expect(requirements[0]?.action).toMatchObject({
      type: "erc20Approval",
      args: { spender: permit2, amount: maxUint256 },
    });
    expect(isRequirementSignature(requirements[1])).toBe(true);
    expect(requirements[1]?.action).toEqual({
      type: "permit2TransferFrom",
      args: { spender, amount, nonce: 257n, deadline },
    });
  });

  test("behavior: distinct caller-selected nonces remain distinct", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), (nonce) => {
        const requirement = resolveBundlesTokenRequirements({
          token: usdc,
          spender,
          owner,
          chainId,
          amount: 1n,
          deadline,
          state: {
            type: "permit2TransferFrom",
            permit2,
            permit2Allowance: maxUint256,
            permit2Nonce: BigInt(nonce),
            nonceBitmap: 0n,
          },
        })[0];
        expect(requirement?.action).toMatchObject({
          type: "permit2TransferFrom",
          args: { nonce: BigInt(nonce) },
        });
      }),
      { numRuns: 100, seed: 20_260_911 },
    );
  });

  test("error: Permit2TransferFromNonceAlreadyUsedError", () => {
    expect(() =>
      resolveBundlesTokenRequirements({
        token: usdc,
        spender,
        owner,
        chainId,
        amount: 1n,
        deadline,
        state: {
          type: "permit2TransferFrom",
          permit2,
          permit2Allowance: maxUint256,
          permit2Nonce: 7n,
          nonceBitmap: 1n << 7n,
        },
      }),
    ).toThrow(Permit2TransferFromNonceAlreadyUsedError);
  });
});
