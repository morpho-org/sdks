import { describe, expect, test } from "vitest";

import {
  midnightBundlesAbi,
  priceRatifierV1Abi,
  rateRatifierV1Abi,
} from "./abis.js";

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

describe("priceRatifierV1Abi", () => {
  test("behavior: exposes the deployed V1 interface", () => {
    const names = priceRatifierV1Abi.map((entry) => entry.name);

    expect(names).toEqual([
      "DOMAIN_SEPARATOR",
      "MIDNIGHT",
      "isRatified",
      "isRootRatified",
      "ratification",
      "rootNonce",
      "setIsRootRatified",
      "setIsRootRatifiedWithSig",
      "SetIsRootRatified",
      "SetIsRootRatifiedWithSig",
      "DeadlineExpired",
      "InvalidNonce",
      "InvalidProof",
      "InvalidSignature",
      "NotRatified",
      "RatifiedStatusChanged",
      "Unauthorized",
      "UnauthorizedTaker",
    ]);
  });
});

describe("rateRatifierV1Abi", () => {
  test("behavior: exposes the deployed V1 interface", () => {
    const names = rateRatifierV1Abi.map((entry) => entry.name);

    expect(names).toEqual([
      "DOMAIN_SEPARATOR",
      "MIDNIGHT",
      "isRatified",
      "isRootRatified",
      "ratification",
      "rootNonce",
      "setIsRootRatified",
      "setIsRootRatifiedWithSig",
      "SetIsRootRatified",
      "SetIsRootRatifiedWithSig",
      "DeadlineExpired",
      "InvalidNonce",
      "InvalidProof",
      "InvalidSignature",
      "NotRatified",
      "RatifiedStatusChanged",
      "Unauthorized",
      "UnauthorizedTaker",
      "WorsePrice",
    ]);
  });
});
