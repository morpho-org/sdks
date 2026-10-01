import { MarketUtils } from "@morpho-org/blue-sdk";
import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import { ConsumerLimitViolationError } from "../../errors.js";
import type { OperationLimit } from "../../limits.js";
import {
  emptyDiff,
  makeCheckContext,
  makeMarketState,
  makeParsedState,
  TEST_MARKET_ID,
  TEST_OWNER,
} from "../../test-helpers/index.js";
import { checkBlueOperation, fundingDebitOverrides } from "./blue.js";

const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

const ctx = makeCheckContext();

const market = {
  marketId: TEST_MARKET_ID,
  params: {
    loanToken: TOKEN,
    collateralToken: getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
    oracle: getAddress("0x0000000000000000000000000000000000000001"),
    irm: getAddress("0x0000000000000000000000000000000000000002"),
    lltv: 900000000000000000n,
  },
} as const;

describe("checkBlueOperation", () => {
  test("blueAuthorization returns the requested flag", () => {
    const op = {
      type: "blueAuthorization",
      transactionIndex: 0,
      authorized: getAddress("0x3333333333333333333333333333333333333333"),
      isAuthorized: true,
    } as unknown as Parameters<typeof checkBlueOperation>[1];
    const checked = checkBlueOperation(
      ctx,
      op,
      makeParsedState(),
      makeParsedState(),
      { ...emptyDiff },
    );
    expect(checked.outcome).toEqual({ isAuthorized: true });
  });

  test("error: position missing from read state", () => {
    const op = {
      type: "blueSupply",
      transactionIndex: 0,
      market,
      assets: 100n,
      onBehalf: TEST_OWNER,
      funding: { type: "erc20", token: TOKEN, assets: 100n },
    } as unknown as Parameters<typeof checkBlueOperation>[1];
    const empty = makeParsedState();
    expect(() =>
      checkBlueOperation(ctx, op, empty, empty, { ...emptyDiff }),
    ).toThrow();
  });

  test("blueSupply: position grows by the exact minted shares", () => {
    const before = makeMarketState({ marketId: TEST_MARKET_ID });
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: { supplyAssets: 100n, supplyShares: 100_000n },
      market: {
        totalSupplyAssets: 1_100n,
        totalSupplyShares: 101_000n,
        liquidityAssets: 1_100n,
      },
    });
    const op = {
      type: "blueSupply",
      transactionIndex: 0,
      market,
      assets: 100n,
      onBehalf: TEST_OWNER,
      funding: { type: "erc20", token: TOKEN, assets: 100n },
    } as unknown as Parameters<typeof checkBlueOperation>[1];
    const checked = checkBlueOperation(ctx, op, before, after, {
      ...emptyDiff,
    });
    expect(
      (checked.outcome as { supplySharesMinted: bigint }).supplySharesMinted,
    ).toBe(100_000n);
  });
});

describe("fundingDebitOverrides", () => {
  test("keyed per operation — a same-token supply gets no repay override", () => {
    const repayOp = {
      type: "blueRepay",
      transactionIndex: 0,
      market,
      repay: { type: "assets", assets: 10n },
      onBehalf: TEST_OWNER,
      funding: { type: "erc20", token: TOKEN, assets: 10n },
    } as unknown as Parameters<typeof checkBlueOperation>[1];
    const supplyOp = {
      type: "blueSupply",
      transactionIndex: 1,
      market,
      funding: { type: "erc20", token: TOKEN, assets: 5n },
    } as unknown as Parameters<typeof checkBlueOperation>[1];
    const state = makeMarketState({
      marketId: TEST_MARKET_ID,
      market: { totalBorrowAssets: 1_000n, totalBorrowShares: 1_000n },
    });
    const overrides = fundingDebitOverrides([repayOp, supplyOp], state);
    expect(overrides.get(repayOp)).toBe(10n);
    expect(overrides.has(supplyOp)).toBe(false);
  });

  test("empty for non-repay operations", () => {
    const op = {
      type: "blueSupply",
      funding: { type: "erc20", token: TOKEN, assets: 5n },
    } as unknown as Parameters<typeof checkBlueOperation>[1];
    expect(fundingDebitOverrides([op], makeParsedState()).size).toBe(0);
  });
});

describe("checkBlueOperation — consumer limits", () => {
  const ctxWith = (operations: OperationLimit[]) =>
    makeCheckContext({
      limits: { ...makeCheckContext().limits, operations },
    });

  const OTHER: Address = getAddress(
    "0x00000000000000000000000000000000000000ff",
  );

  type Op = Parameters<typeof checkBlueOperation>[1];

  const run =
    (args: {
      op: Op;
      before: ReturnType<typeof makeMarketState>;
      after: ReturnType<typeof makeMarketState>;
      limits: OperationLimit[];
    }) =>
    () =>
      checkBlueOperation(
        ctxWith(args.limits),
        args.op,
        args.before,
        args.after,
        {
          ...emptyDiff,
        },
      );

  const mkOp = (op: object) =>
    ({ onBehalf: TEST_OWNER, receiver: TEST_OWNER, ...op }) as Op;
  const mkLimit = (limit: object) => limit as OperationLimit;

  const ORACLE = {
    oraclePrice: 10n ** 36n,
    totalBorrowAssets: 1_000_000n,
    totalBorrowShares: 1_000_000n,
  };
  const IRM = { rateAtTargetPerSecondWad: 0n };

  describe("blueAuthorization", () => {
    const AUTH: Address = getAddress(
      "0x00000000000000000000000000000000000000aa",
    );
    const op = mkOp({
      type: "blueAuthorization",
      transactionIndex: 0,
      authorized: AUTH,
      isAuthorized: true,
    });
    const state = makeParsedState();
    const call = (limits: OperationLimit[]) => () =>
      checkBlueOperation(ctxWith(limits), op, state, state, { ...emptyDiff });
    test("pass", () => {
      expect(
        call([
          {
            type: "blueAuthorization",
            authorized: AUTH,
            expectedIsAuthorized: true,
          },
        ]),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["authorized", { authorized: OTHER }],
      ["expectedIsAuthorized", { expectedIsAuthorized: false }],
    ])("violation: %s", (_f, override) => {
      expect(
        call([
          mkLimit({ type: "blueAuthorization", authorized: AUTH, ...override }),
        ]),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("blueSupply", () => {
    const minted = MarketUtils.toSupplyShares(
      100n,
      { totalSupplyAssets: 1_000n, totalSupplyShares: 1_000n },
      "Down",
    );
    const before = makeMarketState({ marketId: TEST_MARKET_ID });
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: { supplyAssets: 100n, supplyShares: minted },
      market: {
        totalSupplyAssets: 1_100n,
        totalSupplyShares: 1_000n + minted,
        liquidityAssets: 1_100n,
      },
    });
    const op = mkOp({
      type: "blueSupply",
      transactionIndex: 0,
      market,
      assets: 100n,
      onBehalf: TEST_OWNER,
      funding: { type: "erc20", token: TOKEN, assets: 100n },
    });
    test("pass", () => {
      expect(
        run({
          op,
          before,
          after,
          limits: [
            mkLimit({
              type: "blueSupply",
              marketId: TEST_MARKET_ID,
              expectedAssets: 100n,
              expectedOnBehalf: TEST_OWNER,
              minSupplySharesMinted: 1n,
            }),
          ],
        }),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      [
        "marketId",
        {
          marketId:
            "0x0000000000000000000000000000000000000000000000000000000000000bad",
        },
      ],
      ["expectedAssets", { expectedAssets: 99n }],
      ["expectedOnBehalf", { expectedOnBehalf: OTHER }],
      ["minSupplySharesMinted", { minSupplySharesMinted: 999_999_999n }],
    ])("violation: %s", (_f, override) => {
      expect(
        run({
          op,
          before,
          after,
          limits: [
            mkLimit({
              type: "blueSupply",
              marketId: TEST_MARKET_ID,
              ...override,
            }),
          ],
        }),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("blueWithdraw", () => {
    const burned = MarketUtils.toSupplyShares(
      100n,
      { totalSupplyAssets: 1_000n, totalSupplyShares: 1_000n },
      "Up",
    );
    const before = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: { supplyAssets: 200n, supplyShares: burned + 200n },
    });
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      position: { supplyAssets: 100n, supplyShares: 200n },
      market: { liquidityAssets: 900n },
    });
    const op = mkOp({
      type: "blueWithdraw",
      transactionIndex: 0,
      market,
      amount: { type: "assets", assets: 100n },
      receiver: TEST_OWNER,
      fullClose: false,
    });
    test("pass", () => {
      expect(
        run({
          op,
          before,
          after,
          limits: [
            mkLimit({
              type: "blueWithdraw",
              marketId: TEST_MARKET_ID,
              expectedReceiver: TEST_OWNER,
              expectedFullClose: false,
              minAssetsReceived: 1n,
              maxSupplySharesBurned: 10n ** 30n,
              maxUtilizationAfterWad: 10n ** 30n,
              maxReallocationPenaltyAssets: 10n ** 30n,
            }),
          ],
        }),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      [
        "marketId",
        {
          marketId:
            "0x0000000000000000000000000000000000000000000000000000000000000bad",
        },
      ],
      ["expectedReceiver", { expectedReceiver: OTHER }],
      ["expectedFullClose", { expectedFullClose: true }],
      ["minAssetsReceived", { minAssetsReceived: 10n ** 30n }],
      ["maxSupplySharesBurned", { maxSupplySharesBurned: 0n }],
      ["maxUtilizationAfterWad", { maxUtilizationAfterWad: -1n }],
      ["maxReallocationPenaltyAssets", { maxReallocationPenaltyAssets: -1n }],
    ])("violation: %s", (_f, override) => {
      expect(
        run({
          op,
          before,
          after,
          limits: [
            mkLimit({
              type: "blueWithdraw",
              marketId: TEST_MARKET_ID,
              ...override,
            }),
          ],
        }),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("blueSupplyCollateral", () => {
    const before = makeMarketState({
      marketId: TEST_MARKET_ID,
      market: ORACLE,
      internals: IRM,
      position: { borrowShares: 100n, collateral: 300n },
    });
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      market: ORACLE,
      internals: IRM,
      position: { borrowShares: 100n, collateral: 400n },
    });
    const op = mkOp({
      type: "blueSupplyCollateral",
      transactionIndex: 0,
      market,
      collateralAssets: 100n,
      onBehalf: TEST_OWNER,
    });
    test("pass", () => {
      expect(
        run({
          op,
          before,
          after,
          limits: [
            mkLimit({
              type: "blueSupplyCollateral",
              marketId: TEST_MARKET_ID,
              expectedAssets: 100n,
              expectedOnBehalf: TEST_OWNER,
              maxLtvAfterWad: 10n ** 30n,
            }),
          ],
        }),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      [
        "marketId",
        {
          marketId:
            "0x0000000000000000000000000000000000000000000000000000000000000bad",
        },
      ],
      ["expectedAssets", { expectedAssets: 99n }],
      ["expectedOnBehalf", { expectedOnBehalf: OTHER }],
      ["maxLtvAfterWad", { maxLtvAfterWad: -1n }],
    ])("violation: %s", (_f, override) => {
      expect(
        run({
          op,
          before,
          after,
          limits: [
            mkLimit({
              type: "blueSupplyCollateral",
              marketId: TEST_MARKET_ID,
              ...override,
            }),
          ],
        }),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("blueWithdrawCollateral", () => {
    const before = makeMarketState({
      marketId: TEST_MARKET_ID,
      market: ORACLE,
      internals: IRM,
      position: { borrowShares: 100n, collateral: 400n },
    });
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      market: ORACLE,
      internals: IRM,
      position: { borrowShares: 100n, collateral: 300n },
    });
    const op = mkOp({
      type: "blueWithdrawCollateral",
      transactionIndex: 0,
      market,
      collateralAssets: 100n,
      receiver: TEST_OWNER,
    });
    test("pass", () => {
      expect(
        run({
          op,
          before,
          after,
          limits: [
            mkLimit({
              type: "blueWithdrawCollateral",
              marketId: TEST_MARKET_ID,
              expectedAssets: 100n,
              expectedReceiver: TEST_OWNER,
              maxLtvAfterWad: 10n ** 30n,
              minHealthFactorAfterWad: 0n,
            }),
          ],
        }),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      [
        "marketId",
        {
          marketId:
            "0x0000000000000000000000000000000000000000000000000000000000000bad",
        },
      ],
      ["expectedAssets", { expectedAssets: 99n }],
      ["expectedReceiver", { expectedReceiver: OTHER }],
      ["maxLtvAfterWad", { maxLtvAfterWad: -1n }],
      ["minHealthFactorAfterWad", { minHealthFactorAfterWad: 10n ** 30n }],
    ])("violation: %s", (_f, override) => {
      expect(
        run({
          op,
          before,
          after,
          limits: [
            mkLimit({
              type: "blueWithdrawCollateral",
              marketId: TEST_MARKET_ID,
              ...override,
            }),
          ],
        }),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("blueBorrow", () => {
    const before = makeMarketState({
      marketId: TEST_MARKET_ID,
      market: ORACLE,
      internals: IRM,
      position: { collateral: 400n },
    });
    const borrowShares = MarketUtils.toBorrowShares(
      100n,
      { totalBorrowAssets: 1_000_000n, totalBorrowShares: 1_000_000n },
      "Up",
    );
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      market: { ...ORACLE, liquidityAssets: 900n },
      internals: IRM,
      position: { collateral: 400n, borrowShares },
    });
    const op = mkOp({
      type: "blueBorrow",
      transactionIndex: 0,
      market,
      borrowAssets: 100n,
      receiver: TEST_OWNER,
    });
    test("pass", () => {
      expect(
        run({
          op,
          before,
          after,
          limits: [
            mkLimit({
              type: "blueBorrow",
              marketId: TEST_MARKET_ID,
              expectedAssets: 100n,
              expectedReceiver: TEST_OWNER,
              maxBorrowSharesMinted: 10n ** 30n,
              maxLtvAfterWad: 10n ** 30n,
              minHealthFactorAfterWad: 0n,
              maxUtilizationAfterWad: 10n ** 30n,
              maxAfterBorrowApyWad: 10n ** 30n,
              maxReallocationPenaltyAssets: 10n ** 30n,
            }),
          ],
        }),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      [
        "marketId",
        {
          marketId:
            "0x0000000000000000000000000000000000000000000000000000000000000bad",
        },
      ],
      ["expectedAssets", { expectedAssets: 99n }],
      ["expectedReceiver", { expectedReceiver: OTHER }],
      ["maxBorrowSharesMinted", { maxBorrowSharesMinted: 0n }],
      ["maxLtvAfterWad", { maxLtvAfterWad: -1n }],
      ["minHealthFactorAfterWad", { minHealthFactorAfterWad: 10n ** 30n }],
      ["maxUtilizationAfterWad", { maxUtilizationAfterWad: -1n }],
      ["maxAfterBorrowApyWad", { maxAfterBorrowApyWad: -1n }],
      ["maxReallocationPenaltyAssets", { maxReallocationPenaltyAssets: -1n }],
    ])("violation: %s", (_f, override) => {
      expect(
        run({
          op,
          before,
          after,
          limits: [
            mkLimit({
              type: "blueBorrow",
              marketId: TEST_MARKET_ID,
              ...override,
            }),
          ],
        }),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("blueSupplyCollateralBorrow", () => {
    const before = makeMarketState({
      marketId: TEST_MARKET_ID,
      market: ORACLE,
      internals: IRM,
      position: { collateral: 300n },
    });
    const borrowShares = MarketUtils.toBorrowShares(
      100n,
      { totalBorrowAssets: 1_000_000n, totalBorrowShares: 1_000_000n },
      "Up",
    );
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      market: { ...ORACLE, liquidityAssets: 900n },
      internals: IRM,
      position: { collateral: 400n, borrowShares },
    });
    const op = mkOp({
      type: "blueSupplyCollateralBorrow",
      transactionIndex: 0,
      market,
      collateralAssets: 100n,
      borrowAssets: 100n,
      onBehalf: TEST_OWNER,
      receiver: TEST_OWNER,
    });
    test("pass", () => {
      expect(
        run({
          op,
          before,
          after,
          limits: [
            mkLimit({
              type: "blueSupplyCollateralBorrow",
              marketId: TEST_MARKET_ID,
              expectedCollateralAssets: 100n,
              expectedBorrowAssets: 100n,
              expectedOnBehalf: TEST_OWNER,
              expectedReceiver: TEST_OWNER,
              maxBorrowSharesMinted: 10n ** 30n,
              maxLtvAfterWad: 10n ** 30n,
              minHealthFactorAfterWad: 0n,
              maxUtilizationAfterWad: 10n ** 30n,
              maxAfterBorrowApyWad: 10n ** 30n,
              maxReallocationPenaltyAssets: 10n ** 30n,
            }),
          ],
        }),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      [
        "marketId",
        {
          marketId:
            "0x0000000000000000000000000000000000000000000000000000000000000bad",
        },
      ],
      ["expectedCollateralAssets", { expectedCollateralAssets: 99n }],
      ["expectedBorrowAssets", { expectedBorrowAssets: 99n }],
      ["expectedOnBehalf", { expectedOnBehalf: OTHER }],
      ["expectedReceiver", { expectedReceiver: OTHER }],
      ["maxBorrowSharesMinted", { maxBorrowSharesMinted: 0n }],
      ["maxLtvAfterWad", { maxLtvAfterWad: -1n }],
      ["minHealthFactorAfterWad", { minHealthFactorAfterWad: 10n ** 30n }],
      ["maxUtilizationAfterWad", { maxUtilizationAfterWad: -1n }],
      ["maxAfterBorrowApyWad", { maxAfterBorrowApyWad: -1n }],
      ["maxReallocationPenaltyAssets", { maxReallocationPenaltyAssets: -1n }],
    ])("violation: %s", (_f, override) => {
      expect(
        run({
          op,
          before,
          after,
          limits: [
            mkLimit({
              type: "blueSupplyCollateralBorrow",
              marketId: TEST_MARKET_ID,
              ...override,
            }),
          ],
        }),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("blueRepay", () => {
    const before = makeMarketState({
      marketId: TEST_MARKET_ID,
      market: { totalBorrowAssets: 1_000n, totalBorrowShares: 1_000n },
      position: { borrowShares: 200n, collateral: 400n },
    });
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      market: { totalBorrowAssets: 1_000n, totalBorrowShares: 1_000n },
      position: { borrowShares: 100n, collateral: 400n },
    });
    const op = mkOp({
      type: "blueRepay",
      transactionIndex: 0,
      market,
      repay: { type: "shares", shares: 100n },
      onBehalf: TEST_OWNER,
      fullClose: false,
    });
    test("pass", () => {
      expect(
        run({
          op,
          before,
          after,
          limits: [
            mkLimit({
              type: "blueRepay",
              marketId: TEST_MARKET_ID,
              expectedOnBehalf: TEST_OWNER,
              expectedFullClose: false,
              maxAssetsPaid: 10n ** 30n,
              minBorrowSharesBurned: 1n,
              maxResidualBorrowShares: 10n ** 30n,
              minRefundAssets: 0n,
            }),
          ],
        }),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      [
        "marketId",
        {
          marketId:
            "0x0000000000000000000000000000000000000000000000000000000000000bad",
        },
      ],
      ["expectedOnBehalf", { expectedOnBehalf: OTHER }],
      ["expectedFullClose", { expectedFullClose: true }],
      ["maxAssetsPaid", { maxAssetsPaid: -1n }],
      ["minBorrowSharesBurned", { minBorrowSharesBurned: 10n ** 30n }],
      ["maxResidualBorrowShares", { maxResidualBorrowShares: 0n }],
      ["minRefundAssets", { minRefundAssets: 1n }],
    ])("violation: %s", (_f, override) => {
      expect(
        run({
          op,
          before,
          after,
          limits: [
            mkLimit({
              type: "blueRepay",
              marketId: TEST_MARKET_ID,
              ...override,
            }),
          ],
        }),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("blueRepayWithdrawCollateral", () => {
    const before = makeMarketState({
      marketId: TEST_MARKET_ID,
      market: {
        ...ORACLE,
        totalBorrowAssets: 1_000n,
        totalBorrowShares: 1_000n,
      },
      internals: IRM,
      position: { borrowShares: 200n, collateral: 400n },
    });
    const after = makeMarketState({
      marketId: TEST_MARKET_ID,
      market: {
        ...ORACLE,
        totalBorrowAssets: 1_000n,
        totalBorrowShares: 1_000n,
      },
      internals: IRM,
      position: { borrowShares: 100n, collateral: 300n },
    });
    const op = mkOp({
      type: "blueRepayWithdrawCollateral",
      transactionIndex: 0,
      market,
      repay: { type: "shares", shares: 100n },
      collateralAssets: 100n,
      onBehalf: TEST_OWNER,
      receiver: TEST_OWNER,
      fullClose: false,
    });
    test("pass", () => {
      expect(
        run({
          op,
          before,
          after,
          limits: [
            mkLimit({
              type: "blueRepayWithdrawCollateral",
              marketId: TEST_MARKET_ID,
              expectedWithdrawAssets: 100n,
              expectedOnBehalf: TEST_OWNER,
              expectedReceiver: TEST_OWNER,
              expectedFullClose: false,
              maxAssetsPaid: 10n ** 30n,
              minBorrowSharesBurned: 1n,
              maxResidualBorrowShares: 10n ** 30n,
              minRefundAssets: 0n,
              maxLtvAfterWad: 10n ** 30n,
              minHealthFactorAfterWad: 0n,
            }),
          ],
        }),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      [
        "marketId",
        {
          marketId:
            "0x0000000000000000000000000000000000000000000000000000000000000bad",
        },
      ],
      ["expectedWithdrawAssets", { expectedWithdrawAssets: 99n }],
      ["expectedOnBehalf", { expectedOnBehalf: OTHER }],
      ["expectedReceiver", { expectedReceiver: OTHER }],
      ["expectedFullClose", { expectedFullClose: true }],
      ["maxAssetsPaid", { maxAssetsPaid: -1n }],
      ["minBorrowSharesBurned", { minBorrowSharesBurned: 10n ** 30n }],
      ["maxResidualBorrowShares", { maxResidualBorrowShares: 0n }],
      ["minRefundAssets", { minRefundAssets: 1n }],
      ["maxLtvAfterWad", { maxLtvAfterWad: -1n }],
      ["minHealthFactorAfterWad", { minHealthFactorAfterWad: 10n ** 30n }],
    ])("violation: %s", (_f, override) => {
      expect(
        run({
          op,
          before,
          after,
          limits: [
            mkLimit({
              type: "blueRepayWithdrawCollateral",
              marketId: TEST_MARKET_ID,
              ...override,
            }),
          ],
        }),
      ).toThrow(ConsumerLimitViolationError);
    });
  });
});
