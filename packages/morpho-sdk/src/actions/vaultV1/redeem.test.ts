import { getChainAddress } from "@morpho-org/morpho-ts";
import fc from "fast-check";
import { decodeFunctionData, maxUint256, zeroHash } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { vaultBundlesV1Abi } from "../../abis.js";
import { NonPositiveInputError } from "../../types/index.js";
import { vaultV1Redeem } from "./redeem.js";

const chainId = mainnet.id;
const vault = "0x0000000000000000000000000000000000000031" as const;
const userAddress = "0x0000000000000000000000000000000000000032" as const;
const positiveUint256 = fc.bigInt({ min: 1n, max: maxUint256 });

describe("vaultV1Redeem", () => {
  test("default", () => {
    const deadline = 1_900_000_000n;
    const transaction = vaultV1Redeem({
      vault: { chainId, address: vault },
      args: { shares: 100n, userAddress, deadline },
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
        0n,
        100n,
        { value: 0n, nonce: 0n, deadline, v: 0, r: zeroHash, s: zeroHash },
        0n,
        "0x0000000000000000000000000000000000000000",
        deadline,
      ],
    });
    expect(transaction.action.args).not.toHaveProperty("referralFeeAssets");
    expect(transaction.action.args).not.toHaveProperty("netAssets");
  });

  test("behavior: calldata round-trips across uint256 inputs", () => {
    fc.assert(
      fc.property(positiveUint256, positiveUint256, (shares, deadline) => {
        const transaction = vaultV1Redeem({
          vault: { chainId, address: vault },
          args: { shares, userAddress, deadline },
        });
        const decoded = decodeFunctionData({
          abi: vaultBundlesV1Abi,
          data: transaction.data,
        });
        expect(decoded.functionName).toBe("vaultBundlesV1Withdraw");
        expect(decoded.args?.[1]).toBe(0n);
        expect(decoded.args?.[2]).toBe(shares);
        expect(decoded.args?.[6]).toBe(deadline);
      }),
      { numRuns: 50, seed: 20_260_904 },
    );
  });

  test("error: NonPositiveInputError", () => {
    expect(() =>
      vaultV1Redeem({
        vault: { chainId, address: vault },
        args: { shares: 0n, userAddress, deadline: 1n },
      }),
    ).toThrow(NonPositiveInputError);
  });
});
