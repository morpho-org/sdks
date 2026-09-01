import { addressesRegistry, MathLib } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import fc from "fast-check";
import { createWalletClient, http, maxUint256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
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
const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const owner = account.address;
const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http(),
});
const deadline = 1_900_000_000n;

describe("resolveBundlesTokenRequirements", () => {
  test("behavior: direct approval resolution is deterministic", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: (1n << 128n) - 1n }),
        fc.boolean(),
        (amount, sufficient) => {
          const requirements = resolveBundlesTokenRequirements({
            type: "approval",
            token: usdc,
            spender,
            chainId,
            amount,
            allowance: sufficient ? amount : amount - 1n,
            approvalAmount: amount,
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

  test("behavior: Permit2 approval precedes SignatureTransfer and preserves nonce", async () => {
    const amount = MathLib.MAX_UINT_160 + 1n;
    const requirements = resolveBundlesTokenRequirements({
      type: "permit2TransferFrom",
      token: usdc,
      spender,
      owner,
      chainId,
      amount,
      deadline,
      permit2,
      allowance: 0n,
      nonce: 257n,
      nonceBitmap: 0n,
    });

    expect(isRequirementApproval(requirements[0])).toBe(true);
    expect(requirements[0]?.action).toMatchObject({
      type: "erc20Approval",
      args: { spender: permit2, amount: maxUint256 },
    });
    const requirement = requirements[1];
    expect(isRequirementSignature(requirement)).toBe(true);
    expect(requirement?.action).toEqual({
      type: "permit2TransferFrom",
      args: { spender, amount, deadline },
    });
    if (!isRequirementSignature(requirement)) {
      throw new Error("SignatureTransfer requirement is missing");
    }
    const signed = await requirement.sign(walletClient, owner);
    expect(signed.args.nonce).toBe(257n);
  });

  test("behavior: distinct caller-selected nonces remain distinct", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 255 }), async (nonce) => {
        const requirement = resolveBundlesTokenRequirements({
          type: "permit2TransferFrom",
          token: usdc,
          spender,
          owner,
          chainId,
          amount: 1n,
          deadline,
          permit2,
          allowance: maxUint256,
          nonce: BigInt(nonce),
          nonceBitmap: 0n,
        })[0];
        if (!isRequirementSignature(requirement)) {
          throw new Error("SignatureTransfer requirement is missing");
        }
        const signed = await requirement.sign(walletClient, owner);
        expect(signed.args.nonce).toBe(BigInt(nonce));
      }),
      { numRuns: 100, seed: 20_260_911 },
    );
  });

  test("error: Permit2TransferFromNonceAlreadyUsedError", () => {
    expect(() =>
      resolveBundlesTokenRequirements({
        type: "permit2TransferFrom",
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
