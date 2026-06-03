import { decodeFunctionData } from "viem";
import { describe, expect, test } from "vitest";
import { addresses, baseMarket, baseOffer } from "../__test__/fixtures.js";
import { midnightBundlesAbi } from "../abis.js";
import { NoMatchingOffersError } from "../errors.js";
import { MidnightBundles } from "./MidnightBundles.js";

const take = () => ({
  units: 1n,
  offer: baseOffer().toStruct(),
  ratifierData: "0x" as const,
});

describe("MidnightBundles", () => {
  test("default: buyWithUnitsTargetAndWithdrawCollateral", () => {
    const call = MidnightBundles.buyWithUnitsTargetAndWithdrawCollateral({
      midnightBundles: addresses.midnightBundles,
      targetUnits: 1n,
      maxBuyerAssets: 100n,
      taker: addresses.taker,
      takes: [take()],
      collateralReceiver: addresses.receiver,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: call.data,
    });

    expect(decoded.functionName).toMatchInlineSnapshot(
      `"buyWithUnitsTargetAndWithdrawCollateral"`,
    );
    expect(decoded.args[0]).toBe(1n);
  });

  test("default: supplyCollateralAndSellWithAssetsTarget", () => {
    const call = MidnightBundles.supplyCollateralAndSellWithAssetsTarget({
      midnightBundles: addresses.midnightBundles,
      targetSellerAssets: 100n,
      maxUnits: 10n,
      taker: addresses.taker,
      receiverIfTakerIsSeller: addresses.receiver,
      collateralSupplies: [{ collateralIndex: 0n, assets: 1n }],
      takes: [take()],
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: call.data,
    });

    expect(decoded.functionName).toMatchInlineSnapshot(
      `"supplyCollateralAndSellWithAssetsTarget"`,
    );
    expect(decoded.args[1]).toBe(10n);
  });

  test("default: supplyCollateralAndSellWithUnitsTarget", () => {
    const call = MidnightBundles.supplyCollateralAndSellWithUnitsTarget({
      midnightBundles: addresses.midnightBundles,
      targetUnits: 10n,
      minSellerAssets: 100n,
      taker: addresses.taker,
      receiverIfTakerIsSeller: addresses.receiver,
      collateralSupplies: [{ collateralIndex: 0n, assets: 1n }],
      takes: [take()],
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: call.data,
    });

    expect(decoded.functionName).toMatchInlineSnapshot(
      `"supplyCollateralAndSellWithUnitsTarget"`,
    );
    expect(decoded.args[0]).toBe(10n);
    expect(decoded.args[1]).toBe(100n);
  });

  test("default: buyWithAssetsTargetAndWithdrawCollateral", () => {
    const call = MidnightBundles.buyWithAssetsTargetAndWithdrawCollateral({
      midnightBundles: addresses.midnightBundles,
      targetBuyerAssets: 100n,
      minUnits: 10n,
      taker: addresses.taker,
      takes: [take()],
      collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
      collateralReceiver: addresses.receiver,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: call.data,
    });

    expect(decoded.functionName).toMatchInlineSnapshot(
      `"buyWithAssetsTargetAndWithdrawCollateral"`,
    );
    expect(decoded.args[0]).toBe(100n);
    expect(decoded.args[1]).toBe(10n);
  });

  test("default: repayAndWithdrawCollateral", () => {
    const call = MidnightBundles.repayAndWithdrawCollateral({
      midnightBundles: addresses.midnightBundles,
      market: baseMarket(),
      assets: 100n,
      onBehalf: addresses.taker,
      collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
      collateralReceiver: addresses.receiver,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: call.data,
    });

    expect(decoded.functionName).toMatchInlineSnapshot(
      `"repayAndWithdrawCollateral"`,
    );
    expect(decoded.args[1]).toBe(100n);
  });

  test("error: NoMatchingOffersError for empty takes", () => {
    expect(() =>
      MidnightBundles.supplyCollateralAndSellWithAssetsTarget({
        midnightBundles: addresses.midnightBundles,
        targetSellerAssets: 100n,
        maxUnits: 10n,
        taker: addresses.taker,
        receiverIfTakerIsSeller: addresses.receiver,
        takes: [],
      }),
    ).toThrow(NoMatchingOffersError);
  });
});
