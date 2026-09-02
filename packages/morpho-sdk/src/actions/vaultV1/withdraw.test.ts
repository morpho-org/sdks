import { MathLib } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import fc from "fast-check";
import { decodeFunctionData, maxUint256, zeroHash } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { vaultBundlesV1Abi } from "../../abis.js";
import { NonPositiveInputError } from "../../types/index.js";
import { vaultV1Withdraw } from "./withdraw.js";

const chainId = mainnet.id;
const vault = "0x0000000000000000000000000000000000000021" as const;
const userAddress = "0x0000000000000000000000000000000000000022" as const;
const feeRecipient = "0x0000000000000000000000000000000000000023" as const;
const positiveUint256 = fc.bigInt({ min: 1n, max: maxUint256 });

describe("vaultV1Withdraw", () => {
  test("default", () => {
    const deadline = 1_900_000_000n;
    const referralFeePct = MathLib.WAD / 4n;
    const transaction = vaultV1Withdraw({
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
    expect(transaction.value).toBe(0n);
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
    expect(transaction.action.args).toMatchObject({
      referralFeeAssets: 25n,
      netAssets: 75n,
    });
  });

  test("behavior: calldata round-trips across uint256 inputs", () => {
    fc.assert(
      fc.property(positiveUint256, positiveUint256, (amount, deadline) => {
        const transaction = vaultV1Withdraw({
          vault: { chainId, address: vault },
          args: { amount, userAddress, deadline },
        });
        const decoded = decodeFunctionData({
          abi: vaultBundlesV1Abi,
          data: transaction.data,
        });
        expect(decoded.functionName).toBe("vaultBundlesV1Withdraw");
        expect(decoded.args?.[0]).toBe(vault);
        expect(decoded.args?.[1]).toBe(amount);
        expect(decoded.args?.[2]).toBe(0n);
        expect(decoded.args?.[6]).toBe(deadline);
      }),
      { numRuns: 50, seed: 20_260_903 },
    );
  });

  test("error: NonPositiveInputError", () => {
    expect(() =>
      vaultV1Withdraw({
        vault: { chainId, address: vault },
        args: { amount: 0n, userAddress, deadline: 1n },
      }),
    ).toThrow(NonPositiveInputError);
  });
});
