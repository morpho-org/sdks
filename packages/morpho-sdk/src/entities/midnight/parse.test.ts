import {
  AccrualPosition,
  Market,
  MarketParams,
  MarketUtils,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { maxUint256, zeroAddress } from "viem";
import { afterEach, beforeEach, expect, expectTypeOf, test, vi } from "vitest";
import {
  midnightAddresses,
  midnightApiTake,
  midnightChainId,
  midnightMarket,
  midnightTwoCollateralMarket,
} from "../../../test/fixtures/midnight.js";
import {
  encodeMidnightRedeem,
  encodeMidnightSupplyCollateral,
  encodeMidnightSupplyCollateralBatch,
  encodeMidnightWithdrawCollateral,
  encodeMidnightWithdrawCollateralBatch,
} from "../../actions/midnight/encode.js";
import {
  parseMidnightSupplyCollateralBatch,
  parseMidnightWithdrawCollateralBatch,
} from "../../actions/midnight/parseCollateralBatch.js";
import { parseMidnightRedeem } from "../../actions/midnight/redeem.js";
import { parseMidnightSupplyCollateral } from "../../actions/midnight/supplyCollateral.js";
import { parseMidnightWithdrawCollateral } from "../../actions/midnight/withdrawCollateral.js";
import * as accountGuards from "../../helpers/validateMidnightAccount.js";
import * as batchGuards from "../../helpers/validateMidnightCollateralBatch.js";
import * as marketGuards from "../../helpers/validateMidnightMarket.js";
import type { MorphoClientType } from "../../types/client.js";
import {
  AccrualPositionUserMismatchError,
  ChainIdMismatchError,
  DuplicateMidnightCollateralIndexError,
  InsufficientMidnightWithdrawableLiquidityError,
  MidnightCalldataEncodingError,
  MidnightInvalidAccountAddressError,
  MidnightRedeemExceedsCreditError,
  MidnightZeroOnBehalfError,
  MidnightZeroReceiverError,
  NegativeInputError,
  NonPositiveInputError,
} from "../../types/error.js";
import {
  parseCancelOffersParams,
  parseRedeemParams,
  parseRepayWithdrawCollateralParams,
  parseSupplyCollateralBatchParams,
  parseSupplyCollateralParams,
  type parseSupplyCollateralTakeBorrowParams,
  type parseTakeBorrowParams,
  parseTakeLendParams,
  type parseTakeRepayWithdrawCollateralParams,
  type parseTakeWithdrawParams,
  parseWithdrawCollateralBatchParams,
  parseWithdrawCollateralParams,
} from "./parse.js";

const context = {
  chainId: midnightChainId,
  client: {
    viemClient: { chain: { id: midnightChainId } },
    options: { metadata: { origin: "a1b2c3d4" } },
  } as unknown as MorphoClientType,
};

const marketData = (params = midnightMarket) =>
  new Market({
    params,
    totalUnits: 1_000n,
    lossFactor: 0n,
    withdrawable: 1_000n,
    continuousFeeCredit: 0n,
    settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
    continuousFee: 0,
    tickSpacing: 1,
  });

const positionData = (market: Market) =>
  new AccrualPosition(
    {
      user: midnightAddresses.taker,
      credit: 100n,
      pendingFee: 0n,
      lastLossFactor: 0n,
      lastAccrual: 0n,
      debt: 0n,
      collateralBitmap: 1n,
      collateral: [20n],
    },
    market,
  );

type WithoutWitness<T> = {
  [K in keyof T as K extends symbol ? never : K]: T[K];
};

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 }));
afterEach(() => vi.useRealTimers());

test("raw entity params and field-by-field reconstructions cannot satisfy complete operation contracts", () => {
  expectTypeOf<Parameters<typeof parseTakeLendParams>[0]>().not.toExtend<
    ReturnType<typeof parseTakeLendParams>
  >();
  expectTypeOf<Parameters<typeof parseTakeBorrowParams>[0]>().not.toExtend<
    ReturnType<typeof parseTakeBorrowParams>
  >();
  expectTypeOf<Parameters<typeof parseTakeWithdrawParams>[0]>().not.toExtend<
    ReturnType<typeof parseTakeWithdrawParams>
  >();
  expectTypeOf<
    Parameters<typeof parseSupplyCollateralTakeBorrowParams>[0]
  >().not.toExtend<ReturnType<typeof parseSupplyCollateralTakeBorrowParams>>();
  expectTypeOf<
    Parameters<typeof parseTakeRepayWithdrawCollateralParams>[0]
  >().not.toExtend<ReturnType<typeof parseTakeRepayWithdrawCollateralParams>>();
  expectTypeOf<
    Parameters<typeof parseRepayWithdrawCollateralParams>[0]
  >().not.toExtend<ReturnType<typeof parseRepayWithdrawCollateralParams>>();
  expectTypeOf<
    Parameters<typeof parseSupplyCollateralParams>[0]
  >().not.toExtend<ReturnType<typeof parseSupplyCollateralParams>>();
  expectTypeOf<
    Parameters<typeof parseWithdrawCollateralParams>[0]
  >().not.toExtend<ReturnType<typeof parseWithdrawCollateralParams>>();
  expectTypeOf<Parameters<typeof parseRedeemParams>[0]>().not.toExtend<
    ReturnType<typeof parseRedeemParams>
  >();
  expectTypeOf<Parameters<typeof parseCancelOffersParams>[0]>().not.toExtend<
    ReturnType<typeof parseCancelOffersParams>
  >();
  expectTypeOf<
    WithoutWitness<ReturnType<typeof parseTakeLendParams>>
  >().not.toExtend<ReturnType<typeof parseTakeLendParams>>();
  expectTypeOf<
    WithoutWitness<ReturnType<typeof parseTakeBorrowParams>>
  >().not.toExtend<ReturnType<typeof parseTakeBorrowParams>>();
  expectTypeOf<
    WithoutWitness<ReturnType<typeof parseRedeemParams>>
  >().not.toExtend<ReturnType<typeof parseRedeemParams>>();
  expectTypeOf<
    WithoutWitness<ReturnType<typeof parseCancelOffersParams>>
  >().not.toExtend<ReturnType<typeof parseCancelOffersParams>>();
});

test("complete lend construction owns the market, target, offers, defaults and partial native coverage", () => {
  const params = new MarketParams({
    ...midnightMarket,
    loanToken: getChainAddress(midnightChainId, "wNative"),
  });
  const market = marketData(params);
  const offer = midnightApiTake({ market: params });
  const raw = {
    accountAddress: midnightAddresses.taker,
    marketData: market,
    target: { type: "assets", assets: 10n, minUnits: 1n } as const,
    takeableOffers: [offer],
    maxContinuousFee: 0n,
    nativeAmount: 4n,
    deadline: 1_500n,
  };
  const parsed = parseTakeLendParams(raw, context);
  expect(parsed.nativeFunding).toMatchObject({
    value: 4n,
    wrappedNative: params.loanToken,
  });
  expect(parsed.referralFeePct).toBe(0n);
  expect(parsed.referralFeeRecipient).toBe(zeroAddress);
  expect(parsed.accountAddress).toBe(raw.accountAddress);
  expect(parsed.market).not.toBe(market.params);
  expect(Object.getPrototypeOf(parsed.market)).toBe(Object.prototype);
  expect(Object.isFrozen(parsed.market.collateralParams[0])).toBe(true);
  expect(Object.isFrozen(parsed.target)).toBe(true);
  expect(Object.isFrozen(parsed.takeableOffers[0]?.offer)).toBe(true);
  expect(Object.isFrozen(market)).toBe(false);
  expect(Object.isFrozen(params)).toBe(false);
  Object.assign(raw.target, { assets: 99n });
  Object.assign(offer, { ratifierData: "0xabcd" });
  expect(parsed.target).toMatchObject({ assets: 10n });
  expect(parsed.takeableOffers[0]?.ratifierData).toBe("0x1234");
});

test("complete direct constructors own defaults and snapshot-dependent max amounts without freezing domain classes", () => {
  const market = marketData();
  const position = positionData(market);
  const base = {
    accountAddress: midnightAddresses.taker,
    marketData: market,
    positionData: position,
    collateralPrices: [],
  };
  const supply = parseSupplyCollateralParams(
    { ...base, collateralAssets: 5n },
    context,
  );
  expect(supply).toMatchObject({
    collateralIndex: 0n,
    assets: 5n,
    reservedCollateralAssets: 0n,
    onBehalf: base.accountAddress,
  });
  const withdraw = parseWithdrawCollateralParams(
    { ...base, assets: maxUint256 },
    context,
  );
  expect(withdraw).toMatchObject({
    collateralIndex: 0n,
    assets: 20n,
    available: 20n,
    receiver: base.accountAddress,
  });
  const redeem = parseRedeemParams(base, context);
  expect(redeem).toMatchObject({
    units: 100n,
    receiver: base.accountAddress,
    onBehalf: base.accountAddress,
  });
  const repay = parseRepayWithdrawCollateralParams(
    { ...base, repay: { type: "assets", assets: 5n }, deadline: maxUint256 },
    context,
  );
  expect(repay.collateralWithdrawals).toEqual([]);
  expect(repay.collateralReceiver).toBe(base.accountAddress);
  expect(Object.isFrozen(position)).toBe(false);
  expect(Object.isFrozen(market)).toBe(false);
  expect(Object.isFrozen(redeem.market.struct)).toBe(true);
});

test.each(["supply", "withdraw", "redeem"] as const)(
  "%s entity construction carries the owning action witness and identical encoding",
  (operation) => {
    const market = marketData();
    const base = {
      accountAddress: midnightAddresses.taker,
      marketData: market,
      positionData: positionData(market),
      collateralPrices: [],
    };
    const raw = {
      chainId: midnightChainId,
      market: market.params,
      onBehalf: base.accountAddress,
      receiver: base.accountAddress,
      assets: 5n,
      units: 5n,
      metadata: context.client.options.metadata,
    };
    const [entity, action] =
      operation === "supply"
        ? [
            parseSupplyCollateralParams(
              { ...base, collateralAssets: 5n },
              context,
            ),
            parseMidnightSupplyCollateral(raw),
          ]
        : operation === "withdraw"
          ? [
              parseWithdrawCollateralParams({ ...base, assets: 5n }, context),
              parseMidnightWithdrawCollateral(raw),
            ]
          : [
              parseRedeemParams({ ...base, units: 5n }, context),
              parseMidnightRedeem(raw),
            ];
    const witnesses = Object.getOwnPropertySymbols(action);
    expect(witnesses).toHaveLength(1);
    for (const witness of witnesses) {
      expect(Object.getOwnPropertyDescriptor(entity, witness)).toEqual(
        Object.getOwnPropertyDescriptor(action, witness),
      );
    }
    // Check each complete result at its actual encoder boundary, not a cast or spy.
    const supply = parseSupplyCollateralParams(
      { ...base, collateralAssets: 5n },
      context,
    );
    if ("error" in supply) {
      throw supply.error;
    }
    const withdraw = parseWithdrawCollateralParams(
      { ...base, assets: 5n },
      context,
    );
    const redeem = parseRedeemParams({ ...base, units: 5n }, context);
    expect(encodeMidnightSupplyCollateral(supply)).toEqual(
      encodeMidnightSupplyCollateral(parseMidnightSupplyCollateral(raw)),
    );
    expect(encodeMidnightWithdrawCollateral(withdraw)).toEqual(
      encodeMidnightWithdrawCollateral(parseMidnightWithdrawCollateral(raw)),
    );
    expect(encodeMidnightRedeem(redeem)).toEqual(
      encodeMidnightRedeem(parseMidnightRedeem(raw)),
    );

    expectTypeOf(supply).toExtend<
      Parameters<typeof encodeMidnightSupplyCollateral>[0]
    >();
    expectTypeOf(withdraw).toExtend<
      Parameters<typeof encodeMidnightWithdrawCollateral>[0]
    >();
    expectTypeOf(redeem).toExtend<Parameters<typeof encodeMidnightRedeem>[0]>();
    expectTypeOf<WithoutWitness<typeof supply>>().not.toExtend<
      Parameters<typeof encodeMidnightSupplyCollateral>[0]
    >();
    expectTypeOf<WithoutWitness<typeof withdraw>>().not.toExtend<
      Parameters<typeof encodeMidnightWithdrawCollateral>[0]
    >();
    expectTypeOf<WithoutWitness<typeof redeem>>().not.toExtend<
      Parameters<typeof encodeMidnightRedeem>[0]
    >();
    expectTypeOf(supply).not.toExtend<
      Parameters<typeof encodeMidnightWithdrawCollateral>[0]
    >();
    expectTypeOf(withdraw).not.toExtend<
      Parameters<typeof encodeMidnightSupplyCollateral>[0]
    >();
    expectTypeOf(redeem).not.toExtend<
      Parameters<typeof encodeMidnightSupplyCollateral>[0]
    >();
  },
);

test("batch entity construction carries genuine action ownership, snapshots max amounts and preserves metadata", () => {
  const market = marketData();
  const position = positionData(market);
  const base = {
    accountAddress: midnightAddresses.taker,
    marketData: market,
    positionData: position,
    collateralPrices: [],
  };
  const supplies = [
    { collateralIndex: 0n, assets: 5n, reservedCollateralAssets: 2n },
  ];
  const supply = parseSupplyCollateralBatchParams(
    { ...base, collateralSupplies: supplies },
    context,
  );
  if ("error" in supply) {
    throw supply.error;
  }
  if ("error" in supply.action) {
    throw supply.action.error;
  }
  const withdraw = parseWithdrawCollateralBatchParams(
    {
      ...base,
      collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
    },
    context,
  );
  const direct = {
    chainId: midnightChainId,
    market: market.params,
    onBehalf: base.accountAddress,
    receiver: base.accountAddress,
    metadata: context.client.options.metadata,
  };
  const supplyAction = parseMidnightSupplyCollateralBatch({
    ...direct,
    collateralSupplies: [{ collateralIndex: 0n, assets: 5n }],
  });
  const withdrawAction = parseMidnightWithdrawCollateralBatch({
    ...direct,
    collateralWithdrawals: [{ collateralIndex: 0n, assets: 20n }],
  });
  expect(encodeMidnightSupplyCollateralBatch(supply.action)).toEqual(
    encodeMidnightSupplyCollateralBatch(supplyAction),
  );
  expect(encodeMidnightWithdrawCollateralBatch(withdraw)).toEqual(
    encodeMidnightWithdrawCollateralBatch(withdrawAction),
  );
  for (const [entity, action] of [
    [supply.action, supplyAction],
    [withdraw, withdrawAction],
  ]) {
    for (const witness of Object.getOwnPropertySymbols(action)) {
      expect(Object.getOwnPropertyDescriptor(entity, witness)).toEqual(
        Object.getOwnPropertyDescriptor(action, witness),
      );
    }
  }
  expectTypeOf(supply.action).toExtend<
    Parameters<typeof encodeMidnightSupplyCollateralBatch>[0]
  >();
  expectTypeOf(withdraw).toExtend<
    Parameters<typeof encodeMidnightWithdrawCollateralBatch>[0]
  >();
  expectTypeOf<WithoutWitness<typeof withdraw>>().not.toExtend<
    Parameters<typeof encodeMidnightWithdrawCollateralBatch>[0]
  >();
  supplies[0]!.assets = 99n;
  Object.assign(position, { collateral: [99n] });
  expect(supply.approvals).toEqual([
    { token: midnightMarket.collateralParams[0]!.token, amount: 7n },
  ]);
  expect(withdraw.collateralWithdrawals[0]?.assets).toBe(20n);
  expect(Object.isFrozen(market)).toBe(false);
  expect(Object.isFrozen(position)).toBe(false);
});

test.each(["supply", "withdraw"] as const)(
  "%s batch establishes static account, deployment, list and indexes once",
  (operation) => {
    const market = marketData(new MarketParams(midnightTwoCollateralMarket));
    const position = positionData(market);
    const entries = [
      { collateralIndex: 1n, assets: 1n },
      { collateralIndex: 0n, assets: 2n },
    ];
    const deployment = vi.spyOn(marketGuards, "validateMidnightMarket");
    const batch = vi.spyOn(batchGuards, "validateMidnightCollateralBatch");
    const address = vi.spyOn(accountGuards, "validateMidnightAddress");
    const account = vi.spyOn(accountGuards, "validateMidnightAccount");
    const index = vi.spyOn(MarketUtils, "getCollateralByIndex");
    try {
      const base = {
        accountAddress: midnightAddresses.taker,
        marketData: market,
        positionData: position,
        collateralPrices: [],
      };
      if (operation === "supply") {
        const parsed = parseSupplyCollateralBatchParams(
          { ...base, collateralSupplies: entries },
          context,
        );
        if ("error" in parsed) {
          throw parsed.error;
        }
        if ("error" in parsed.action) {
          throw parsed.action.error;
        }
        encodeMidnightSupplyCollateralBatch(parsed.action);
        encodeMidnightSupplyCollateralBatch(parsed.action);
      } else {
        const parsed = parseWithdrawCollateralBatchParams(
          { ...base, collateralWithdrawals: entries },
          context,
        );
        encodeMidnightWithdrawCollateralBatch(parsed);
        encodeMidnightWithdrawCollateralBatch(parsed);
      }
      expect(deployment).toHaveBeenCalledTimes(1);
      expect(batch).toHaveBeenCalledTimes(1);
      expect(index).toHaveBeenCalledTimes(entries.length);
      if (operation === "supply") {
        expect(
          address.mock.calls.filter(([field]) => field === "accountAddress"),
        ).toHaveLength(1);
        expect(account).not.toHaveBeenCalled();
      } else {
        expect(account).toHaveBeenCalledExactlyOnceWith(
          "accountAddress",
          midnightAddresses.taker,
        );
      }
      expect(
        address.mock.calls.filter(([field]) => field === "onBehalf"),
      ).toHaveLength(0);
    } finally {
      deployment.mockRestore();
      batch.mockRestore();
      address.mockRestore();
      account.mockRestore();
      index.mockRestore();
    }
  },
);

test("withdrawal batch preserves all-index-before-receiver and per-entry amount/ABI interleaving", () => {
  const market = marketData(new MarketParams(midnightTwoCollateralMarket));
  const maturity = market.params.maturity;
  const raw = {
    accountAddress: midnightAddresses.taker,
    marketData: market,
    positionData: positionData(market),
    collateralPrices: [],
    collateralWithdrawals: [
      { collateralIndex: 0n, assets: 1n },
      { collateralIndex: 1n, assets: 0n },
    ],
  };
  Object.assign(market.params, { maturity: -1n });
  expect(() => parseWithdrawCollateralBatchParams(raw, context)).toThrow(
    MidnightCalldataEncodingError,
  );
  expect(() =>
    parseWithdrawCollateralBatchParams(
      {
        ...raw,
        collateralWithdrawals: [
          { collateralIndex: 0n, assets: 0n },
          { collateralIndex: 1n, assets: 1n },
        ],
      },
      context,
    ),
  ).toThrow(NonPositiveInputError);
  Object.assign(market.params, { maturity });
  expect(() =>
    parseWithdrawCollateralBatchParams(
      {
        ...raw,
        receiver: zeroAddress,
        collateralWithdrawals: [
          { collateralIndex: 0n, assets: 0n },
          { collateralIndex: 99n, assets: 1n },
        ],
      },
      context,
    ),
  ).toThrow(UnknownCollateralIndexError);
});

test("supply batch retains deployment/list/amount/reserve/index precedence before lazy owner and ABI errors", () => {
  const market = marketData(new MarketParams(midnightMarket));
  const raw = {
    accountAddress: zeroAddress,
    marketData: market,
    collateralSupplies: [
      { collateralIndex: 99n, assets: 0n, reservedCollateralAssets: -1n },
    ],
  };
  expect(() => parseSupplyCollateralBatchParams(raw, context)).toThrow(
    NonPositiveInputError,
  );
  expect(() =>
    parseSupplyCollateralBatchParams(
      {
        ...raw,
        collateralSupplies: [
          { collateralIndex: 99n, assets: 1n, reservedCollateralAssets: -1n },
        ],
      },
      context,
    ),
  ).toThrow(NegativeInputError);
  expect(() =>
    parseSupplyCollateralBatchParams(
      { ...raw, collateralSupplies: [{ collateralIndex: 99n, assets: 1n }] },
      context,
    ),
  ).toThrow(UnknownCollateralIndexError);
  const duplicate = [
    { collateralIndex: 0n, assets: 0n },
    { collateralIndex: 0n, assets: 0n },
  ];
  expect(() =>
    parseSupplyCollateralBatchParams(
      { ...raw, collateralSupplies: duplicate },
      context,
    ),
  ).toThrow(DuplicateMidnightCollateralIndexError);
  Object.assign(market.params, { maturity: -1n });
  const validEntries = [{ collateralIndex: 0n, assets: 1n }];
  expect(
    parseSupplyCollateralBatchParams(
      { ...raw, collateralSupplies: validEntries },
      context,
    ),
  ).toMatchObject({ error: expect.any(MidnightZeroOnBehalfError) });
  const parsed = parseSupplyCollateralBatchParams(
    {
      ...raw,
      accountAddress: midnightAddresses.taker,
      collateralSupplies: validEntries,
    },
    context,
  );
  expect(parsed).toMatchObject({
    action: { error: expect.any(MidnightCalldataEncodingError) },
  });
  Object.assign(market.params, { chainId: 1n });
  expect(() => parseSupplyCollateralBatchParams(raw, context)).toThrow(
    ChainIdMismatchError,
  );
});

test("withdrawal batch binds position then resolves all indexes before receiver/amount/ABI checks", () => {
  const market = marketData();
  const position = positionData(market);
  const raw = {
    accountAddress: midnightAddresses.taker,
    marketData: market,
    positionData: position,
    collateralPrices: [],
    receiver: zeroAddress,
    collateralWithdrawals: [{ collateralIndex: 99n, assets: 0n }],
  };
  Object.assign(position, { user: midnightAddresses.maker });
  expect(() => parseWithdrawCollateralBatchParams(raw, context)).toThrow(
    AccrualPositionUserMismatchError,
  );
  Object.assign(position, { user: midnightAddresses.taker });
  expect(() => parseWithdrawCollateralBatchParams(raw, context)).toThrow(
    UnknownCollateralIndexError,
  );
  expect(() =>
    parseWithdrawCollateralBatchParams(
      { ...raw, collateralWithdrawals: [{ collateralIndex: 0n, assets: 0n }] },
      context,
    ),
  ).toThrow(MidnightZeroReceiverError);
  Object.assign(position, { collateral: [0n] });
  expect(() =>
    parseWithdrawCollateralBatchParams(
      {
        ...raw,
        receiver: midnightAddresses.taker,
        collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
      },
      context,
    ),
  ).toThrow(NonPositiveInputError);
});

test("supply preserves amount and lazy owner errors before market ABI errors", () => {
  const market = marketData(new MarketParams(midnightMarket));
  Object.assign(market.params, { maturity: -1n });
  expect(() =>
    parseSupplyCollateralParams(
      {
        accountAddress: midnightAddresses.taker,
        marketData: market,
        collateralAssets: 0n,
      },
      context,
    ),
  ).toThrow(NonPositiveInputError);
  expect(
    parseSupplyCollateralParams(
      { accountAddress: zeroAddress, marketData: market, collateralAssets: 1n },
      context,
    ),
  ).toEqual({ error: new MidnightZeroOnBehalfError("onBehalf") });
});

test("complete supply construction preserves amount precedence and the lazy zero-owner error", () => {
  const raw = {
    accountAddress: zeroAddress,
    marketData: marketData(),
    collateralAssets: 0n,
  };
  expect(() => parseSupplyCollateralParams(raw, context)).toThrow(
    NonPositiveInputError,
  );
  expect(
    parseSupplyCollateralParams({ ...raw, collateralAssets: 1n }, context),
  ).toMatchObject({ error: expect.any(MidnightZeroOnBehalfError) });
});

test("supply preserves deployment/reserve errors before hashing and index errors before lazy owner errors", () => {
  const market = marketData(new MarketParams(midnightMarket));
  Object.assign(market.params, { maturity: -1n });
  const raw = {
    accountAddress: zeroAddress,
    marketData: market,
    collateralAssets: 1n,
  };
  expect(() =>
    parseSupplyCollateralParams(
      { ...raw, reservedCollateralAssets: -1n, collateralIndex: 99n },
      context,
    ),
  ).toThrow(NegativeInputError);
  expect(() =>
    parseSupplyCollateralParams(
      { ...raw, marketData: marketData(), collateralIndex: 99n },
      context,
    ),
  ).toThrow(UnknownCollateralIndexError);
  Object.assign(market.params, { chainId: 1 });
  expect(() =>
    parseSupplyCollateralParams({ ...raw, collateralAssets: 0n }, context),
  ).toThrow(ChainIdMismatchError);
});

test("withdraw binds the position before collateral lookup and resolves max before receiver validation", () => {
  const market = marketData();
  const position = positionData(market);
  const raw = {
    accountAddress: midnightAddresses.taker,
    marketData: market,
    positionData: position,
    collateralPrices: [],
    assets: maxUint256,
    receiver: zeroAddress,
  };
  Object.assign(position, { user: midnightAddresses.maker });
  expect(() =>
    parseWithdrawCollateralParams({ ...raw, collateralIndex: 99n }, context),
  ).toThrow(AccrualPositionUserMismatchError);
  Object.assign(position, { user: midnightAddresses.taker, collateral: [0n] });
  expect(() => parseWithdrawCollateralParams(raw, context)).toThrow(
    NonPositiveInputError,
  );
  Object.assign(position, { collateral: [20n] });
  expect(() => parseWithdrawCollateralParams(raw, context)).toThrow(
    MidnightZeroReceiverError,
  );
});

test("redeem snapshot credit and liquidity errors precede owner and receiver errors", () => {
  const market = marketData();
  const position = positionData(market);
  const raw = {
    accountAddress: midnightAddresses.taker,
    positionData: position,
    units: 101n,
    receiver: zeroAddress,
  };
  Object.assign(market, { withdrawable: 0n });
  expect(() => parseRedeemParams(raw, context)).toThrow(
    MidnightRedeemExceedsCreditError,
  );
  expect(() => parseRedeemParams({ ...raw, units: 1n }, context)).toThrow(
    InsufficientMidnightWithdrawableLiquidityError,
  );
  Object.assign(market, { withdrawable: 1_000n });
  expect(() => parseRedeemParams({ ...raw, units: 1n }, context)).toThrow(
    MidnightZeroReceiverError,
  );
});

test("complete cancellation construction reads the owner once and ignores unrelated extra raw fields", () => {
  let reads = 0;
  const group = `0x${"01".repeat(32)}` as const;
  const groups = [group];
  const raw = {
    get accountAddress() {
      reads++;
      return midnightAddresses.taker;
    },
    groups,
    publication: { root: "0x", groups: [], payload: "0x" },
    nativeAmount: 100n,
  };
  const parsed = parseCancelOffersParams(raw, context);
  expect(reads).toBe(1);
  expect(parsed).not.toHaveProperty("publication");
  expect(parsed).not.toHaveProperty("nativeFunding");
  expect(parsed.onBehalf).toBe(midnightAddresses.taker);
  groups[0] = `0x${"02".repeat(32)}`;
  expect(parsed.groups).toEqual([group]);
  expect(Object.isFrozen(parsed.groups)).toBe(true);
  expect(Object.isFrozen(groups)).toBe(false);
  expect(() =>
    parseCancelOffersParams({ ...raw, accountAddress: zeroAddress }, context),
  ).toThrow(MidnightInvalidAccountAddressError);
});
