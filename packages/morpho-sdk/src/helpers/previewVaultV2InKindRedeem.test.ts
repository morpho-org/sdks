import {
  type AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  Market,
  MarketParams,
} from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import {
  inKindMarketParams,
  inKindVaultV2Data,
} from "../../test/fixtures/inKindRedeem.js";
import { previewVaultV2InKindRedeem } from "./previewVaultV2InKindRedeem.js";

const TWO_PERCENT = 20_000_000_000_000_000n;

const previewInKind = (
  vaultData: AccrualVaultV2,
  requestedExitAssets: bigint,
) =>
  previewVaultV2InKindRedeem(vaultData, {
    requestedExitAssets,
    timestamp: 0n,
  });

describe("previewVaultV2InKindRedeem", () => {
  test("default", () => {
    const preview = previewInKind(
      inKindVaultV2Data({
        supplyShares: 50_000_000n,
        penalty: TWO_PERCENT,
      }),
      53n,
    );

    expect(preview).toEqual([
      {
        marketParams: inKindMarketParams,
        maxExitAssets: 52n,
        exitAssets: 52n,
        remainingExitAssets: 1n,
        idleAssets: 0n,
        netAssets: 50n,
        feeAssets: 2n,
      },
    ]);
  });

  test("behavior: returns markets by descending allocation without exposing allocation", () => {
    const vaultData = inKindVaultV2Data({ supplyShares: 50_000_000n });
    const [adapter] = vaultData.accrualAdapters;
    if (!(adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2)) {
      throw new Error("Expected a MorphoMarketV1AdapterV2 fixture");
    }
    const secondMarketParams = new MarketParams({
      ...inKindMarketParams,
      collateralToken: "0x0000000000000000000000000000000000001999",
    });
    const secondMarket = new Market({
      params: secondMarketParams,
      totalSupplyAssets: 1_000n,
      totalBorrowAssets: 900n,
      totalSupplyShares: 1_000_000_000n,
      totalBorrowShares: 900n,
      lastUpdate: adapter.markets[0]?.lastUpdate ?? 0n,
      fee: 0n,
    });
    adapter.markets.push(secondMarket);
    adapter.marketIds.push(secondMarket.id);
    adapter.supplyShares[secondMarket.id] = 500_000_000n;

    const preview = previewInKind(vaultData, 10n);

    expect(preview.map(({ marketParams }) => marketParams.id)).toEqual([
      secondMarket.id,
      inKindMarketParams.id,
    ]);
    expect(Object.keys(preview[0] ?? {})).toEqual([
      "marketParams",
      "maxExitAssets",
      "exitAssets",
      "remainingExitAssets",
      "idleAssets",
      "netAssets",
      "feeAssets",
    ]);
  });

  test.each(["empty", "legacy"] as const)(
    "behavior: returns no choices for an %s adapter layout",
    (adapters) => {
      expect(previewInKind(inKindVaultV2Data({ adapters }), 1n)).toEqual([]);
    },
  );

  test("behavior: omits empty markets", () => {
    const preview = previewInKind(inKindVaultV2Data({ supplyShares: 0n }), 1n);

    expect(preview).toEqual([]);
  });

  test("behavior: accounts for idle assets before the market allocation", () => {
    const preview = previewInKind(
      inKindVaultV2Data({
        assetBalance: 10n,
        supplyShares: 50_000_000n,
        penalty: TWO_PERCENT,
      }),
      63n,
    );

    expect(preview).toEqual([
      {
        marketParams: inKindMarketParams,
        maxExitAssets: 62n,
        exitAssets: 62n,
        remainingExitAssets: 1n,
        idleAssets: 10n,
        netAssets: 50n,
        feeAssets: 2n,
      },
    ]);
  });

  test("behavior: accrues market capacity to the supplied timestamp", () => {
    const vaultData = inKindVaultV2Data({ supplyShares: 500_000_000n });
    const [adapter] = vaultData.accrualAdapters;
    if (!(adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2)) {
      throw new Error("Expected a MorphoMarketV1AdapterV2 fixture");
    }
    const market = new Market({
      params: inKindMarketParams,
      totalSupplyAssets: 1_000n,
      totalBorrowAssets: 900n,
      totalSupplyShares: 1_000_000_000n,
      totalBorrowShares: 900_000_000n,
      lastUpdate: 0n,
      fee: 0n,
      rateAtTarget: 1_000_000_000_000n,
    });
    adapter.markets[0] = market;
    const rawAllocationAssets = market.toSupplyAssets(
      adapter.supplyShares[market.id] ?? 0n,
    );

    const [preview] = previewVaultV2InKindRedeem(vaultData, {
      requestedExitAssets: 10_000n,
      timestamp: 86_400n,
    });

    expect(preview?.maxExitAssets).toBeGreaterThan(rawAllocationAssets);
  });

  test("behavior: returns no choices for a non-positive amount", () => {
    expect(previewInKind(inKindVaultV2Data(), 0n)).toEqual([]);
  });
});
