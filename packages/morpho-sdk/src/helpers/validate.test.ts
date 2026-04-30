import {
  AccrualPosition,
  Market,
  MarketParams,
  MathLib,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  CbbtcUsdcMarketV1,
  WethUsdsMarketV1,
} from "../../test/fixtures/marketV1.js";
import {
  AccrualPositionUserMismatchError,
  AddressMismatchError,
  BorrowExceedsSafeLtvError,
  ChainIdMismatchError,
  EmptyReallocationWithdrawalsError,
  ExcessiveSlippageToleranceError,
  MarketIdMismatchError,
  MissingClientPropertyError,
  MissingMarketPriceError,
  NativeAmountOnNonWNativeCollateralError,
  NegativeReallocationFeeError,
  NegativeSlippageToleranceError,
  NonPositiveReallocationAmountError,
  ReallocationWithdrawalOnTargetMarketError,
  RepayExceedsDebtError,
  RepaySharesExceedDebtError,
  UnsortedReallocationWithdrawalsError,
  type VaultReallocation,
  WithdrawMakesPositionUnhealthyError,
} from "../types/index.js";
import { MAX_SLIPPAGE_TOLERANCE } from "./constant.js";
import {
  validateAccrualPosition,
  validateChainId,
  validateNativeCollateral,
  validatePositionHealth,
  validatePositionHealthAfterWithdraw,
  validateReallocations,
  validateRepayAmount,
  validateRepayShares,
  validateSlippageTolerance,
  validateUserAddress,
} from "./validate.js";

const USER_A: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const USER_B: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const marketParams = new MarketParams(WethUsdsMarketV1);

/** Builds a Market with configurable price. */
function makeMarket(overrides?: { price?: bigint }) {
  return new Market({
    params: marketParams,
    totalSupplyAssets: 10n ** 24n,
    totalBorrowAssets: 10n ** 24n / 2n,
    totalSupplyShares: 10n ** 24n,
    totalBorrowShares: 10n ** 24n / 2n,
    lastUpdate: 1_700_000_000n,
    fee: 0n,
    price: overrides?.price,
  });
}

/** Builds an AccrualPosition with configurable fields. */
function makePosition(overrides?: {
  user?: Address;
  collateral?: bigint;
  borrowShares?: bigint;
  market?: Market;
}) {
  const m = overrides?.market ?? makeMarket({ price: ORACLE_PRICE_SCALE });
  return new AccrualPosition(
    {
      user: overrides?.user ?? USER_A,
      supplyShares: 0n,
      borrowShares: overrides?.borrowShares ?? 0n,
      collateral: overrides?.collateral ?? 10n ** 18n,
    },
    m,
  );
}

// ---------------------------------------------------------------------------
// validateUserAddress
// ---------------------------------------------------------------------------

describe("validateUserAddress", () => {
  test("should pass when addresses match", () => {
    expect(() => validateUserAddress(USER_A, USER_A)).not.toThrow();
  });

  test("should throw MissingClientPropertyError when clientAccountAddress is undefined", () => {
    expect(() => validateUserAddress(undefined, USER_A)).toThrow(
      MissingClientPropertyError,
    );
    // Also lock in that the error names the missing property (`account`), so
    // a refactor swapping to e.g. `MissingClientPropertyError("chain")` fails.
    expect(() => validateUserAddress(undefined, USER_A)).toThrow(/account/);
  });

  test("should throw AddressMismatchError when addresses differ", () => {
    expect(() => validateUserAddress(USER_A, USER_B)).toThrow(
      AddressMismatchError,
    );
  });
});

// ---------------------------------------------------------------------------
// validateAccrualPosition
// ---------------------------------------------------------------------------

describe("validateAccrualPosition", () => {
  test("should pass when position matches market and user", () => {
    const pos = makePosition();
    expect(() =>
      validateAccrualPosition({
        positionData: pos,
        expectedMarketId: marketParams.id,
        expectedUser: USER_A,
      }),
    ).not.toThrow();
  });

  test("should throw MarketIdMismatchError when market IDs differ", () => {
    const pos = makePosition();
    const otherMarketId = new MarketParams(CbbtcUsdcMarketV1).id;
    expect(() =>
      validateAccrualPosition({
        positionData: pos,
        expectedMarketId: otherMarketId,
        expectedUser: USER_A,
      }),
    ).toThrow(MarketIdMismatchError);
  });

  test("should throw AccrualPositionUserMismatchError when users differ", () => {
    const pos = makePosition({ user: USER_A });
    expect(() =>
      validateAccrualPosition({
        positionData: pos,
        expectedMarketId: marketParams.id,
        expectedUser: USER_B,
      }),
    ).toThrow(AccrualPositionUserMismatchError);
  });
});

// ---------------------------------------------------------------------------
// validatePositionHealth
// ---------------------------------------------------------------------------

describe("validatePositionHealth", () => {
  const lltv = WethUsdsMarketV1.lltv; // 86%

  test("should pass when borrow is within safe LTV", () => {
    const pos = makePosition({
      collateral: 10n ** 18n,
      borrowShares: 0n,
      market: makeMarket({ price: ORACLE_PRICE_SCALE }),
    });
    // With 1:1 price and 86% LLTV (- 0.5% buffer ≈ 85.5%),
    // borrowing 80% of collateral should be safe.
    const borrowAmount = (8n * 10n ** 17n) / 10n; // 0.08 in 18-dec ≈ 8%
    expect(() =>
      validatePositionHealth({
        positionData: pos,
        additionalCollateral: 0n,
        borrowAmount,
        marketId: marketParams.id,
        lltv,
      }),
    ).not.toThrow();
  });

  test("should throw MissingMarketPriceError when price is undefined", () => {
    const pos = makePosition({
      market: makeMarket({ price: undefined }),
    });
    expect(() =>
      validatePositionHealth({
        positionData: pos,
        additionalCollateral: 0n,
        borrowAmount: 10n ** 18n,
        marketId: marketParams.id,
        lltv,
      }),
    ).toThrow(MissingMarketPriceError);
  });

  test("should throw BorrowExceedsSafeLtvError when borrow exceeds safe LTV", () => {
    const pos = makePosition({
      collateral: 10n ** 18n,
      borrowShares: 0n,
      market: makeMarket({ price: ORACLE_PRICE_SCALE }),
    });
    // With 1:1 price, borrowing 90% of collateral exceeds the 85.5% effective LLTV.
    const borrowAmount = (9n * 10n ** 18n) / 10n;
    expect(() =>
      validatePositionHealth({
        positionData: pos,
        additionalCollateral: 0n,
        borrowAmount,
        marketId: marketParams.id,
        lltv,
      }),
    ).toThrow(BorrowExceedsSafeLtvError);
  });

  test("should account for additional collateral in health check", () => {
    const pos = makePosition({
      collateral: 10n ** 18n,
      borrowShares: 0n,
      market: makeMarket({ price: ORACLE_PRICE_SCALE }),
    });
    // 90% of 1e18 exceeds safe LTV without extra collateral…
    const borrowAmount = (9n * 10n ** 18n) / 10n;
    // …but adding 1e18 more collateral makes total 2e18 → 45% LTV, safe.
    expect(() =>
      validatePositionHealth({
        positionData: pos,
        additionalCollateral: 10n ** 18n,
        borrowAmount,
        marketId: marketParams.id,
        lltv,
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateChainId
// ---------------------------------------------------------------------------

describe("validateChainId", () => {
  test("should pass when chain IDs match", () => {
    expect(() => validateChainId(mainnet.id, mainnet.id)).not.toThrow();
  });

  test("should throw ChainIdMismatchError when chain IDs differ", () => {
    expect(() => validateChainId(42161, mainnet.id)).toThrow(
      ChainIdMismatchError,
    );
  });

  test("should throw ChainIdMismatchError when client chain ID is undefined", () => {
    expect(() => validateChainId(undefined, mainnet.id)).toThrow(
      ChainIdMismatchError,
    );
  });
});

// ---------------------------------------------------------------------------
// validateNativeCollateral
// ---------------------------------------------------------------------------

describe("validateNativeCollateral", () => {
  // On mainnet, wNative = WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
  const wNative = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address;
  const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address;

  test("should pass when collateral is wNative", () => {
    expect(() => validateNativeCollateral(mainnet.id, wNative)).not.toThrow();
  });

  test("should throw NativeAmountOnNonWNativeCollateralError when collateral is not wNative", () => {
    expect(() => validateNativeCollateral(mainnet.id, usdc)).toThrow(
      NativeAmountOnNonWNativeCollateralError,
    );
  });
});

// ---------------------------------------------------------------------------
// validatePositionHealthAfterWithdraw
// ---------------------------------------------------------------------------

describe("validatePositionHealthAfterWithdraw", () => {
  const lltv = WethUsdsMarketV1.lltv;

  test("should return immediately when borrowAssets is zero (no debt)", () => {
    // Position with no debt and no price — would throw MissingMarketPriceError
    // if the early return didn't fire.
    const pos = makePosition({
      borrowShares: 0n,
      market: makeMarket({ price: undefined }),
    });
    expect(() =>
      validatePositionHealthAfterWithdraw({
        positionData: pos,
        withdrawAmount: 10n ** 18n,
        lltv,
        marketId: marketParams.id,
      }),
    ).not.toThrow();
  });

  test("should pass when position stays healthy after withdrawal", () => {
    const market = makeMarket({ price: ORACLE_PRICE_SCALE });
    // Borrow shares that translate to a small debt relative to collateral.
    const pos = makePosition({
      collateral: 10n ** 18n,
      borrowShares: 10n ** 17n, // small debt
      market,
    });
    // Withdraw a small amount — position should remain healthy.
    expect(() =>
      validatePositionHealthAfterWithdraw({
        positionData: pos,
        withdrawAmount: 10n ** 14n,
        lltv,
        marketId: marketParams.id,
      }),
    ).not.toThrow();
  });

  test("should throw MissingMarketPriceError when price is undefined and there is debt", () => {
    const market = makeMarket({ price: undefined });
    const pos = makePosition({
      borrowShares: 10n ** 17n,
      market,
    });
    expect(() =>
      validatePositionHealthAfterWithdraw({
        positionData: pos,
        withdrawAmount: 10n ** 14n,
        lltv,
        marketId: marketParams.id,
      }),
    ).toThrow(MissingMarketPriceError);
  });

  test("should throw WithdrawMakesPositionUnhealthyError when unhealthy", () => {
    const market = makeMarket({ price: ORACLE_PRICE_SCALE });
    // Position with significant debt relative to collateral.
    const pos = makePosition({
      collateral: 10n ** 18n,
      borrowShares: (8n * 10n ** 23n) / 10n, // ~80% utilisation
      market,
    });
    // Withdrawing most of the collateral makes position unhealthy.
    expect(() =>
      validatePositionHealthAfterWithdraw({
        positionData: pos,
        withdrawAmount: (9n * 10n ** 17n) / 10n,
        lltv,
        marketId: marketParams.id,
      }),
    ).toThrow(WithdrawMakesPositionUnhealthyError);
  });
});

// ---------------------------------------------------------------------------
// validateRepayAmount
// ---------------------------------------------------------------------------

describe("validateRepayAmount", () => {
  test("should pass when repayAssets does not exceed debt", () => {
    const market = makeMarket({ price: ORACLE_PRICE_SCALE });
    const pos = makePosition({
      borrowShares: 10n ** 18n,
      market,
    });
    expect(() =>
      validateRepayAmount({
        positionData: pos,
        repayAssets: pos.borrowAssets,
        marketId: marketParams.id,
      }),
    ).not.toThrow();
  });

  test("should throw RepayExceedsDebtError when repayAssets exceeds debt", () => {
    const market = makeMarket({ price: ORACLE_PRICE_SCALE });
    const pos = makePosition({
      borrowShares: 10n ** 18n,
      market,
    });
    expect(() =>
      validateRepayAmount({
        positionData: pos,
        repayAssets: pos.borrowAssets + 1n,
        marketId: marketParams.id,
      }),
    ).toThrow(RepayExceedsDebtError);
  });
});

// ---------------------------------------------------------------------------
// validateRepayShares
// ---------------------------------------------------------------------------

describe("validateRepayShares", () => {
  test("should pass when repayShares does not exceed borrowShares", () => {
    const market = makeMarket({ price: ORACLE_PRICE_SCALE });
    const pos = makePosition({
      borrowShares: 10n ** 18n,
      market,
    });
    expect(() =>
      validateRepayShares({
        positionData: pos,
        repayShares: pos.borrowShares,
        marketId: marketParams.id,
      }),
    ).not.toThrow();
  });

  test("should throw RepaySharesExceedDebtError when repayShares exceeds borrowShares", () => {
    const market = makeMarket({ price: ORACLE_PRICE_SCALE });
    const pos = makePosition({
      borrowShares: 10n ** 18n,
      market,
    });
    expect(() =>
      validateRepayShares({
        positionData: pos,
        repayShares: pos.borrowShares + 1n,
        marketId: marketParams.id,
      }),
    ).toThrow(RepaySharesExceedDebtError);
  });
});

// ---------------------------------------------------------------------------
// validateReallocations
// ---------------------------------------------------------------------------

describe("validateReallocations", () => {
  const targetMarketId = marketParams.id;
  const sourceMarketA = new MarketParams(CbbtcUsdcMarketV1);

  const validReallocation: VaultReallocation = {
    vault: USER_A,
    fee: 0n,
    withdrawals: [{ marketParams: sourceMarketA, amount: 10n ** 18n }],
  };

  test("should pass with valid reallocations", () => {
    expect(() =>
      validateReallocations([validReallocation], targetMarketId),
    ).not.toThrow();
  });

  test("should throw NegativeReallocationFeeError when fee is negative", () => {
    expect(() =>
      validateReallocations(
        [{ ...validReallocation, fee: -1n }],
        targetMarketId,
      ),
    ).toThrow(NegativeReallocationFeeError);
  });

  test("should throw EmptyReallocationWithdrawalsError when withdrawals is empty", () => {
    expect(() =>
      validateReallocations(
        [{ ...validReallocation, withdrawals: [] }],
        targetMarketId,
      ),
    ).toThrow(EmptyReallocationWithdrawalsError);
  });

  test("should throw NonPositiveReallocationAmountError when withdrawal amount is zero", () => {
    expect(() =>
      validateReallocations(
        [
          {
            ...validReallocation,
            withdrawals: [{ marketParams: sourceMarketA, amount: 0n }],
          },
        ],
        targetMarketId,
      ),
    ).toThrow(NonPositiveReallocationAmountError);
  });

  test("should throw NonPositiveReallocationAmountError when withdrawal amount is negative", () => {
    expect(() =>
      validateReallocations(
        [
          {
            ...validReallocation,
            withdrawals: [{ marketParams: sourceMarketA, amount: -1n }],
          },
        ],
        targetMarketId,
      ),
    ).toThrow(NonPositiveReallocationAmountError);
  });

  test("should throw ReallocationWithdrawalOnTargetMarketError when withdrawal targets borrow market", () => {
    expect(() =>
      validateReallocations(
        [
          {
            ...validReallocation,
            withdrawals: [{ marketParams, amount: 10n ** 18n }],
          },
        ],
        targetMarketId,
      ),
    ).toThrow(ReallocationWithdrawalOnTargetMarketError);
  });

  test("should throw UnsortedReallocationWithdrawalsError when withdrawals are not ascending", () => {
    // Using the same market twice triggers the <= check (equal IDs).
    expect(() =>
      validateReallocations(
        [
          {
            ...validReallocation,
            withdrawals: [
              { marketParams: sourceMarketA, amount: 10n ** 18n },
              { marketParams: sourceMarketA, amount: 10n ** 18n },
            ],
          },
        ],
        targetMarketId,
      ),
    ).toThrow(UnsortedReallocationWithdrawalsError);
  });
});

// ---------------------------------------------------------------------------
// validateSlippageTolerance
// ---------------------------------------------------------------------------

describe("validateSlippageTolerance", () => {
  test("should pass with zero slippage", () => {
    expect(() => validateSlippageTolerance(0n)).not.toThrow();
  });

  test("should pass with a normal slippage value", () => {
    // 0.3% slippage
    expect(() =>
      validateSlippageTolerance((3n * MathLib.WAD) / 1000n),
    ).not.toThrow();
  });

  test("should pass at the upper boundary (MAX_SLIPPAGE_TOLERANCE)", () => {
    expect(() =>
      validateSlippageTolerance(MAX_SLIPPAGE_TOLERANCE),
    ).not.toThrow();
  });

  test("should throw NegativeSlippageToleranceError when slippage is negative", () => {
    expect(() => validateSlippageTolerance(-1n)).toThrow(
      NegativeSlippageToleranceError,
    );
  });

  test("should throw ExcessiveSlippageToleranceError just above MAX_SLIPPAGE_TOLERANCE", () => {
    expect(() =>
      validateSlippageTolerance(MAX_SLIPPAGE_TOLERANCE + 1n),
    ).toThrow(ExcessiveSlippageToleranceError);
  });
});
