import { addressesRegistry, MathLib } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import fc from "fast-check";
import { decodeFunctionData, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { vaultBundlesV1Abi } from "../../abis.js";
import {
  type BundlesFundingArgs,
  MixedBundlesFundingError,
  NonPositiveInputError,
  ReferralFeePctExceededError,
  ReferralFeeRecipientMissingError,
  UnexpectedRequirementSignatureError,
} from "../../types/index.js";
import { vaultV1Deposit } from "./deposit.js";

const chainId = mainnet.id;
const vault = "0x0000000000000000000000000000000000000001" as const;
const userAddress = "0x0000000000000000000000000000000000000002" as const;
const referralFeeRecipient =
  "0x0000000000000000000000000000000000000003" as const;
const deadline = 1_900_000_000n;
const { usdc, wNative } = addressesRegistry[chainId];
const positiveUint128 = fc.bigInt({ min: 1n, max: (1n << 128n) - 1n });

describe("vaultV1Deposit", () => {
  test.each(["permit", "permit2SignatureTransfer"] as const)(
    "error: UnexpectedRequirementSignatureError for native funding with %s",
    (type) => {
      const args = {
        spender: getChainAddress(chainId, "bundles.vaultBundlesV1"),
        amount: 7n,
        deadline,
      };
      const permitArgs = {
        owner: userAddress,
        asset: wNative,
        amount: 7n,
        nonce: 0n,
        deadline,
        signature: "0x" as const,
      };
      const requirementSignature =
        type === "permit"
          ? { args: permitArgs, action: { type, args } }
          : {
              args: permitArgs,
              action: { type, args: { ...args, nonce: 0n } },
            };
      expect(() =>
        vaultV1Deposit({
          vault: { chainId, address: vault, asset: wNative },
          args: {
            nativeAmount: 7n,
            maxSharePrice: 2n,
            userAddress,
            deadline,
            requirementSignature,
          },
        }),
      ).toThrow(UnexpectedRequirementSignatureError);
    },
  );

  test("default", () => {
    const referralFeePct = MathLib.WAD / 10n;
    const transaction = vaultV1Deposit({
      vault: { chainId, address: vault, asset: usdc },
      args: {
        amount: 100n,
        maxSharePrice: 2n,
        userAddress,
        referralFeePct,
        referralFeeRecipient,
        deadline,
      },
    });

    expect(transaction.to).toBe(
      getChainAddress(chainId, "bundles.vaultBundlesV1"),
    );
    expect(transaction.value).toBe(0n);
    expect(
      decodeFunctionData({ abi: vaultBundlesV1Abi, data: transaction.data }),
    ).toEqual({
      functionName: "vaultBundlesV1Deposit",
      args: [
        vault,
        100n,
        2n,
        { kind: 0, data: "0x" },
        referralFeePct,
        referralFeeRecipient,
        deadline,
      ],
    });
    expect(transaction.action.args).toEqual({
      vault,
      amount: 100n,
      maxSharePrice: 2n,
      nativeAmount: undefined,
      referralFeePct,
      referralFeeRecipient,
      referralFeeAssets: 10n,
      netAssets: 90n,
      deadline,
    });
    expect(Object.isFrozen(transaction.action.args)).toBe(true);
  });

  test("behavior: calldata round-trips across bounded primitive inputs", () => {
    fc.assert(
      fc.property(
        fc.record({
          amount: positiveUint128,
          maxSharePrice: positiveUint128,
          deadline: positiveUint128,
        }),
        ({ amount, maxSharePrice, deadline: generatedDeadline }) => {
          const transaction = vaultV1Deposit({
            vault: { chainId, address: vault, asset: usdc },
            args: {
              amount,
              maxSharePrice,
              userAddress,
              deadline: generatedDeadline,
            },
          });
          const decoded = decodeFunctionData({
            abi: vaultBundlesV1Abi,
            data: transaction.data,
          });
          expect(decoded.functionName).toBe("vaultBundlesV1Deposit");
          expect(decoded.args).toEqual([
            vault,
            amount,
            maxSharePrice,
            { kind: 0, data: "0x" },
            0n,
            zeroAddress,
            generatedDeadline,
          ]);
        },
      ),
      { numRuns: 50, seed: 20_260_901 },
    );
  });

  test("behavior: native funding is the transaction value", () => {
    const transaction = vaultV1Deposit({
      vault: { chainId, address: vault, asset: wNative },
      args: {
        nativeAmount: 7n,
        maxSharePrice: 2n,
        userAddress,
        deadline,
      },
    });
    expect(transaction.value).toBe(7n);
    expect(transaction.action.args.nativeAmount).toBe(7n);
  });

  test("error: exclusive funding and referral guards", () => {
    const mixedFunding = {
      amount: 1n,
      nativeAmount: 1n,
    } as unknown as BundlesFundingArgs;
    expect(() =>
      vaultV1Deposit({
        vault: { chainId, address: vault, asset: wNative },
        args: {
          ...mixedFunding,
          maxSharePrice: 1n,
          userAddress,
          deadline,
        },
      }),
    ).toThrow(MixedBundlesFundingError);
    expect(() =>
      vaultV1Deposit({
        vault: { chainId, address: vault, asset: usdc },
        args: { amount: 0n, maxSharePrice: 1n, userAddress, deadline },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      vaultV1Deposit({
        vault: { chainId, address: vault, asset: usdc },
        args: {
          amount: 1n,
          maxSharePrice: 1n,
          userAddress,
          deadline,
          referralFeePct: MathLib.WAD,
        },
      }),
    ).toThrow(ReferralFeePctExceededError);
    expect(() =>
      vaultV1Deposit({
        vault: { chainId, address: vault, asset: usdc },
        args: {
          amount: 1n,
          maxSharePrice: 1n,
          userAddress,
          deadline,
          referralFeePct: 1n,
        },
      }),
    ).toThrow(ReferralFeeRecipientMissingError);
  });
});
