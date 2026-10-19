import { fc, test } from "@fast-check/vitest";
import { MathLib } from "@morpho-org/morpho-ts";
import {
  bytesToHex,
  decodeAbiParameters,
  encodeAbiParameters,
  getAbiItem,
  zeroAddress,
} from "viem";
import { describe, expect } from "vitest";

import { midnightAbi } from "../abis.js";
import { MAX_OFFER_CAP, MAX_TICK } from "../constants.js";
import type { IMarket, SettlementFeeCbps } from "../market/Market.js";
import { MarketUtils } from "../market/MarketUtils.js";
// TickLib.tickToPrice is used as the offer-price reference here: it has its own
// exact-port property test in ../math/TickLib.property.test.ts.
import { TickLib } from "../math/TickLib.js";
import type { IOffer } from "./Offer.js";
import { Offer } from "./Offer.js";
import { OfferUtils } from "./OfferUtils.js";

const takeOfferParam = getAbiItem({ abi: midnightAbi, name: "take" }).inputs[0];
const WAD = MathLib.WAD;

// biome-ignore lint/complexity/useMaxParams: Mirrors Solidity MathLib helper shape.
const mulDivDown = (x: bigint, y: bigint, d: bigint) => (x * y) / d;
// biome-ignore lint/complexity/useMaxParams: Mirrors Solidity MathLib helper shape.
const mulDivUp = (x: bigint, y: bigint, d: bigint) => (x * y + d - 1n) / d;
const zeroFloorSub = (x: bigint, y: bigint) => (x > y ? x - y : 0n);

// biome-ignore lint/complexity/useMaxParams: Test fixture builder.
const marketFor = (
  maturity: bigint,
  settlementFeeCbps: SettlementFeeCbps,
  continuousFee: number,
): IMarket => ({
  params: {
    chainId: 8453,
    midnight: "0x0000000000000000000000000000000000001000",
    loanToken: "0x0000000000000000000000000000000000006000",
    collateralParams: [
      {
        token: "0x0000000000000000000000000000000000007000",
        lltv: 770_000_000_000_000_000n,
        liquidationCursor: 250_000_000_000_000_000n,
        oracle: "0x0000000000000000000000000000000000008000",
      },
    ],
    maturity,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  },
  totalUnits: 1_000n,
  lossFactor: 0n,
  withdrawable: 500n,
  continuousFeeCredit: 0n,
  settlementFeeCbps,
  continuousFee,
  tickSpacing: 4,
});

const settlementFeeOf = (market: IMarket, timestamp: bigint) =>
  MarketUtils.getSettlementFee({
    settlementFeeCbps: market.settlementFeeCbps,
    timeToMaturity: zeroFloorSub(BigInt(market.params.maturity), timestamp),
  });

const cbpsArb: fc.Arbitrary<SettlementFeeCbps> = fc.tuple(
  fc.nat({ max: 65_535 }),
  fc.nat({ max: 65_535 }),
  fc.nat({ max: 65_535 }),
  fc.nat({ max: 65_535 }),
  fc.nat({ max: 65_535 }),
  fc.nat({ max: 65_535 }),
  fc.nat({ max: 65_535 }),
);

const marketArb = fc
  .tuple(
    fc.bigInt({ min: 0n, max: 2_000_000n }),
    cbpsArb,
    fc.nat({ max: 1_000 }),
  )
  .map(([maturity, settlementFeeCbps, continuousFee]) =>
    marketFor(maturity, settlementFeeCbps, continuousFee),
  );

const tickArb = fc.oneof(
  fc.constantFrom(0n, 1n, MAX_TICK / 2n, MAX_TICK - 1n, MAX_TICK),
  fc.bigInt({ min: 0n, max: MAX_TICK }),
);
const capArb = fc.oneof(
  fc.constantFrom(1n, MAX_OFFER_CAP),
  fc.bigInt({ min: 1n, max: MAX_OFFER_CAP }),
);
const consumedArb = fc.oneof(
  fc.constantFrom(0n, 1n, MAX_OFFER_CAP),
  fc.bigInt({ min: 0n, max: MAX_OFFER_CAP }),
);

// [start, expiry] window and a timestamp inside it.
const windowArb = fc
  .tuple(
    fc.bigInt({ min: 0n, max: 1_000_000n }),
    fc.bigInt({ min: 0n, max: 1_000_000n }),
  )
  .chain(([a, b]) => {
    const [start, expiry] = a <= b ? [a, b] : [b, a];
    return fc
      .bigInt({ min: 0n, max: expiry - start })
      .map((delta) => ({ start, expiry, timestamp: start + delta }));
  });

const offerFor = (
  market: IMarket,
  fields: {
    buy: boolean;
    start: bigint;
    expiry: bigint;
    tick: bigint;
    maxUnits: bigint;
    maxAssets: bigint;
    continuousFeeCap: bigint;
  },
): Pick<
  IOffer,
  | "market"
  | "buy"
  | "start"
  | "expiry"
  | "tick"
  | "maxUnits"
  | "maxAssets"
  | "continuousFeeCap"
> => ({ market, ...fields });

describe("OfferUtils.onchainHash", () => {
  test.prop([
    fc.record({
      market: marketArb,
      buy: fc.boolean(),
      tick: tickArb.map((tick) => tick - (tick % 4n)),
      maxUnits: capArb,
      group: fc.uint8Array({ minLength: 32, maxLength: 32 }).map(bytesToHex),
    }),
  ])(
    "behavior: grouped offers match their ABI structs and round-trip encoding",
    ({ market, buy, tick, maxUnits, group }) => {
      const offer = Offer.create({
        market: market.params,
        buy,
        maker: zeroAddress,
        start: 0n,
        expiry: 1_000_000n,
        tick,
        group,
        ratifier: zeroAddress,
        maxUnits,
        maxAssets: 0n,
      });
      const offerStruct = OfferUtils.toStruct({ offer });
      const encoded = encodeAbiParameters([takeOfferParam], [offerStruct]);
      const [decodedOfferStruct] = decodeAbiParameters(
        [takeOfferParam],
        encoded,
      );

      expect(OfferUtils.onchainHash(offer)).toBe(
        OfferUtils.onchainHashStruct(offerStruct),
      );
      expect(OfferUtils.onchainHashStruct(decodedOfferStruct)).toBe(
        OfferUtils.onchainHashStruct(offerStruct),
      );
    },
  );
});

// Midnight src/periphery/libraries/ConsumableUnitsLib.sol consumableUnits
describe("OfferUtils.getConsumableUnits", () => {
  test("default", () => {
    const market = marketFor(2_000n, [1, 2, 3, 4, 5, 6, 7], 10);
    const offer = offerFor(market, {
      buy: true,
      start: 0n,
      expiry: 2_100n,
      tick: 5_000n,
      maxUnits: 100n,
      maxAssets: 0n,
      continuousFeeCap: 10n,
    });

    expect(
      OfferUtils.getConsumableUnits({
        offer,
        consumed: 40n,
        timestamp: 1_000n,
      }),
    ).toBe(60n);
  });

  test.prop(
    [
      fc.record({
        market: marketArb,
        buy: fc.boolean(),
        tick: tickArb,
        maxUnits: capArb,
        consumed: consumedArb,
        window: windowArb,
      }),
    ],
    { numRuns: 1000 },
  )(
    "behavior: with a unit cap, equals zeroFloorSub(maxUnits, consumed)",
    ({
      market,
      buy,
      tick,
      maxUnits,
      consumed,
      window: { start, expiry, timestamp },
    }) => {
      const offerPrice = TickLib.tickToPrice(tick);
      // prices() runs before the cap branch; a buy offer whose fee exceeds the
      // price reverts onchain and throws here — out of scope for this property.
      fc.pre(!buy || offerPrice >= settlementFeeOf(market, timestamp));

      const offer = offerFor(market, {
        buy,
        start,
        expiry,
        tick,
        maxUnits,
        maxAssets: 0n,
        continuousFeeCap: BigInt(market.continuousFee),
      });

      expect(
        OfferUtils.getConsumableUnits({ offer, consumed, timestamp }),
      ).toBe(zeroFloorSub(maxUnits, consumed));
    },
  );

  test.prop(
    [
      fc.record({
        market: marketArb,
        tick: tickArb.filter((tick) => TickLib.tickToPrice(tick) > 0n),
        maxAssets: capArb,
        consumed: consumedArb,
        window: windowArb,
      }),
    ],
    { numRuns: 1000 },
  )(
    "behavior: sell offer under an asset cap equals ConsumableUnitsLib mulDivDown and is maximal",
    ({
      market,
      tick,
      maxAssets,
      consumed,
      window: { start, expiry, timestamp },
    }) => {
      const sellerPrice = TickLib.tickToPrice(tick);
      const offer = offerFor(market, {
        buy: false,
        start,
        expiry,
        tick,
        maxUnits: 0n,
        maxAssets,
        continuousFeeCap: BigInt(market.continuousFee),
      });

      const units = OfferUtils.getConsumableUnits({
        offer,
        consumed,
        timestamp,
      });
      const remaining = zeroFloorSub(maxAssets, consumed);

      expect(units).toBe(mulDivDown(remaining, WAD, sellerPrice));
      // The take cap check consumes ceil(units * sellerPrice / WAD) assets.
      expect(mulDivUp(units, sellerPrice, WAD)).toBeLessThanOrEqual(remaining);
      expect(mulDivUp(units + 1n, sellerPrice, WAD)).toBeGreaterThan(remaining);
    },
  );

  // The SDK deliberately returns the largest units value take accepts,
  // floor(((remaining + 1) * WAD - 1) / buyerPrice): up to about WAD /
  // buyerPrice units above ConsumableUnitsLib's mulDivUp helper value
  // (one only when buyerPrice >= ~0.5 WAD). The expected-failure property
  // below pins this divergence.
  test.prop(
    [
      fc.record({
        market: marketArb,
        tick: tickArb,
        maxAssets: capArb,
        consumed: consumedArb,
        window: windowArb,
      }),
    ],
    { numRuns: 1000 },
  )(
    "behavior: buy offer under an asset cap is the largest units take accepts",
    ({
      market,
      tick,
      maxAssets,
      consumed,
      window: { start, expiry, timestamp },
    }) => {
      const offerPrice = TickLib.tickToPrice(tick);
      const buyerPrice = offerPrice;
      const fee = settlementFeeOf(market, timestamp);
      fc.pre(buyerPrice > 0n && offerPrice >= fee);

      const offer = offerFor(market, {
        buy: true,
        start,
        expiry,
        tick,
        maxUnits: 0n,
        maxAssets,
        continuousFeeCap: BigInt(market.continuousFee),
      });

      const units = OfferUtils.getConsumableUnits({
        offer,
        consumed,
        timestamp,
      });
      const remaining = zeroFloorSub(maxAssets, consumed);

      expect(units).toBe(((remaining + 1n) * WAD - 1n) / buyerPrice);
      // The take cap check consumes floor(units * buyerPrice / WAD) assets.
      expect(mulDivDown(units, buyerPrice, WAD)).toBeLessThanOrEqual(remaining);
      expect(mulDivDown(units + 1n, buyerPrice, WAD)).toBeGreaterThan(
        remaining,
      );
      // The contract helper's mulDivUp value is also accepted by take.
      expect(units).toBeGreaterThanOrEqual(
        mulDivUp(remaining, WAD, buyerPrice),
      );
    },
  );

  test.fails.prop(
    [
      fc.record({
        market: marketArb,
        tick: tickArb,
        maxAssets: capArb,
        consumed: consumedArb,
        window: windowArb,
      }),
    ],
    {
      numRuns: 1000,
      examples: [
        [
          {
            market: marketFor(0n, [0, 0, 0, 0, 0, 0, 0], 0),
            tick: MAX_TICK / 2n,
            maxAssets: 1n,
            consumed: 0n,
            window: { start: 0n, expiry: 0n, timestamp: 0n },
          },
        ],
      ],
    },
  )(
    "behavior: buy offer under an asset cap equals ConsumableUnitsLib mulDivUp",
    ({
      market,
      tick,
      maxAssets,
      consumed,
      window: { start, expiry, timestamp },
    }) => {
      const offerPrice = TickLib.tickToPrice(tick);
      const buyerPrice = offerPrice;
      const fee = settlementFeeOf(market, timestamp);
      fc.pre(buyerPrice > 0n && offerPrice >= fee);

      const offer = offerFor(market, {
        buy: true,
        start,
        expiry,
        tick,
        maxUnits: 0n,
        maxAssets,
        continuousFeeCap: BigInt(market.continuousFee),
      });

      const units = OfferUtils.getConsumableUnits({
        offer,
        consumed,
        timestamp,
      });
      const remaining = zeroFloorSub(maxAssets, consumed);

      expect(units).toBe(mulDivUp(remaining, WAD, buyerPrice));
    },
  );

  test("behavior: buy asset cap exceeds ConsumableUnitsLib mulDivUp on the pinned example", () => {
    const market = marketFor(0n, [0, 0, 0, 0, 0, 0, 0], 0);
    const tick = MAX_TICK / 2n;
    const offer = offerFor(market, {
      buy: true,
      start: 0n,
      expiry: 0n,
      tick,
      maxUnits: 0n,
      maxAssets: 1n,
      continuousFeeCap: BigInt(market.continuousFee),
    });

    expect(
      OfferUtils.getConsumableUnits({ offer, consumed: 0n, timestamp: 0n }),
    ).toBe(3n);
    expect(mulDivUp(1n, WAD, TickLib.tickToPrice(MAX_TICK / 2n))).toBe(2n);
  });

  test.prop(
    [
      fc.record({
        market: marketArb,
        buy: fc.boolean(),
        tick: tickArb,
        cap: capArb,
        a: fc.bigInt({ min: 0n, max: 1_000_000n }),
        b: fc.bigInt({ min: 0n, max: 1_000_000n }),
        timestamp: fc.bigInt({ min: 0n, max: 2_000_000n }),
      }),
    ],
    { numRuns: 1000 },
  )(
    "behavior: returns zero outside the offer's [start, expiry] window",
    ({ market, buy, tick, cap, a, b, timestamp }) => {
      const [start, expiry] = a <= b ? [a, b] : [b, a];
      fc.pre(timestamp < start || timestamp > expiry);

      const offer = offerFor(market, {
        buy,
        start,
        expiry,
        tick,
        maxUnits: cap,
        maxAssets: 0n,
        continuousFeeCap: BigInt(market.continuousFee),
      });

      expect(
        OfferUtils.getConsumableUnits({ offer, consumed: 0n, timestamp }),
      ).toBe(0n);
    },
  );

  test.prop(
    [
      fc.record({
        market: fc
          .tuple(
            fc.bigInt({ min: 0n, max: 2_000_000n }),
            cbpsArb,
            fc.integer({ min: 1, max: 1_000 }),
          )
          .map(([maturity, cbps, cf]) => marketFor(maturity, cbps, cf)),
        buy: fc.boolean(),
        tick: tickArb,
        cap: capArb,
        window: windowArb,
      }),
    ],
    { numRuns: 1000 },
  )(
    "behavior: returns zero when the continuous fee cap is below the market fee",
    ({ market, buy, tick, cap, window: { start, expiry, timestamp } }) => {
      const offer = offerFor(market, {
        buy,
        start,
        expiry,
        tick,
        maxUnits: cap,
        maxAssets: 0n,
        continuousFeeCap: BigInt(market.continuousFee) - 1n,
      });

      expect(
        OfferUtils.getConsumableUnits({ offer, consumed: 0n, timestamp }),
      ).toBe(0n);
    },
  );
});
