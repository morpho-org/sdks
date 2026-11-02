import { encodeAbiParameters } from "viem";
import { describe, expect, test } from "vitest";
import {
  ADAPTER,
  EMPTY_HEX,
  market,
  marketParams,
  RECIPIENT,
  vaultV2AdapterInput,
} from "../../__test__/fixtures.js";
import {
  InvalidMarketParamsError,
  UnsupportedMarketIrmError,
} from "../../errors.js";
import { marketParamsAbi } from "../../market/MarketParams.js";
import { MathLib } from "../../math/MathLib.js";
import { AccrualVaultV2MorphoMarketV1AdapterV2 } from "./VaultV2MorphoMarketV1AdapterV2.js";

describe("AccrualVaultV2MorphoMarketV1AdapterV2", () => {
  test("pendingAllocationIncrease values accrued assets and handles absent or invalid inputs", () => {
    const m = market({
      totalSupplyAssets: 1_000n,
      totalSupplyShares: 1_000_000n,
    });
    const adapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        ...vaultV2AdapterInput(),
        marketIds: [m.id],
        adaptiveCurveIrm: ADAPTER,
        supplyShares: { [m.id]: 500_000n },
      },
      [m],
    );
    const data = encodeAbiParameters([marketParamsAbi], [m.params]);
    const assets = m.toSupplyAssets(500_000n);
    const allocations = adapter.ids(m.params).map((id, index) => ({
      id,
      allocation: assets - 20n,
      absoluteCap: index === 1 ? assets + 100n : 10_000n,
      relativeCap: MathLib.WAD,
    }));
    expect(adapter.pendingAllocationIncrease(data, allocations)).toBe(20n);
    expect(adapter.pendingAllocationIncrease(data, [])).toBe(0n);
    const abovePosition = allocations.map((allocation) => ({
      ...allocation,
      allocation: assets + 10n,
    }));
    expect(adapter.pendingAllocationIncrease(data, abovePosition)).toBe(0n);
    const empty = new AccrualVaultV2MorphoMarketV1AdapterV2(adapter, []);
    expect(empty.pendingAllocationIncrease(data, allocations)).toBe(0n);
    const noShares = new AccrualVaultV2MorphoMarketV1AdapterV2(
      { ...adapter, supplyShares: {} },
      [m],
    );
    expect(noShares.pendingAllocationIncrease(data, allocations)).toBe(0n);
    expect(() =>
      adapter.pendingAllocationIncrease(EMPTY_HEX, allocations),
    ).toThrow(InvalidMarketParamsError);
  });
  test("accrueInterest keeps markets with missing supply shares unchanged", () => {
    const m = market({
      params: marketParams({ irm: RECIPIENT }),
      rateAtTarget: undefined,
    });
    const adapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        ...vaultV2AdapterInput(),
        marketIds: [m.id],
        adaptiveCurveIrm: ADAPTER,
        supplyShares: {},
      },
      [m],
    );

    const accrued = adapter.accrueInterest(m.lastUpdate + 1n);

    expect(accrued).not.toBe(adapter);
    expect(accrued.markets[0]).toBe(m);
  });

  test("error: UnsupportedMarketIrmError", () => {
    const m = market({
      params: marketParams({ irm: RECIPIENT }),
      rateAtTarget: undefined,
      totalBorrowAssets: 1n,
      totalBorrowShares: 1n,
    });
    const adapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        ...vaultV2AdapterInput(),
        marketIds: [m.id],
        adaptiveCurveIrm: ADAPTER,
        supplyShares: { [m.id]: 100n },
      },
      [m],
    );

    expect(() => adapter.accrueInterest(m.lastUpdate + 1n)).toThrow(
      UnsupportedMarketIrmError,
    );
  });
});
