import {
  midnightBundlesAbi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { decodeFunctionData, maxUint256, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
  midnightMarket,
  midnightMarketId,
} from "../../../test/fixtures/midnight.js";
import { midnightRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";

describe("midnightRepayWithdrawCollateral", () => {
  test("default", () => {
    const tx = midnightRepayWithdrawCollateral({
      chainId: midnightChainId,
      market: midnightMarket,
      repayAssets: 1_000n,
      withdrawCollateralAssets: 2_000n,
      onBehalf: midnightAddresses.taker,
      deadline: maxUint256,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightAddresses.midnightBundles);
    expect(tx.action.args).toEqual({
      market: midnightMarketId,
      repayAssets: 1_000n,
      collateralWithdrawals: 1,
      onBehalf: midnightAddresses.taker,
      collateralReceiver: midnightAddresses.taker,
      deadline: maxUint256,
    });
    expect(decoded.functionName).toBe(
      "midnightBundlesV1RepayAndWithdrawCollateral",
    );
    expect(decoded.args[1]).toBe(1_000n);
    expect(decoded.args?.[3]).toEqual({
      kind: 0,
      data: "0x",
    });
    expect(decoded.args?.[6]).toBe(0n);
    expect(decoded.args?.[7]).toBe(zeroAddress);
  });

  test("error: UnknownCollateralIndexError for default withdrawal", () => {
    expect(() =>
      midnightRepayWithdrawCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        repayAssets: 0n,
        withdrawCollateralAssets: 2_000n,
        collateralIndex: 1n,
        onBehalf: midnightAddresses.taker,
        deadline: maxUint256,
      }),
    ).toThrow(UnknownCollateralIndexError);
  });
});
