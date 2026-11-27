import { Market } from "@morpho-org/midnight-sdk";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightApiTake,
  midnightMarket,
} from "../../../test/fixtures/midnight.js";
import { validateMidnightTakeFeasibility } from "../../helpers/validateMidnightTakeFeasibility.js";
import {
  MidnightTakeableOffersNotFillableError,
  MidnightTakeTargetUnreachableError,
} from "../../types/index.js";
import { MidnightTakeCreditInsufficientError } from "../error.js";
import { validateMidnightReduceOnlySellFeasibility } from "./reduceOnlySellFeasibility.js";

const marketData = new Market({
  params: midnightMarket,
  totalUnits: 0n,
  lossFactor: 0n,
  withdrawable: 0n,
  continuousFeeCredit: 0n,
  settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
  continuousFee: 0,
  tickSpacing: 1,
});

const bid = (units: bigint) => ({
  ...midnightApiTake({ buy: true, tick: 4_000n }),
  units,
});

// Fixture market matures at 2_000 and offers expire at 2_100.
const now = 1_000n;
const deadline = now + 600n;

const reduceOnly = ({
  credit,
  offerUnits = 100n,
  fallbackUnits = 20n,
}: {
  readonly credit: bigint;
  readonly offerUnits?: bigint;
  readonly fallbackUnits?: bigint;
}) =>
  validateMidnightReduceOnlySellFeasibility({
    side: "sell",
    takeableOffers: [bid(offerUnits)],
    accountAddress: midnightAddresses.taker,
    marketData,
    now,
    deadline,
    referralFeePct: 0n,
    fallbackUnits,
    target: { type: "units", units: 50n, minSellerAssets: 1n },
    increasesDebt: false,
    credit,
  });

describe("validateMidnightReduceOnlySellFeasibility", () => {
  test("default", () => {
    expect(reduceOnly({ credit: 50n })).toHaveLength(1);
  });

  test("error: MidnightTakeCreditInsufficientError when ample offers exceed the credit", () => {
    let error: unknown;
    try {
      reduceOnly({ credit: 10n, fallbackUnits: 0n });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(MidnightTakeCreditInsufficientError);
    expect(error).toMatchObject({ credit: 10n, requiredUnits: 50n });
    expect((error as Error).cause).toBeUndefined();
    expect((error as Error).message).toBe(
      'Midnight position credit "10" is below the "50" units the target needs. Lower the target to at most the position\'s credit.',
    );
  });

  test("error: MidnightTakeCreditInsufficientError counts the referral fee on an assets target", () => {
    expect(() =>
      validateMidnightReduceOnlySellFeasibility({
        side: "sell",
        takeableOffers: [bid(100n)],
        accountAddress: midnightAddresses.taker,
        marketData,
        now,
        deadline,
        referralFeePct: 100_000000000000000n,
        fallbackUnits: 0n,
        target: { type: "assets", assets: 50n, maxUnits: 100n },
        increasesDebt: false,
        credit: 50n,
      }),
    ).toThrow(
      expect.objectContaining({
        constructor: MidnightTakeCreditInsufficientError,
        credit: 50n,
        requiredUnits: 55n,
      }),
    );
  });

  test("error: MidnightTakeCreditInsufficientError when credit is between fill capacity and the target", () => {
    expect(() =>
      reduceOnly({ credit: 45n, offerUnits: 40n, fallbackUnits: 0n }),
    ).toThrow(
      expect.objectContaining({
        constructor: MidnightTakeCreditInsufficientError,
        credit: 45n,
        requiredUnits: 50n,
        cause: expect.any(MidnightTakeTargetUnreachableError),
      }),
    );
  });

  test("error: MidnightTakeCreditInsufficientError when offers also fall short", () => {
    expect(() => reduceOnly({ credit: 25n, offerUnits: 10n })).toThrow(
      expect.objectContaining({
        constructor: MidnightTakeCreditInsufficientError,
        credit: 25n,
        requiredUnits: 50n,
        cause: expect.objectContaining({
          constructor: MidnightTakeTargetUnreachableError,
          field: "takeableOffers",
        }),
      }),
    );
  });

  test("error: MidnightTakeCreditInsufficientError when every bid is dead and credit is short", () => {
    expect(() =>
      validateMidnightReduceOnlySellFeasibility({
        side: "sell",
        takeableOffers: [
          {
            ...midnightApiTake({ buy: true, tick: 4_000n, expiry: now - 1n }),
            units: 100n,
          },
        ],
        accountAddress: midnightAddresses.taker,
        marketData,
        now,
        deadline,
        referralFeePct: 0n,
        fallbackUnits: 0n,
        target: { type: "units", units: 50n, minSellerAssets: 1n },
        increasesDebt: false,
        credit: 45n,
      }),
    ).toThrow(
      expect.objectContaining({
        constructor: MidnightTakeCreditInsufficientError,
        credit: 45n,
        requiredUnits: 50n,
        cause: expect.any(MidnightTakeableOffersNotFillableError),
      }),
    );
  });

  test("error: MidnightTakeTargetUnreachableError when the offers, not credit, fall short", () => {
    expect(() => reduceOnly({ credit: 100n, offerUnits: 10n })).toThrow(
      expect.objectContaining({
        constructor: MidnightTakeTargetUnreachableError,
        field: "takeableOffers",
        value: 30n,
        limit: 50n,
      }),
    );
  });

  test("behavior: validateMidnightTakeFeasibility itself does not cap a reduce-only sell at credit", () => {
    expect(() =>
      validateMidnightTakeFeasibility({
        side: "sell",
        takeableOffers: [bid(100n)],
        accountAddress: midnightAddresses.taker,
        marketData,
        now,
        deadline,
        referralFeePct: 0n,
        fallbackUnits: 20n,
        target: { type: "units", units: 50n, minSellerAssets: 1n },
        increasesDebt: false,
      }),
    ).not.toThrow();
  });
});
