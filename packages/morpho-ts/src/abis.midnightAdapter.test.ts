import {
  midnightCollateralParamsAbi as canonicalMidnightCollateralParamsAbi,
  midnightCoreReadAbi as canonicalMidnightCoreReadAbi,
  midnightMarketAbi as canonicalMidnightMarketAbi,
  midnightOfferAbi as canonicalMidnightOfferAbi,
} from "@morpho-org/morpho-ts/abis/midnight";
import {
  type Abi,
  toEventSelector,
  toEventSignature,
  toFunctionSelector,
  toFunctionSignature,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAdapterAbi,
  midnightAdapterFactoryAbi,
  midnightAdapterPriceRatifierV1Abi,
  midnightAdapterRateRatifierV1Abi,
  midnightCollateralParamsAbi,
  midnightCoreReadAbi,
  midnightMarketAbi,
  midnightOfferAbi,
} from "./abis.js";

type TupleParameter = {
  readonly internalType?: string;
  readonly components?: readonly TupleParameter[];
};

const getFunctionSelectors = (abi: Abi) =>
  Object.fromEntries(
    abi
      .filter((item) => item.type === "function")
      .map((item) => [
        item.name,
        toFunctionSelector(toFunctionSignature(item)),
      ]),
  );

const getEventSelectors = (abi: Abi) =>
  Object.fromEntries(
    abi
      .filter((item) => item.type === "event")
      .map((item) => [item.name, toEventSelector(toEventSignature(item))]),
  );

describe("Midnight adapter ABIs", () => {
  test("behavior: tuple ABIs are exported from the Midnight subpath", () => {
    expect(canonicalMidnightMarketAbi).toBe(midnightMarketAbi);
    expect(canonicalMidnightCollateralParamsAbi).toBe(
      midnightCollateralParamsAbi,
    );
    expect(canonicalMidnightOfferAbi).toBe(midnightOfferAbi);
    expect(canonicalMidnightCoreReadAbi).toBe(midnightCoreReadAbi);
  });

  test("behavior: matches selectors for SDK-facing functions", () => {
    expect(getFunctionSelectors(midnightAdapterAbi)).toMatchObject({
      marketIds: toFunctionSelector("marketIds(uint256)"),
      marketIdsLength: toFunctionSelector("marketIdsLength()"),
      marketData: toFunctionSelector("marketData(bytes32)"),
      durations: toFunctionSelector("durations()"),
      durationsLength: toFunctionSelector("durationsLength()"),
      durationAllocations: toFunctionSelector("durationAllocations(uint256)"),
      maxTtm: toFunctionSelector("maxTtm()"),
      increaseMaxTtm: toFunctionSelector("increaseMaxTtm(uint256)"),
      decreaseMaxTtm: toFunctionSelector("decreaseMaxTtm(uint256)"),
      minNetBuyRate: toFunctionSelector("minNetBuyRate()"),
      increaseMinNetBuyRate: toFunctionSelector(
        "increaseMinNetBuyRate(uint256)",
      ),
      decreaseMinNetBuyRate: toFunctionSelector(
        "decreaseMinNetBuyRate(uint256)",
      ),
      increaseMaxNetSellRate: toFunctionSelector(
        "increaseMaxNetSellRate(uint256)",
      ),
      decreaseMaxNetSellRate: toFunctionSelector(
        "decreaseMaxNetSellRate(uint256)",
      ),
      increaseShortfallAllowance: toFunctionSelector(
        "increaseShortfallAllowance(uint256)",
      ),
      decreaseShortfallAllowance: toFunctionSelector(
        "decreaseShortfallAllowance(uint256)",
      ),
      maxNetSellRate: toFunctionSelector("maxNetSellRate()"),
      shortfallAllowance: toFunctionSelector("shortfallAllowance()"),
      enterGateFactory: toFunctionSelector("enterGateFactory()"),
      factory: toFunctionSelector("factory()"),
      forceRemove: toFunctionSelector("forceRemove(bytes32)"),
      setMinForceSellPrice: toFunctionSelector(
        "setMinForceSellPrice(bytes32,uint256)",
      ),
      ids: toFunctionSelector(
        "ids((uint256,address,address,(address,uint256,uint256,address)[],uint256,uint256,address,address))",
      ),
      isRatified: toFunctionSelector(
        "isRatified(((uint256,address,address,(address,uint256,uint256,address)[],uint256,uint256,address,address),bool,address,uint256,uint256,uint256,bytes32,address,bytes,address,address,bool,uint128,uint128,uint256),bytes,address)",
      ),
      onBuy: toFunctionSelector(
        "onBuy(bytes32,(uint256,address,address,(address,uint256,uint256,address)[],uint256,uint256,address,address),uint256,uint256,uint256,address,bytes)",
      ),
      onSell: toFunctionSelector(
        "onSell(bytes32,(uint256,address,address,(address,uint256,uint256,address)[],uint256,uint256,address,address),uint256,uint256,uint256,address,address,bytes)",
      ),
      realAssets: toFunctionSelector("realAssets()"),
      allocate: toFunctionSelector("allocate(bytes,uint256,bytes4,address)"),
      deallocate: toFunctionSelector(
        "deallocate(bytes,uint256,bytes4,address)",
      ),
      take: toFunctionSelector(
        "take(((uint256,address,address,(address,uint256,uint256,address)[],uint256,uint256,address,address),bool,address,uint256,uint256,uint256,bytes32,address,bytes,address,address,bool,uint128,uint128,uint256),bytes,uint256,bytes)",
      ),
    });

    expect(getFunctionSelectors(midnightAdapterFactoryAbi)).toMatchObject({
      isCreated: toFunctionSelector("isCreated(address)"),
      createMidnightAdapter: toFunctionSelector(
        "createMidnightAdapter(address,uint256[],address,bytes32)",
      ),
      midnight: toFunctionSelector("midnight()"),
    });

    for (const abi of [
      midnightAdapterRateRatifierV1Abi,
      midnightAdapterPriceRatifierV1Abi,
    ]) {
      expect(getFunctionSelectors(abi)).toMatchObject({
        DOMAIN_SEPARATOR: toFunctionSelector("DOMAIN_SEPARATOR()"),
        ratification: toFunctionSelector("ratification(address,bytes32)"),
        isRootRatified: toFunctionSelector("isRootRatified(address,bytes32)"),
        rootNonce: toFunctionSelector("rootNonce(address,bytes32)"),
        setIsRootRatified: toFunctionSelector(
          "setIsRootRatified(address,bytes32,bool,address)",
        ),
        isRatified: toFunctionSelector(
          "isRatified(((uint256,address,address,(address,uint256,uint256,address)[],uint256,uint256,address,address),bool,address,uint256,uint256,uint256,bytes32,address,bytes,address,address,bool,uint128,uint128,uint256),bytes,address)",
        ),
      });
    }
  });

  test("behavior: matches adapter event selectors", () => {
    const signatures = {
      Submit: "Submit(bytes4,bytes,uint256)",
      Revoke: "Revoke(address,bytes4,bytes)",
      Accept: "Accept(bytes4,bytes)",
      Abdicate: "Abdicate(bytes4)",
      IncreaseTimelock: "IncreaseTimelock(bytes4,uint256)",
      DecreaseTimelock: "DecreaseTimelock(bytes4,uint256)",
      SetIsSubRatifier: "SetIsSubRatifier(address,address,bool)",
      SetSkimRecipient: "SetSkimRecipient(address)",
      Constructor: "Constructor(address,address,uint256[],address)",
      IncreaseMinNetBuyRate: "IncreaseMinNetBuyRate(uint256)",
      DecreaseMinNetBuyRate: "DecreaseMinNetBuyRate(uint256)",
      IncreaseMaxTtm: "IncreaseMaxTtm(uint256)",
      DecreaseMaxTtm: "DecreaseMaxTtm(address,uint256)",
      IncreaseShortfallAllowance: "IncreaseShortfallAllowance(uint256)",
      DecreaseShortfallAllowance: "DecreaseShortfallAllowance(uint256)",
      IncreaseMaxNetSellRate: "IncreaseMaxNetSellRate(uint256)",
      DecreaseMaxNetSellRate: "DecreaseMaxNetSellRate(uint256)",
      SetMinForceSellPrice: "SetMinForceSellPrice(bytes32,uint256)",
      SetForceSellable: "SetForceSellable(bytes32)",
      UnsetForceSellable: "UnsetForceSellable(address,bytes32)",
      SetConsumed: "SetConsumed(address,bytes32,uint256)",
      Skim: "Skim(address,uint256)",
      Take: "Take(address)",
      WithdrawToVault: "WithdrawToVault(bytes32,uint256,uint256)",
      ForceDeallocate: "ForceDeallocate(bytes32,uint256,uint256)",
      ForceRemove: "ForceRemove(bytes32,uint256)",
      Buy: "Buy(bytes32,uint256,uint256,uint256,uint256)",
      Sell: "Sell(bytes32,uint256,uint256,uint256,uint256,uint256)",
      ReduceRate: "ReduceRate(bytes32,uint256)",
    } as const;

    expect(getEventSelectors(midnightAdapterAbi)).toMatchObject(
      Object.fromEntries(
        Object.entries(signatures).map(([name, signature]) => [
          name,
          toEventSelector(signature),
        ]),
      ),
    );

    expect(getEventSelectors(midnightAdapterFactoryAbi)).toMatchObject({
      CreateMidnightAdapter: toEventSelector(
        "CreateMidnightAdapter(address,address,uint256[],bytes32,address,address)",
      ),
      CreateMidnightAdapterFactory: toEventSelector(
        "CreateMidnightAdapterFactory(address)",
      ),
    });

    for (const abi of [
      midnightAdapterRateRatifierV1Abi,
      midnightAdapterPriceRatifierV1Abi,
    ]) {
      expect(getEventSelectors(abi)).toMatchObject({
        SetIsRootRatified: toEventSelector(
          "SetIsRootRatified(address,address,address,bytes32,bool)",
        ),
        SetIsRootRatifiedWithSig: toEventSelector(
          "SetIsRootRatifiedWithSig(address,address,address,bytes32,uint256,bool,uint128,uint128)",
        ),
      });
    }
  });

  test("behavior: exposes the exact marketData outputs", () => {
    const marketData = midnightAdapterAbi.find(
      (item) => item.type === "function" && item.name === "marketData",
    );

    expect(marketData?.outputs?.map(({ name, type }) => [name, type])).toEqual([
      ["netCredit", "uint128"],
      ["netRate", "uint64"],
      ["maturity", "uint40"],
      ["index", "uint8"],
      ["forceSellable", "bool"],
      ["forceRemoved", "bool"],
      ["minForceSellPrice", "uint256"],
    ]);
  });

  test("behavior: Midnight tuples come from the shared definitions", () => {
    const found = {
      market: 0,
      offer: 0,
      collateralParams: 0,
    };
    const visit = (parameters: readonly TupleParameter[]) => {
      for (const parameter of parameters) {
        if (parameter.internalType === "struct Market") {
          found.market += 1;
          expect(parameter.components).toBe(midnightMarketAbi.components);
        } else if (parameter.internalType === "struct Offer") {
          found.offer += 1;
          expect(parameter.components).toBe(midnightOfferAbi.components);
        } else if (parameter.internalType === "struct CollateralParams[]") {
          found.collateralParams += 1;
          expect(parameter.components).toBe(
            midnightCollateralParamsAbi.components,
          );
        }

        if (parameter.components) visit(parameter.components);
      }
    };

    for (const abi of [
      midnightAdapterAbi,
      midnightAdapterFactoryAbi,
      midnightAdapterRateRatifierV1Abi,
      midnightAdapterPriceRatifierV1Abi,
    ]) {
      for (const item of abi) {
        if ("inputs" in item) visit(item.inputs);
        if ("outputs" in item) visit(item.outputs);
      }
    }

    expect(found.market).toBeGreaterThan(0);
    expect(found.offer).toBeGreaterThan(0);
    expect(found.collateralParams).toBeGreaterThan(0);
  });

  test("behavior: matches adapter error selectors", () => {
    const errorSignatures = {
      adapter: [
        "Abdicated()",
        "ApproveReturnedFalse()",
        "ApproveReverted()",
        "AutomaticallyTimelocked()",
        "BuyAtLoss()",
        "BuyPostMaturity()",
        "BuyTtmTooHigh()",
        "CastOverflow()",
        "DataAlreadyPending()",
        "DataNotTimelocked()",
        "DataTooLong()",
        "DurationAbsoluteCapExceeded()",
        "DurationRelativeCapExceeded()",
        "DurationTooHigh()",
        "DurationZeroAbsoluteCap()",
        "DurationsNotIncreasing()",
        "ForceRemoved()",
        "ForceSellPriceTooLow()",
        "IncorrectCallbackAddress()",
        "IncorrectEnterGate()",
        "IncorrectMaker()",
        "IncorrectReceiver()",
        "InvalidLength()",
        "LoanAssetMismatch()",
        "MaxTtmTooHigh()",
        "MaxTtmTooLow()",
        "MaxNetSellRateTooLow()",
        "MaxNetSellRateTooHigh()",
        "MinNetBuyRateTooLow()",
        "MinNetBuyRateTooHigh()",
        "NetBuyRateTooLow()",
        "NetSellRateTooHigh()",
        "NoCode()",
        "NonEmptyCallbackData()",
        "NotAuthorized()",
        "NotMidnight()",
        "NotSelf()",
        "OtherSellInProgress()",
        "SelfAllocationOnly()",
        "SellInProgress()",
        "ShortfallAllowanceExceeded()",
        "ShortfallTooHigh()",
        "SubRatifierFailed()",
        "TakerHasNoShares()",
        "TimelockNotDecreasing()",
        "TimelockNotExpired()",
        "TimelockNotIncreasing()",
        "TooManyDurations()",
        "TooManyMarkets()",
        "TransferFromReturnedFalse()",
        "TransferFromReverted()",
        "TransferReturnedFalse()",
        "TransferReverted()",
        "UnauthorizedBuy()",
      ],
      factory: [],
      rateRatifier: [
        "DeadlineExpired()",
        "InvalidNonce()",
        "InvalidProof()",
        "InvalidSignature()",
        "LeafIndexOutOfRange()",
        "NotRatified()",
        "RatifiedStatusChanged()",
        "TickOutOfRange()",
        "TreeTooHigh()",
        "Unauthorized()",
        "UnauthorizedTaker()",
        "WorsePrice()",
      ],
      priceRatifier: [
        "DeadlineExpired()",
        "InvalidNonce()",
        "InvalidProof()",
        "InvalidSignature()",
        "LeafIndexOutOfRange()",
        "NotRatified()",
        "RatifiedStatusChanged()",
        "TreeTooHigh()",
        "Unauthorized()",
        "UnauthorizedTaker()",
      ],
    } as const;

    const adapters = [
      [midnightAdapterAbi, errorSignatures.adapter],
      [midnightAdapterFactoryAbi, errorSignatures.factory],
      [midnightAdapterRateRatifierV1Abi, errorSignatures.rateRatifier],
      [midnightAdapterPriceRatifierV1Abi, errorSignatures.priceRatifier],
    ] as const;

    for (const [abi, signatures] of adapters) {
      const errorSelectors = Object.fromEntries(
        abi
          .filter((item) => item.type === "error")
          .map((item) => [
            item.name,
            toFunctionSelector(
              toFunctionSignature({
                type: "function",
                name: item.name,
                inputs: item.inputs,
                outputs: [],
                stateMutability: "nonpayable",
              }),
            ),
          ]),
      );

      expect(Object.keys(errorSelectors).sort()).toEqual(
        signatures
          .map((signature) => signature.slice(0, signature.indexOf("(")))
          .sort(),
      );
      expect(errorSelectors).toMatchObject(
        Object.fromEntries(
          signatures.map((signature) => [
            signature.slice(0, signature.indexOf("(")),
            toFunctionSelector(signature),
          ]),
        ),
      );
    }
  });
});
