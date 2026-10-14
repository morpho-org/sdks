import { fc, test } from "@fast-check/vitest";
import { MidnightPositionLib } from "@morpho-org/morpho-ts";
import { expect } from "vitest";
import { MathLib } from "../../math/index.js";
import type { Hash } from "../../types.js";
import { AccrualVaultV2MidnightAdapter } from "./AccrualVaultV2MidnightAdapter.js";

const MAX_UINT_128 = (1n << 128n) - 1n;
const address = "0x0000000000000000000000000000000000000001" as const;
const parent = "0x0000000000000000000000000000000000000002" as const;
const marketArb = fc.bigInt({ min: 0n, max: 1_000_000n }).chain((credit) =>
  fc
    .record({
      pendingFee: fc.bigInt({ min: 0n, max: credit }),
      lossFactor: fc.bigInt({ min: 0n, max: MAX_UINT_128 }),
      maturity: fc.bigInt({ min: 1n, max: 10_000n }),
      lastAccrualOffset: fc.integer({ min: -5_000, max: 5_000 }),
      rate: fc.bigInt({ min: 0n, max: MathLib.WAD }),
    })
    .map((generated) => ({ credit, ...generated })),
);
const scenarioArb = fc.record({
  markets: fc.array(marketArb, { minLength: 1, maxLength: 5 }),
  firstTimestamp: fc.bigInt({ min: 0n, max: 20_000n }),
  secondTimestamp: fc.bigInt({ min: 0n, max: 20_000n }),
});
const lossFactorPairArb = fc
  .bigInt({ min: 0n, max: MAX_UINT_128 - 1n })
  .chain((lastLossFactor) =>
    fc
      .bigInt({ min: 0n, max: MAX_UINT_128 - 1n - lastLossFactor })
      .map((lossFactorDelta) => ({
        lastLossFactor,
        lossFactor: lastLossFactor + lossFactorDelta,
      })),
  );
const lossAndFeeMarketArb = fc
  .bigInt({ min: 1n, max: 1_000_000n })
  .chain((credit) =>
    fc
      .record({
        pendingFee: fc.bigInt({ min: 1n, max: credit }),
        lossFactors: lossFactorPairArb,
        maturity: fc.bigInt({ min: 1n, max: 10_000n }),
        lastAccrualOffset: fc.integer({ min: -5_000, max: 5_000 }),
        rate: fc.bigInt({ min: 0n, max: MathLib.WAD }),
      })
      .map((generated) => ({ credit, ...generated })),
  );
const lossAndFeeScenarioArb = fc.record({
  markets: fc.array(lossAndFeeMarketArb, { minLength: 1, maxLength: 5 }),
  timestamp: fc.bigInt({ min: 0n, max: 20_000n }),
});

test.prop([scenarioArb], { numRuns: 1_000 })(
  "realAssets is monotone over time without losses",
  ({ markets: generatedMarkets, firstTimestamp, secondTimestamp }) => {
    const marketIds = generatedMarkets.map(
      (_, index) =>
        `0x${BigInt(index + 1)
          .toString(16)
          .padStart(64, "0")}` as Hash,
    );
    const markets = generatedMarkets.map((generated, index) => {
      const accruedAt =
        generated.maturity + BigInt(generated.lastAccrualOffset);
      return {
        id: marketIds[index]!,
        position: {
          credit: generated.credit,
          pendingFee: generated.pendingFee,
          lastLossFactor: generated.lossFactor,
          lastAccrual: accruedAt < 0n ? 0n : accruedAt,
        },
        market: { lossFactor: generated.lossFactor },
      };
    });
    const marketData = Object.fromEntries(
      generatedMarkets.map((generated, index) => [
        marketIds[index]!,
        {
          netCredit: generated.credit - generated.pendingFee,
          rate: generated.rate,
          maturity: generated.maturity,
          index: BigInt(index),
          forceSellable: false,
        },
      ]),
    );
    const adapter = new AccrualVaultV2MidnightAdapter({
      adapter: {
        type: "VaultV2MidnightAdapter",
        address,
        parentVault: parent,
        skimRecipient: parent,
        asset: address,
        midnight: parent,
        marketIds,
        marketData,
        durations: [],
        durationAllocations: [],
        maxTtm: 20_000n,
        minRate: 0n,
        noSalesWithShortfall: false,
        noSalesBelowFaceValue: false,
      },
      markets,
      lastUpdate: 0n,
    });
    const earlier =
      firstTimestamp <= secondTimestamp ? firstTimestamp : secondTimestamp;
    const later =
      firstTimestamp <= secondTimestamp ? secondTimestamp : firstTimestamp;

    expect(adapter.realAssets(earlier)).toBeLessThanOrEqual(
      adapter.realAssets(later),
    );
  },
);

test.prop([lossAndFeeScenarioArb], { numRuns: 1_000 })(
  "accrual preserves value and valuation stays below projected net credit with losses and fees",
  ({ markets: generatedMarkets, timestamp }) => {
    const marketIds = generatedMarkets.map(
      (_, index) =>
        `0x${BigInt(index + 1)
          .toString(16)
          .padStart(64, "0")}` as Hash,
    );
    const scenarios = generatedMarkets.map((generated, index) => {
      const id = marketIds[index]!;
      const lastAccrualCandidate =
        generated.maturity + BigInt(generated.lastAccrualOffset);
      const lastAccrual = lastAccrualCandidate < 0n ? 0n : lastAccrualCandidate;

      return {
        id,
        position: {
          credit: generated.credit,
          pendingFee: generated.pendingFee,
          lastLossFactor: generated.lossFactors.lastLossFactor,
          lastAccrual,
        },
        market: { lossFactor: generated.lossFactors.lossFactor },
        marketData: {
          netCredit: generated.credit - generated.pendingFee,
          rate: generated.rate,
          maturity: generated.maturity,
          index: BigInt(index),
          forceSellable: false,
        },
      };
    });
    const adapter = new AccrualVaultV2MidnightAdapter({
      adapter: {
        type: "VaultV2MidnightAdapter",
        address,
        parentVault: parent,
        skimRecipient: parent,
        asset: address,
        midnight: parent,
        marketIds: scenarios.map(({ id }) => id),
        marketData: Object.fromEntries(
          scenarios.map(({ id, marketData }) => [id, marketData]),
        ),
        durations: [],
        durationAllocations: [],
        maxTtm: 20_000n,
        minRate: 0n,
        noSalesWithShortfall: false,
        noSalesBelowFaceValue: false,
      },
      markets: scenarios.map(({ id, position, market }) => ({
        id,
        position,
        market,
      })),
      lastUpdate: 0n,
    });
    const accrued = adapter.accrueInterest(timestamp);
    const netCreditBound = scenarios.reduce(
      (total, { position, market, marketData }) =>
        total +
        MidnightPositionLib.netCredit({
          ...position,
          marketLossFactor: market.lossFactor,
          maturity: marketData.maturity,
          timestamp: MathLib.max(timestamp, position.lastAccrual),
        }),
      0n,
    );

    expect(accrued.realAssets(timestamp)).toBe(adapter.realAssets(timestamp));
    expect(adapter.realAssets(timestamp)).toBeLessThanOrEqual(netCreditBound);
  },
);
