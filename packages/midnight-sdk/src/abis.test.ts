import { describe, expect, test } from "vitest";

import { midnightBundlesAbi } from "./abis.js";

describe("midnightBundlesAbi", () => {
  test("behavior: exposes the deployed V1 interface", () => {
    const names = midnightBundlesAbi.map((entry) => entry.name);

    expect(names).toEqual([
      "ContinuousFeeAboveMax",
      "DeadlinePassed",
      "InconsistentMarket",
      "InconsistentSide",
      "NotReduceOnly",
      "OutOfOffers",
      "PctExceeded",
      "SellerAssetsTooLow",
      "Unauthorized",
      "UnitsTooHigh",
      "UnitsTooLow",
      "MIDNIGHT",
      "midnightBundlesV1BuyWithAssetsTargetAndWithdrawCollateral",
      "midnightBundlesV1BuyWithUnitsTargetAndWithdrawCollateral",
      "midnightBundlesV1RepayAndWithdrawCollateral",
      "midnightBundlesV1SupplyCollateralAndSellWithAssetsTarget",
      "midnightBundlesV1SupplyCollateralAndSellWithUnitsTarget",
    ]);
  });
});
