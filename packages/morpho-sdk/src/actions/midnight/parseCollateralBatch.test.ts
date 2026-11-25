import {
  MarketParams,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { maxUint128, zeroAddress } from "viem";
import { expect, expectTypeOf, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
  midnightTwoCollateralMarket,
} from "../../../test/fixtures/midnight.js";
import {
  ChainIdMismatchError,
  DuplicateMidnightCollateralIndexError,
  MidnightCalldataEncodingError,
  MidnightZeroOnBehalfError,
  MidnightZeroReceiverError,
  NonPositiveInputError,
} from "../../types/index.js";
import {
  encodeMidnightSupplyCollateralBatch,
  encodeMidnightWithdrawCollateralBatch,
} from "./encode.js";
import {
  parseMidnightSupplyCollateralBatch,
  parseMidnightWithdrawCollateralBatch,
} from "./parseCollateralBatch.js";
import {
  type MidnightSupplyCollateralBatchParams,
  midnightSupplyCollateralBatch,
} from "./supplyCollateralBatch.js";
import {
  type MidnightWithdrawCollateralBatchParams,
  midnightWithdrawCollateralBatch,
} from "./withdrawCollateralBatch.js";

type WithoutWitness<T> = {
  [K in keyof T as K extends symbol ? never : K]: T[K];
};
const params = () => ({
  chainId: midnightChainId,
  market: new MarketParams(midnightTwoCollateralMarket),
  onBehalf: midnightAddresses.taker,
  receiver: midnightAddresses.maker,
  collateralSupplies: [
    { collateralIndex: 1n, assets: 2n },
    { collateralIndex: 0n, assets: 1n },
  ],
  collateralWithdrawals: [
    { collateralIndex: 1n, assets: 2n },
    { collateralIndex: 0n, assets: 1n },
  ],
  metadata: { origin: "a1b2c3d4" },
});

test("only owning complete constructors satisfy the batch encoder boundary", () => {
  expectTypeOf<MidnightSupplyCollateralBatchParams>().not.toExtend<
    Parameters<typeof encodeMidnightSupplyCollateralBatch>[0]
  >();
  expectTypeOf<MidnightWithdrawCollateralBatchParams>().not.toExtend<
    Parameters<typeof encodeMidnightWithdrawCollateralBatch>[0]
  >();
  expectTypeOf<
    WithoutWitness<ReturnType<typeof parseMidnightSupplyCollateralBatch>>
  >().not.toExtend<Parameters<typeof encodeMidnightSupplyCollateralBatch>[0]>();
  expectTypeOf<
    WithoutWitness<ReturnType<typeof parseMidnightWithdrawCollateralBatch>>
  >().not.toExtend<
    Parameters<typeof encodeMidnightWithdrawCollateralBatch>[0]
  >();
  expectTypeOf<
    ReturnType<typeof parseMidnightSupplyCollateralBatch>
  >().not.toExtend<
    Parameters<typeof encodeMidnightWithdrawCollateralBatch>[0]
  >();
  expectTypeOf<
    ReturnType<typeof parseMidnightWithdrawCollateralBatch>
  >().not.toExtend<Parameters<typeof encodeMidnightSupplyCollateralBatch>[0]>();
});

test("complete batches own entries, ABI calls and metadata without freezing domain classes", () => {
  const raw = params();
  const supply = parseMidnightSupplyCollateralBatch(raw);
  const withdraw = parseMidnightWithdrawCollateralBatch(raw);
  const expectedSupply = midnightSupplyCollateralBatch(raw);
  const expectedWithdraw = midnightWithdrawCollateralBatch(raw);
  raw.collateralSupplies[0]!.assets = 99n;
  raw.collateralWithdrawals[0]!.assets = 99n;
  raw.metadata.origin = "deadbeef";
  Object.assign(raw.market, { maturity: 123n });
  expect(encodeMidnightSupplyCollateralBatch(supply)).toEqual(expectedSupply);
  expect(encodeMidnightWithdrawCollateralBatch(withdraw)).toEqual(
    expectedWithdraw,
  );
  expect(Object.isFrozen(raw.market)).toBe(false);
  expect(Object.isFrozen(raw.market.collateralParams[0])).toBe(false);
  expect(Object.isFrozen(supply.collateralSupplies[0])).toBe(true);
  expect(Object.isFrozen(withdraw.calls)).toBe(true);
});

test.each(["supply", "withdraw"] as const)(
  "%s retains simultaneous-invalid standalone precedence",
  (operation) => {
    const raw = params();
    const build = (overrides: Partial<ReturnType<typeof params>>) =>
      operation === "supply"
        ? midnightSupplyCollateralBatch({ ...raw, ...overrides })
        : midnightWithdrawCollateralBatch({ ...raw, ...overrides });
    const duplicate = [
      { collateralIndex: 0n, assets: 0n },
      { collateralIndex: 0n, assets: maxUint128 + 1n },
    ];
    const lists = {
      collateralSupplies: duplicate,
      collateralWithdrawals: duplicate,
    };
    expect(() =>
      build({
        ...lists,
        onBehalf: zeroAddress,
        market: new MarketParams({ ...raw.market, chainId: 1n }),
      }),
    ).toThrow(MidnightZeroOnBehalfError);
    expect(() =>
      build({
        ...lists,
        market: new MarketParams({ ...raw.market, chainId: 1n }),
      }),
    ).toThrow(ChainIdMismatchError);
    expect(() => build(lists)).toThrow(DuplicateMidnightCollateralIndexError);
    if (operation === "withdraw") {
      expect(() => build({ ...lists, receiver: zeroAddress })).toThrow(
        MidnightZeroReceiverError,
      );
    }
    const badIndexAndAmount = [{ collateralIndex: 99n, assets: 0n }];
    expect(() =>
      build({
        collateralSupplies: badIndexAndAmount,
        collateralWithdrawals: badIndexAndAmount,
      }),
    ).toThrow(NonPositiveInputError);
    const badIndex = [{ collateralIndex: 99n, assets: 1n }];
    expect(() =>
      build({ collateralSupplies: badIndex, collateralWithdrawals: badIndex }),
    ).toThrow(UnknownCollateralIndexError);
    // Preserve ABI errors from entry zero before an invalid amount on entry one.
    const badMarket = new MarketParams(raw.market);
    Object.assign(badMarket, { maturity: -1n });
    const entries = [
      { collateralIndex: 0n, assets: 1n },
      { collateralIndex: 1n, assets: 0n },
    ];
    expect(() =>
      build({
        market: badMarket,
        collateralSupplies: entries,
        collateralWithdrawals: entries,
      }),
    ).toThrow(MidnightCalldataEncodingError);
  },
);
