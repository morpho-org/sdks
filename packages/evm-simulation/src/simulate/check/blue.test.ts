import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import { ConsumerLimitViolationError } from "../../errors.js";
import type { OperationLimit } from "../../limits.js";
import {
  makeCheckContext,
  makeMarketState,
  makeParsedState,
  TEST_MARKET_ID,
  TEST_OWNER,
} from "../../test-helpers/index.js";
import {
  checkBlueOperation,
  checkBlueOperationLimits,
  fundingDebitOverrides,
} from "./blue.js";
import type { CheckedOperation } from "./helpers.js";

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
    expect(() => checkBlueOperation(ctx, op, empty, empty)).toThrow();
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
    const checked = checkBlueOperation(ctx, op, before, after);
    expect(
      (checked.outcome as { supplySharesMinted: bigint }).supplySharesMinted,
    ).toBe(100_000n);
  });
});

describe("fundingDebitOverrides", () => {
  test("empty for non-repay operations", () => {
    const op = {
      type: "blueSupply",
      funding: { type: "erc20", token: TOKEN, assets: 5n },
    } as unknown as Parameters<typeof checkBlueOperation>[1];
    expect(
      fundingDebitOverrides([op], makeParsedState(), TEST_OWNER).size,
    ).toBe(0);
  });
});

describe("checkBlueOperationLimits", () => {
  const ctxWith = (operations: OperationLimit[]) =>
    makeCheckContext({
      limits: { ...makeCheckContext().limits, operations },
    });

  const checked = (operation: object, outcome: object) =>
    ({ operation, outcome }) as CheckedOperation;

  // biome-ignore lint/complexity/useMaxParams: pass/fail helper reads clearest with positional arguments
  const expectPass = (
    operation: object,
    outcome: object,
    limit: OperationLimit,
  ) =>
    expect(() =>
      checkBlueOperationLimits(ctxWith([limit]), checked(operation, outcome)),
    ).not.toThrow();

  // biome-ignore lint/complexity/useMaxParams: pass/fail helper reads clearest with positional arguments
  const expectFail = (
    operation: object,
    outcome: object,
    limit: OperationLimit,
  ) =>
    expect(() =>
      checkBlueOperationLimits(ctxWith([limit]), checked(operation, outcome)),
    ).toThrow(ConsumerLimitViolationError);

  const OTHER: Address = getAddress(
    "0x00000000000000000000000000000000000000ff",
  );
  const finite = (valueWad: bigint) => ({ type: "finite", valueWad }) as const;
  const unbounded = { type: "unbounded", reason: "zeroLiquidity" } as const;

  describe("blueSupply", () => {
    const op = {
      type: "blueSupply",
      transactionIndex: 0,
      market,
      assets: 100n,
      onBehalf: TEST_OWNER,
    };
    const outcome = { supplySharesMinted: 100n };
    test("pass: all fields satisfied", () => {
      expectPass(op, outcome, {
        type: "blueSupply",
        marketId: TEST_MARKET_ID,
        expectedAssets: 100n,
        expectedOnBehalf: TEST_OWNER,
        minSupplySharesMinted: 50n,
      });
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
      ["minSupplySharesMinted", { minSupplySharesMinted: 101n }],
    ])("violation: %s", (_field, override) => {
      expectFail(op, outcome, {
        type: "blueSupply",
        marketId: TEST_MARKET_ID,
        ...override,
      } as OperationLimit);
    });
  });

  describe("blueWithdraw", () => {
    const op = {
      type: "blueWithdraw",
      transactionIndex: 0,
      market,
      receiver: TEST_OWNER,
      fullClose: false,
    };
    const outcome = {
      assetsReceived: 100n,
      supplySharesBurned: 100n,
      utilizationAfterWad: finite(500n),
      reallocationPenaltyAssets: 0n,
    };
    test("pass: all fields satisfied", () => {
      expectPass(op, outcome, {
        type: "blueWithdraw",
        marketId: TEST_MARKET_ID,
        expectedReceiver: TEST_OWNER,
        expectedFullClose: false,
        minAssetsReceived: 50n,
        maxSupplySharesBurned: 200n,
        maxUtilizationAfterWad: 600n,
        maxReallocationPenaltyAssets: 0n,
      });
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
      ["minAssetsReceived", { minAssetsReceived: 101n }],
      ["maxSupplySharesBurned", { maxSupplySharesBurned: 99n }],
      ["maxUtilizationAfterWad", { maxUtilizationAfterWad: 400n }],
      ["maxReallocationPenaltyAssets", { maxReallocationPenaltyAssets: -1n }],
    ])("violation: %s", (_field, override) => {
      expectFail(op, outcome, {
        type: "blueWithdraw",
        marketId: TEST_MARKET_ID,
        ...override,
      } as OperationLimit);
    });
  });

  describe("blueSupplyCollateral", () => {
    const op = {
      type: "blueSupplyCollateral",
      transactionIndex: 0,
      market,
      collateralAssets: 100n,
      onBehalf: TEST_OWNER,
    };
    const outcome = { ltvAfterWad: finite(100n) };
    test("pass: all fields satisfied", () => {
      expectPass(op, outcome, {
        type: "blueSupplyCollateral",
        marketId: TEST_MARKET_ID,
        expectedAssets: 100n,
        expectedOnBehalf: TEST_OWNER,
        maxLtvAfterWad: 200n,
      });
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
      ["maxLtvAfterWad", { maxLtvAfterWad: 99n }],
    ])("violation: %s", (_field, override) => {
      expectFail(op, outcome, {
        type: "blueSupplyCollateral",
        marketId: TEST_MARKET_ID,
        ...override,
      } as OperationLimit);
    });
    test("violation: maxLtvAfterWad vs non-finite metric", () => {
      expectFail(
        op,
        { ltvAfterWad: unbounded },
        {
          type: "blueSupplyCollateral",
          marketId: TEST_MARKET_ID,
          maxLtvAfterWad: 10n ** 27n,
        },
      );
    });
    test("pass: min bound vs non-finite metric", () => {
      const borrowOp = {
        type: "blueBorrow",
        transactionIndex: 0,
        market,
        borrowAssets: 100n,
        receiver: TEST_OWNER,
      };
      expectPass(
        borrowOp,
        {
          borrowSharesMinted: 100n,
          ltvAfterWad: finite(100n),
          healthFactorAfterWad: unbounded,
          utilizationAfterWad: finite(100n),
          borrowApyAfterWad: 1n,
          reallocationPenaltyAssets: 0n,
        },
        {
          type: "blueBorrow",
          marketId: TEST_MARKET_ID,
          minHealthFactorAfterWad: 10n ** 27n,
        },
      );
    });
  });

  describe("blueBorrow", () => {
    const op = {
      type: "blueBorrow",
      transactionIndex: 0,
      market,
      borrowAssets: 100n,
      receiver: TEST_OWNER,
    };
    const outcome = {
      borrowSharesMinted: 100n,
      ltvAfterWad: finite(100n),
      healthFactorAfterWad: finite(200n),
      utilizationAfterWad: finite(300n),
      borrowApyAfterWad: 400n,
      reallocationPenaltyAssets: 0n,
    };
    test("pass: all fields satisfied", () => {
      expectPass(op, outcome, {
        type: "blueBorrow",
        marketId: TEST_MARKET_ID,
        expectedAssets: 100n,
        expectedReceiver: TEST_OWNER,
        maxBorrowSharesMinted: 200n,
        maxLtvAfterWad: 200n,
        minHealthFactorAfterWad: 100n,
        maxUtilizationAfterWad: 400n,
        maxAfterBorrowApyWad: 500n,
        maxReallocationPenaltyAssets: 0n,
      });
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
      ["maxBorrowSharesMinted", { maxBorrowSharesMinted: 99n }],
      ["maxLtvAfterWad", { maxLtvAfterWad: 99n }],
      ["minHealthFactorAfterWad", { minHealthFactorAfterWad: 201n }],
      ["maxUtilizationAfterWad", { maxUtilizationAfterWad: 299n }],
      ["maxAfterBorrowApyWad", { maxAfterBorrowApyWad: 399n }],
      ["maxReallocationPenaltyAssets", { maxReallocationPenaltyAssets: -1n }],
    ])("violation: %s", (_field, override) => {
      expectFail(op, outcome, {
        type: "blueBorrow",
        marketId: TEST_MARKET_ID,
        ...override,
      } as OperationLimit);
    });
  });

  describe("blueSupplyCollateralBorrow", () => {
    const op = {
      type: "blueSupplyCollateralBorrow",
      transactionIndex: 0,
      market,
      collateralAssets: 100n,
      borrowAssets: 50n,
      onBehalf: TEST_OWNER,
      receiver: TEST_OWNER,
    };
    const outcome = {
      borrowSharesMinted: 50n,
      ltvAfterWad: finite(100n),
      healthFactorAfterWad: finite(200n),
      utilizationAfterWad: finite(300n),
      borrowApyAfterWad: 400n,
      reallocationPenaltyAssets: 0n,
    };
    test("pass: all fields satisfied", () => {
      expectPass(op, outcome, {
        type: "blueSupplyCollateralBorrow",
        marketId: TEST_MARKET_ID,
        expectedCollateralAssets: 100n,
        expectedBorrowAssets: 50n,
        expectedOnBehalf: TEST_OWNER,
        expectedReceiver: TEST_OWNER,
        maxBorrowSharesMinted: 100n,
        maxLtvAfterWad: 200n,
        minHealthFactorAfterWad: 100n,
        maxUtilizationAfterWad: 400n,
        maxAfterBorrowApyWad: 500n,
        maxReallocationPenaltyAssets: 0n,
      });
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
      ["expectedBorrowAssets", { expectedBorrowAssets: 49n }],
      ["expectedOnBehalf", { expectedOnBehalf: OTHER }],
      ["expectedReceiver", { expectedReceiver: OTHER }],
      ["maxBorrowSharesMinted", { maxBorrowSharesMinted: 49n }],
      ["maxLtvAfterWad", { maxLtvAfterWad: 99n }],
      ["minHealthFactorAfterWad", { minHealthFactorAfterWad: 201n }],
      ["maxUtilizationAfterWad", { maxUtilizationAfterWad: 299n }],
      ["maxAfterBorrowApyWad", { maxAfterBorrowApyWad: 399n }],
      ["maxReallocationPenaltyAssets", { maxReallocationPenaltyAssets: -1n }],
    ])("violation: %s", (_field, override) => {
      expectFail(op, outcome, {
        type: "blueSupplyCollateralBorrow",
        marketId: TEST_MARKET_ID,
        ...override,
      } as OperationLimit);
    });
  });

  describe("blueRepay", () => {
    const op = {
      type: "blueRepay",
      transactionIndex: 0,
      market,
      onBehalf: TEST_OWNER,
      fullClose: false,
    };
    const outcome = {
      assetsPaid: 100n,
      borrowSharesBurned: 100n,
      residualBorrowShares: 10n,
      refundAssets: 5n,
    };
    test("pass: all fields satisfied", () => {
      expectPass(op, outcome, {
        type: "blueRepay",
        marketId: TEST_MARKET_ID,
        expectedOnBehalf: TEST_OWNER,
        expectedFullClose: false,
        maxAssetsPaid: 200n,
        minBorrowSharesBurned: 50n,
        maxResidualBorrowShares: 20n,
        minRefundAssets: 1n,
      });
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
      ["maxAssetsPaid", { maxAssetsPaid: 99n }],
      ["minBorrowSharesBurned", { minBorrowSharesBurned: 101n }],
      ["maxResidualBorrowShares", { maxResidualBorrowShares: 9n }],
      ["minRefundAssets", { minRefundAssets: 6n }],
    ])("violation: %s", (_field, override) => {
      expectFail(op, outcome, {
        type: "blueRepay",
        marketId: TEST_MARKET_ID,
        ...override,
      } as OperationLimit);
    });
  });

  describe("blueWithdrawCollateral", () => {
    const op = {
      type: "blueWithdrawCollateral",
      transactionIndex: 0,
      market,
      collateralAssets: 100n,
      receiver: TEST_OWNER,
    };
    const outcome = {
      ltvAfterWad: finite(100n),
      healthFactorAfterWad: finite(200n),
    };
    test("pass: all fields satisfied", () => {
      expectPass(op, outcome, {
        type: "blueWithdrawCollateral",
        marketId: TEST_MARKET_ID,
        expectedAssets: 100n,
        expectedReceiver: TEST_OWNER,
        maxLtvAfterWad: 200n,
        minHealthFactorAfterWad: 100n,
      });
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
      ["maxLtvAfterWad", { maxLtvAfterWad: 99n }],
      ["minHealthFactorAfterWad", { minHealthFactorAfterWad: 201n }],
    ])("violation: %s", (_field, override) => {
      expectFail(op, outcome, {
        type: "blueWithdrawCollateral",
        marketId: TEST_MARKET_ID,
        ...override,
      } as OperationLimit);
    });
  });

  describe("blueRepayWithdrawCollateral", () => {
    const op = {
      type: "blueRepayWithdrawCollateral",
      transactionIndex: 0,
      market,
      collateralAssets: 100n,
      onBehalf: TEST_OWNER,
      receiver: TEST_OWNER,
      fullClose: false,
    };
    const outcome = {
      assetsPaid: 100n,
      borrowSharesBurned: 100n,
      residualBorrowShares: 10n,
      refundAssets: 5n,
      ltvAfterWad: finite(100n),
      healthFactorAfterWad: finite(200n),
    };
    test("pass: all fields satisfied", () => {
      expectPass(op, outcome, {
        type: "blueRepayWithdrawCollateral",
        marketId: TEST_MARKET_ID,
        expectedWithdrawAssets: 100n,
        expectedOnBehalf: TEST_OWNER,
        expectedReceiver: TEST_OWNER,
        expectedFullClose: false,
        maxAssetsPaid: 200n,
        minBorrowSharesBurned: 50n,
        maxResidualBorrowShares: 20n,
        minRefundAssets: 1n,
        maxLtvAfterWad: 200n,
        minHealthFactorAfterWad: 100n,
      });
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
      ["maxAssetsPaid", { maxAssetsPaid: 99n }],
      ["minBorrowSharesBurned", { minBorrowSharesBurned: 101n }],
      ["maxResidualBorrowShares", { maxResidualBorrowShares: 9n }],
      ["minRefundAssets", { minRefundAssets: 6n }],
      ["maxLtvAfterWad", { maxLtvAfterWad: 99n }],
      ["minHealthFactorAfterWad", { minHealthFactorAfterWad: 201n }],
    ])("violation: %s", (_field, override) => {
      expectFail(op, outcome, {
        type: "blueRepayWithdrawCollateral",
        marketId: TEST_MARKET_ID,
        ...override,
      } as OperationLimit);
    });
  });

  describe("blueAuthorization", () => {
    const AUTH: Address = getAddress(
      "0x00000000000000000000000000000000000000aa",
    );
    const op = {
      type: "blueAuthorization",
      transactionIndex: 0,
      authorized: AUTH,
      isAuthorized: true,
    };
    test("pass: all fields satisfied", () => {
      expectPass(
        op,
        { isAuthorized: true },
        {
          type: "blueAuthorization",
          authorized: AUTH,
          expectedIsAuthorized: true,
        },
      );
    });
    test.each<[string, object]>([
      ["authorized", { authorized: OTHER }],
      ["expectedIsAuthorized", { expectedIsAuthorized: false }],
    ])("violation: %s", (_field, override) => {
      expectFail(op, { isAuthorized: true }, {
        type: "blueAuthorization",
        authorized: AUTH,
        ...override,
      } as OperationLimit);
    });
  });
});
