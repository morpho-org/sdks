import {
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

describe("previewVaultV2InKindRedeem", () => {
  test("default", () => {
    const preview = previewVaultV2InKindRedeem(
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

    const preview = previewVaultV2InKindRedeem(vaultData, 10n);

    expect(preview.map(({ marketParams }) => marketParams.id)).toEqual([
      secondMarket.id,
      inKindMarketParams.id,
    ]);
    expect(Object.keys(preview[0] ?? {})).toEqual([
      "marketParams",
      "maxExitAssets",
      "exitAssets",
      "remainingExitAssets",
      "netAssets",
      "feeAssets",
    ]);
  });

  test.each(["empty", "legacy"] as const)(
    "behavior: returns no choices for an %s adapter layout",
    (adapters) => {
      expect(
        previewVaultV2InKindRedeem(inKindVaultV2Data({ adapters }), 1n),
      ).toEqual([]);
    },
  );

  test("behavior: omits empty markets", () => {
    const preview = previewVaultV2InKindRedeem(
      inKindVaultV2Data({ supplyShares: 0n }),
      1n,
    );

    expect(preview).toEqual([]);
  });

  test("behavior: returns no choices for a non-positive amount", () => {
    expect(previewVaultV2InKindRedeem(inKindVaultV2Data(), 0n)).toEqual([]);
  });
});
