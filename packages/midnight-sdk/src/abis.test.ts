import { describe, expect, test } from "vitest";

import {
  blueBuyCallbackFactoryAbi,
  midnightBundlesAbi,
  midnightBundlesV2Abi,
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

describe("midnightBundlesV2Abi", () => {
  test("behavior: exposes the reviewed V2 entrypoints", () => {
    const functions = midnightBundlesV2Abi
      .filter((entry) => entry.type === "function")
      .map((entry) => entry.name);

    expect(functions).toEqual([
      "BLUE",
      "BLUE_BUY_CALLBACK_FACTORY",
      "LOG",
      "MIDNIGHT",
      "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral",
      "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral",
      "midnightBundlesV2CancelAndMake",
      "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget",
      "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget",
    ]);
  });

  test("behavior: types group cancellations as bytes32 group and uint128 ceiling", () => {
    const cancelAndMake = midnightBundlesV2Abi.find(
      (entry) =>
        entry.type === "function" &&
        entry.name === "midnightBundlesV2CancelAndMake",
    );
    const groupsToCancel =
      cancelAndMake?.type === "function"
        ? cancelAndMake.inputs.find((input) => input.name === "groupsToCancel")
        : undefined;

    expect(groupsToCancel).toMatchObject({
      type: "tuple[]",
      components: [
        { name: "group", type: "bytes32" },
        { name: "maxConsumed", type: "uint128" },
      ],
    });
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

describe("blueBuyCallbackFactoryAbi", () => {
  test("behavior: exposes callback derivation and lookup", () => {
    const functions = blueBuyCallbackFactoryAbi
      .filter((entry) => entry.type === "function")
      .map((entry) => entry.name);

    expect(functions).toEqual([
      "BLUE",
      "MIDNIGHT",
      "callbackOf",
      "createBlueBuyCallback",
      "isBlueBuyCallback",
    ]);
  });
});
