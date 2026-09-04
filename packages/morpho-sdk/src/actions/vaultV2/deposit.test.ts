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
  ReferralFeeRecipientMissingError,
} from "../../types/index.js";
import { vaultV2Deposit } from "./deposit.js";

const chainId = mainnet.id;
const vault = "0x0000000000000000000000000000000000000011" as const;
const userAddress = "0x0000000000000000000000000000000000000012" as const;
const referralFeeRecipient =
  "0x0000000000000000000000000000000000000013" as const;
const deadline = 1_900_000_000n;
const { usdc, wNative } = addressesRegistry[chainId];
const positiveUint128 = fc.bigInt({ min: 1n, max: (1n << 128n) - 1n });

describe("vaultV2Deposit", () => {
  test("default", () => {
    const referralFeePct = MathLib.WAD / 5n;
    const transaction = vaultV2Deposit({
      vault: { chainId, address: vault, asset: usdc },
      args: {
        amount: 100n,
        maxSharePrice: 3n,
        userAddress,
        referralFeePct,
        referralFeeRecipient,
        deadline,
      },
    });
    expect(transaction.to).toBe(
      getChainAddress(chainId, "bundles.vaultBundlesV1"),
    );
    expect(transaction.action.args).toEqual({
      vault,
      amount: 100n,
      maxSharePrice: 3n,
      nativeAmount: undefined,
      referralFeePct,
      referralFeeRecipient,
      referralFeeAssets: 20n,
      netAssets: 80n,
      deadline,
    });
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
          const transaction = vaultV2Deposit({
            vault: { chainId, address: vault, asset: usdc },
            args: {
              amount,
              maxSharePrice,
              userAddress,
              deadline: generatedDeadline,
            },
          });
          expect(
            decodeFunctionData({
              abi: vaultBundlesV1Abi,
              data: transaction.data,
            }),
          ).toEqual({
            functionName: "vaultBundlesV1Deposit",
            args: [
              vault,
              amount,
              maxSharePrice,
              { kind: 0, data: "0x" },
              0n,
              zeroAddress,
              generatedDeadline,
            ],
          });
        },
      ),
      { numRuns: 50, seed: 20_260_902 },
    );
  });

  test("behavior: native funding is exclusive", () => {
    const transaction = vaultV2Deposit({
      vault: { chainId, address: vault, asset: wNative },
      args: {
        nativeAmount: 5n,
        maxSharePrice: 1n,
        userAddress,
        deadline,
      },
    });
    expect(transaction.value).toBe(5n);

    const mixedFunding = {
      amount: 5n,
      nativeAmount: 5n,
    } as unknown as BundlesFundingArgs;
    expect(() =>
      vaultV2Deposit({
        vault: { chainId, address: vault, asset: wNative },
        args: {
          ...mixedFunding,
          maxSharePrice: 1n,
          userAddress,
          deadline,
        },
      }),
    ).toThrow(MixedBundlesFundingError);
  });

  test("error: ReferralFeeRecipientMissingError", () => {
    expect(() =>
      vaultV2Deposit({
        vault: { chainId, address: vault, asset: usdc },
        args: {
          amount: 1n,
          maxSharePrice: 1n,
          userAddress,
          referralFeePct: 1n,
          deadline,
        },
      }),
    ).toThrow(ReferralFeeRecipientMissingError);
  });
});
