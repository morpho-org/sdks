import { MathLib } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import fc from "fast-check";
import { decodeFunctionData, maxUint256, zeroHash } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { vaultBundlesV1Abi } from "../../abis.js";
import { NonPositiveInputError } from "../../types/index.js";
import { vaultV2Withdraw } from "./withdraw.js";

const chainId = mainnet.id;
const vault = "0x0000000000000000000000000000000000000041" as const;
const userAddress = "0x0000000000000000000000000000000000000042" as const;
const feeRecipient = "0x0000000000000000000000000000000000000043" as const;
const positiveUint256 = fc.bigInt({ min: 1n, max: maxUint256 });

describe("vaultV2Withdraw", () => {
  test("default", () => {
    const deadline = 1_900_000_000n;
    const referralFeePct = MathLib.WAD / 2n;
    const transaction = vaultV2Withdraw({
      vault: { chainId, address: vault },
      args: {
        amount: 100n,
        userAddress,
        referralFeePct,
        referralFeeRecipient: feeRecipient,
        deadline,
      },
    });
    expect(transaction.to).toBe(
      getChainAddress(chainId, "bundles.vaultBundlesV1"),
    );
    expect(
      decodeFunctionData({ abi: vaultBundlesV1Abi, data: transaction.data }),
    ).toEqual({
      functionName: "vaultBundlesV1Withdraw",
      args: [
        vault,
        100n,
        0n,
        { value: 0n, nonce: 0n, deadline, v: 0, r: zeroHash, s: zeroHash },
        referralFeePct,
        feeRecipient,
        deadline,
      ],
    });
    expect(transaction.action.args.referralFeeAssets).toBe(50n);
    expect(transaction.action.args.netAssets).toBe(50n);
  });

  test("behavior: calldata round-trips across uint256 inputs", () => {
    fc.assert(
      fc.property(positiveUint256, positiveUint256, (amount, deadline) => {
        const transaction = vaultV2Withdraw({
          vault: { chainId, address: vault },
          args: { amount, userAddress, deadline },
        });
        const decoded = decodeFunctionData({
          abi: vaultBundlesV1Abi,
          data: transaction.data,
        });
        expect(decoded.functionName).toBe("vaultBundlesV1Withdraw");
        expect(decoded.args?.[1]).toBe(amount);
        expect(decoded.args?.[2]).toBe(0n);
        expect(decoded.args?.[6]).toBe(deadline);
      }),
      { numRuns: 50, seed: 20_260_905 },
    );
  });

  test("error: NonPositiveInputError", () => {
    expect(() =>
      vaultV2Withdraw({
        vault: { chainId, address: vault },
        args: { amount: -1n, userAddress, deadline: 1n },
      }),
    ).toThrow(NonPositiveInputError);
  });
});
