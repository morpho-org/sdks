import { describe, expect, test } from "vitest";

import {
  blueBuyCallbackFactoryAbi,
  ecrecoverAuthorizerAbi,
  midnightBundlesV2Abi,
  midnightEventsAbi,
  priceRatifierV1Abi,
  rateRatifierV1Abi,
} from "./abis.js";

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

describe("ecrecoverAuthorizerAbi", () => {
  test("behavior: exposes the pinned interface and authorization event", () => {
    const names = ecrecoverAuthorizerAbi.map((entry) => entry.name);

    expect(names).toEqual([
      "MIDNIGHT",
      "nonce",
      "setIsAuthorized",
      "SetIsAuthorized",
      "Expired",
      "InvalidNonce",
      "InvalidSignature",
      "Unauthorized",
    ]);
    expect(
      ecrecoverAuthorizerAbi.find(
        (entry) => entry.type === "event" && entry.name === "SetIsAuthorized",
      ),
    ).toMatchObject({
      inputs: [
        { name: "caller", indexed: true },
        { name: "authorizer", indexed: true },
        { name: "authorized", indexed: true },
        { name: "isAuthorized", indexed: false },
        { name: "nonce", indexed: false },
        { name: "signer", indexed: false },
      ],
    });
  });
});

describe("midnightEventsAbi", () => {
  test("behavior: types SetIsAuthorized with indexed caller, authorized and onBehalf", () => {
    const event = midnightEventsAbi.find(
      (entry) => entry.name === "SetIsAuthorized",
    );

    expect(event?.inputs).toEqual([
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "authorized",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newIsAuthorized",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
      {
        name: "onBehalf",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ]);
  });
});
