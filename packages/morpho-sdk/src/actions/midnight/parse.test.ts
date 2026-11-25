import { MarketParams, MarketUtils } from "@morpho-org/midnight-sdk";
import { type Address, maxUint128, maxUint256, zeroAddress } from "viem";
import { describe, expect, expectTypeOf, test } from "vitest";
import {
  midnightAddresses,
  midnightApiTake,
  midnightChainId,
  midnightMarket,
} from "../../../test/fixtures/midnight.js";
import {
  EmptyMidnightTakeableOffersError,
  InputExceedsMaxError,
  MidnightCalldataEncodingError,
  MidnightReferralFeePctExceededError,
  MidnightTakeTargetUnreachableError,
  NonPositiveInputError,
  UnboundedMidnightTakeInputError,
} from "../../types/index.js";
import type {
  encodeMidnightRedeem,
  encodeMidnightSupplyCollateral,
  encodeMidnightWithdrawCollateral,
} from "./encode.js";
import { snapshotMidnightTakeParams } from "./parse.js";
import { type MidnightRedeemParams, midnightRedeem } from "./redeem.js";
import { midnightRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";
import {
  type MidnightSupplyCollateralParams,
  midnightSupplyCollateral,
} from "./supplyCollateral.js";
import { parseMidnightSupplyCollateralTakeBorrow } from "./supplyCollateralTakeBorrow.js";
import { parseMidnightTakeBorrow } from "./takeBorrow.js";
import { parseMidnightTakeLend } from "./takeLend.js";
import { parseMidnightTakeRepayWithdrawCollateral } from "./takeRepayWithdrawCollateral.js";
import { parseMidnightTakeWithdraw } from "./takeWithdraw.js";
import type { MidnightTakeableOffer } from "./types.js";
import {
  type MidnightWithdrawCollateralParams,
  midnightWithdrawCollateral,
} from "./withdrawCollateral.js";

const common = {
  chainId: midnightChainId,
  market: midnightMarket,
  receiver: midnightAddresses.taker,
  deadline: 1_600n,
  maxContinuousFee: maxUint256,
};
type Overrides = {
  readonly takeableOffers?: readonly MidnightTakeableOffer[];
  readonly deadline?: bigint;
  readonly referralFeePct?: bigint;
  readonly referralFeeRecipient?: Address;
};
const cases = [
  {
    name: "takeLend",
    parse: (amount: bigint, overrides: Overrides = {}) =>
      parseMidnightTakeLend({
        ...common,
        target: { type: "assets", assets: amount, minUnits: amount },
        takeableOffers: [midnightApiTake()],
        ...overrides,
      }),
  },
  {
    name: "takeBorrow",
    parse: (amount: bigint, overrides: Overrides = {}) =>
      parseMidnightTakeBorrow({
        ...common,
        target: { type: "assets", assets: amount, maxUnits: amount },
        takeableOffers: [midnightApiTake({ buy: true })],
        ...overrides,
      }),
  },
  {
    name: "takeWithdraw",
    parse: (amount: bigint, overrides: Overrides = {}) =>
      parseMidnightTakeWithdraw({
        ...common,
        target: { type: "assets", assets: amount, maxUnits: amount },
        takeableOffers: [midnightApiTake({ buy: true })],
        ...overrides,
      }),
  },
  {
    name: "supplyCollateralTakeBorrow",
    parse: (amount: bigint, overrides: Overrides = {}) =>
      parseMidnightSupplyCollateralTakeBorrow({
        ...common,
        collateralSupplies: [{ collateralIndex: 0n, assets: 1n }],
        target: { type: "assets", assets: amount, maxUnits: amount },
        takeableOffers: [midnightApiTake({ buy: true })],
        ...overrides,
      }),
  },
  {
    name: "takeRepayWithdrawCollateral",
    parse: (amount: bigint, overrides: Overrides = {}) =>
      parseMidnightTakeRepayWithdrawCollateral({
        ...common,
        repayEnabled: true,
        collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
        collateralReceiver: midnightAddresses.taker,
        target: { type: "assets", assets: amount, minUnits: amount },
        takeableOffers: [midnightApiTake()],
        ...overrides,
      }),
  },
];

describe.each(cases)("$name parsed contract", ({ parse }) => {
  test.each([1n, maxUint128])("accepts bounded targets %s", (amount) => {
    const parsed = parse(amount);
    expect(parsed.target).toMatchObject({ assets: amount });
    expect(parsed.referralFeePct).toBe(0n);
    expect(parsed.referralFeeRecipient).toBe(zeroAddress);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(
      Object.isFrozen(
        parsed.takeableOffers[0]!.offer.market.collateralParams[0],
      ),
    ).toBe(true);
  });
  test.each([0n, -1n, maxUint128 + 1n])("rejects target %s", (amount) => {
    expect(() => parse(amount)).toThrow(
      amount <= 0n ? NonPositiveInputError : InputExceedsMaxError,
    );
  });
  test("rejects empty offers and unbounded deadline", () => {
    expect(() => parse(1n, { takeableOffers: [] })).toThrow(
      EmptyMidnightTakeableOffersError,
    );
    expect(() => parse(1n, { deadline: maxUint256 })).toThrow(
      UnboundedMidnightTakeInputError,
    );
  });
  test("retains malformed referral and cap errors", () => {
    expect(() =>
      parse(1n, { referralFeeRecipient: "0x12" as Address }),
    ).toThrow(MidnightCalldataEncodingError);
    expect(() =>
      parse(1n, {
        referralFeePct: 100_000000000000000n + 1n,
        referralFeeRecipient: midnightAddresses.maker,
      }),
    ).toThrow(MidnightReferralFeePctExceededError);
  });
});

test("supply sums are bounded per configured index", () => {
  const params = {
    ...common,
    target: { type: "assets", assets: 1n, maxUnits: 1n } as const,
    takeableOffers: [midnightApiTake({ buy: true })],
  };
  expect(() =>
    parseMidnightSupplyCollateralTakeBorrow({
      ...params,
      collateralSupplies: [
        { collateralIndex: 0n, assets: maxUint128 },
        { collateralIndex: 0n, assets: 1n },
      ],
    }),
  ).toThrow(InputExceedsMaxError);
  const parsed = parseMidnightSupplyCollateralTakeBorrow({
    ...params,
    collateralSupplies: [
      { collateralIndex: 0n, assets: maxUint128 - 1n },
      { collateralIndex: 0n, assets: 1n },
    ],
  });
  expect(parsed.collateralSupplies.map(({ assets }) => assets)).toEqual([
    maxUint128 - 1n,
    1n,
  ]);
});

test("sell bounds include referral fees", () => {
  expect(() =>
    parseMidnightTakeBorrow({
      ...common,
      target: { type: "assets", assets: 100n, maxUnits: 100n },
      takeableOffers: [midnightApiTake({ buy: true })],
      referralFeePct: 10_000000000000000n,
      referralFeeRecipient: midnightAddresses.maker,
    }),
  ).toThrow(MidnightTakeTargetUnreachableError);
});

test("repayment alone accepts the whole-debt units sentinel", () => {
  const params = {
    ...common,
    takeableOffers: [midnightApiTake()],
    target: { type: "units", units: maxUint256, maxBuyerAssets: 100n } as const,
  };
  expect(() => parseMidnightTakeLend(params)).toThrow(
    UnboundedMidnightTakeInputError,
  );
  expect(
    parseMidnightTakeRepayWithdrawCollateral({
      ...params,
      repayEnabled: true,
      collateralWithdrawals: [],
      collateralReceiver: midnightAddresses.taker,
    }).target,
  ).toMatchObject({ units: maxUint256 });
});

test("snapshot owns signed offer bytes, nested markets, target and metadata", () => {
  const market = MarketUtils.toStruct(midnightMarket);
  const offer = midnightApiTake();
  const target = { type: "assets", assets: 10n, minUnits: 1n } as const;
  const metadata = { origin: "a1b2c3d4" };
  const snapshot = snapshotMidnightTakeParams({
    direction: "buy",
    market,
    takeableOffers: [offer],
    target,
    metadata,
  });
  Object.assign(offer, { ratifierData: "0xdead" });
  Object.assign(offer.offer.market.collateralParams[0]!, {
    token: midnightAddresses.dai,
  });
  Object.assign(target, { assets: 20n });
  Object.assign(metadata, { origin: "deadbeef" });
  Object.assign(market, { loanToken: midnightAddresses.dai });
  expect(snapshot.takeableOffers[0]!.ratifierData).toBe("0x1234");
  expect(
    snapshot.takeableOffers[0]!.offer.market.collateralParams[0]!.token,
  ).toBe(midnightAddresses.collateralToken);
  expect(snapshot.target).toMatchObject({ assets: 10n });
  expect(snapshot.market.loanToken).toBe(midnightAddresses.loanToken);
  expect(snapshot.metadata?.origin).toBe("a1b2c3d4");
  expect(Object.isFrozen(offer.offer.market)).toBe(false);
});

describe("caller-owned context on structurally extended inputs", () => {
  test.each([
    midnightSupplyCollateral,
    midnightWithdrawCollateral,
    midnightRedeem,
    midnightRepayWithdrawCollateral,
  ])("%s leaves caller context mutable", (build) => {
    const context = new MarketParams(MarketUtils.toStruct(midnightMarket));
    const params = {
      ...common,
      onBehalf: midnightAddresses.taker,
      assets: 1n,
      units: 1n,
      collateralReceiver: midnightAddresses.taker,
      collateralWithdrawals: [],
      repay: { type: "assets" as const, assets: 1n },
      context,
      metadata: { origin: "a1b2c3d4", context },
    };
    const tx = build(params);
    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(context)).toBe(false);
  });
  test.each(cases)(
    "$name drops unowned context before freezing parsed values",
    ({ parse }) => {
      const context = new MarketParams(MarketUtils.toStruct(midnightMarket));
      const input = parse(1n);
      const overrides = {
        deadline: common.deadline,
        context,
        target: { ...input.target, context },
        takeableOffers: input.takeableOffers.map((take) => ({
          ...take,
          offer: { ...take.offer, context },
        })),
        metadata: { origin: "a1b2c3d4", context },
      };
      const parsed = parse(1n, overrides);
      expect(Object.isFrozen(context)).toBe(false);
      expect(parsed).not.toHaveProperty("context");
      expect(parsed.target).not.toHaveProperty("context");
      expect(parsed.takeableOffers[0]!.offer).not.toHaveProperty("context");
      expect(parsed.metadata).not.toHaveProperty("context");
    },
  );
});

test("complete raw params cannot bypass direct operation constructors", () => {
  expectTypeOf<MidnightSupplyCollateralParams>().not.toExtend<
    Parameters<typeof encodeMidnightSupplyCollateral>[0]
  >();
  expectTypeOf<MidnightWithdrawCollateralParams>().not.toExtend<
    Parameters<typeof encodeMidnightWithdrawCollateral>[0]
  >();
  expectTypeOf<MidnightRedeemParams>().not.toExtend<
    Parameters<typeof encodeMidnightRedeem>[0]
  >();
});

test.each([
  {
    direction: "buy",
    target: { type: "assets", assets: 10n, minUnits: 1n, maxUnits: 999n },
    expected: { type: "assets", assets: 10n, minUnits: 1n },
  },
  {
    direction: "sell",
    target: { type: "assets", assets: 10n, maxUnits: 20n, minUnits: 999n },
    expected: { type: "assets", assets: 10n, maxUnits: 20n },
  },
  {
    direction: "buy",
    target: {
      type: "units",
      units: 10n,
      maxBuyerAssets: 20n,
      minSellerAssets: 999n,
    },
    expected: { type: "units", units: 10n, maxBuyerAssets: 20n },
  },
  {
    direction: "sell",
    target: {
      type: "units",
      units: 10n,
      minSellerAssets: 1n,
      maxBuyerAssets: 999n,
    },
    expected: { type: "units", units: 10n, minSellerAssets: 1n },
  },
] as const)(
  "snapshot retains only $direction $target.type fields despite opposite-side keys",
  (params) => {
    const snapshot = snapshotMidnightTakeParams({
      ...params,
      market: midnightMarket,
      takeableOffers: [midnightApiTake()],
    });
    expect(snapshot.target).toEqual(params.expected);
    expect(Object.isFrozen(snapshot.target)).toBe(true);
  },
);
