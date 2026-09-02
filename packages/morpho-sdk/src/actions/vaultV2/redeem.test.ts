import { getChainAddress } from "@morpho-org/morpho-ts";
import fc from "fast-check";
import { decodeFunctionData, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { vaultBundlesV1Abi } from "../../abis.js";
import { NonPositiveInputError } from "../../types/index.js";
import { vaultV2Redeem } from "./redeem.js";

const chainId = mainnet.id;
const vault = "0x0000000000000000000000000000000000000051" as const;
const userAddress = "0x0000000000000000000000000000000000000052" as const;
const positiveUint256 = fc.bigInt({ min: 1n, max: maxUint256 });

describe("vaultV2Redeem", () => {
  test("default", () => {
    const transaction = vaultV2Redeem({
      vault: { chainId, address: vault },
      args: { shares: 9n, userAddress, deadline: 11n },
    });
    expect(transaction.to).toBe(
      getChainAddress(chainId, "bundles.vaultBundlesV1"),
    );
    const decoded = decodeFunctionData({
      abi: vaultBundlesV1Abi,
      data: transaction.data,
    });
    expect(decoded.functionName).toBe("vaultBundlesV1Withdraw");
    expect(decoded.args?.[1]).toBe(0n);
    expect(decoded.args?.[2]).toBe(9n);
    expect(transaction.action.args).not.toHaveProperty("referralFeeAssets");
    expect(transaction.action.args).not.toHaveProperty("netAssets");
  });

  test("behavior: calldata round-trips across uint256 inputs", () => {
    fc.assert(
      fc.property(positiveUint256, positiveUint256, (shares, deadline) => {
        const transaction = vaultV2Redeem({
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
      { numRuns: 50, seed: 20_260_906 },
    );
  });

  test("error: NonPositiveInputError", () => {
    expect(() =>
      vaultV2Redeem({
        vault: { chainId, address: vault },
        args: { shares: 0n, userAddress, deadline: 1n },
      }),
    ).toThrow(NonPositiveInputError);
  });
});
