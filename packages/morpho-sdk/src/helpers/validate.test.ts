import {
  AccrualPosition,
  ChainId,
  Market,
  type MarketId,
  MarketParams,
  MathLib,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { CbbtcUsdcBlue, WethUsdsBlue } from "../../test/fixtures/blue.js";
import {
  midnightChainId,
  midnightMarket,
} from "../../test/fixtures/midnight.js";
import {
  AccrualPositionUserMismatchError,
  AddressMismatchError,
  BorrowExceedsSafeLtvError,
  ChainIdMismatchError,
  ChainWNativeMissingError,
  EmptyReallocationWithdrawalsError,
  ExcessiveSlippageToleranceError,
  MarketIdMismatchError,
  MissingClientPropertyError,
  MissingMarketPriceError,
  NativeAmountOnNonWNativeAssetError,
  NegativeInputError,
  NonPositiveInputError,
  ReallocationWithdrawalOnTargetMarketError,
  RepayExceedsDebtError,
  RepaySharesExceedDebtError,
  UnsortedReallocationWithdrawalsError,
  type VaultReallocation,
  WithdrawExceedsCollateralError,
  WithdrawExceedsSupplyError,
  WithdrawMakesPositionUnhealthyError,
  WithdrawSharesExceedSupplyError,
} from "../types/index.js";
import { MAX_SLIPPAGE_TOLERANCE } from "./constant.js";
import {
  validateAccrualPosition,
  validateChainId,
  validateMidnightMarketChainId,
  validateNativeAsset,
  validatePositionHealth,
  validatePositionHealthAfterWithdraw,
  validateReallocations,
  validateRepayAmount,
  validateRepayShares,
  validateSlippageTolerance,
  validateUserAddress,
  validateWithdrawAmount,
  validateWithdrawShares,
} from "./validate.js";

const USER_A: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const USER_B: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

// ---------------------------------------------------------------------------
// validateUserAddress (deprecated, kept for backwards compatibility)
// ---------------------------------------------------------------------------

describe("validateUserAddress", () => {
  test("should pass when addresses match", () => {
    expect(() => validateUserAddress(USER_A, USER_A)).not.toThrow();
  });

  test("should throw MissingClientPropertyError when clientAccountAddress is undefined", () => {
    expect(() => validateUserAddress(undefined, USER_A)).toThrow(
      MissingClientPropertyError,
    );
    expect(() => validateUserAddress(undefined, USER_A)).toThrow(/account/);
  });

  test("should throw AddressMismatchError when addresses differ", () => {
    expect(() => validateUserAddress(USER_A, USER_B)).toThrow(
      AddressMismatchError,
    );
  });
});

const marketParams = new MarketParams(WethUsdsBlue);

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
    const otherMarketId = new MarketParams(CbbtcUsdcBlue).id;
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
  const lltv = WethUsdsBlue.lltv; // 86%

  test("should pass when borrow is within safe LTV", () => {
    const pos = makePosition({
      collateral: 10n ** 18n,
      borrowShares: 0n,
      market: makeMarket({ price: ORACLE_PRICE_SCALE }),
    });
    // With 1:1 price and 86% LLTV, borrowing ~8% of collateral is well within range.
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
    // With 1:1 price, borrowing 90% of collateral exceeds the 86% LLTV.
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

  test("should allow borrowing up to just under LLTV (no 0.5% safety buffer)", () => {
    const collateral = 10n ** 18n;
    const pos = makePosition({
      collateral,
      borrowShares: 0n,
      market: makeMarket({ price: ORACLE_PRICE_SCALE }),
    });
    // 1:1 price ⇒ collateral value == collateral, so maxBorrow = wMulDown(collateral, lltv)
    // is the on-chain liquidation boundary. maxBorrow - 1 is the largest passing amount: it
    // sits inside the old 0.5% buffer band (which used to throw), and with the +1 rounding guard
    // the resulting debt lands at exactly maxBorrow - healthy (inclusive).
    const maxBorrow = MathLib.wMulDown(collateral, lltv);
    expect(() =>
      validatePositionHealth({
        positionData: pos,
        additionalCollateral: 0n,
        borrowAmount: maxBorrow - 1n,
        marketId: marketParams.id,
        lltv,
      }),
    ).not.toThrow();
  });

  test("should still throw when the borrow would reach LLTV (strict +1n guard)", () => {
    const collateral = 10n ** 18n;
    const pos = makePosition({
      collateral,
      borrowShares: 0n,
      market: makeMarket({ price: ORACLE_PRICE_SCALE }),
    });
    // Requesting the full boundary trips the +1n guard: the rounded on-chain debt could
    // exceed maxBorrow (liquidatable), so it is rejected - never built above the LLTV.
    const maxBorrow = MathLib.wMulDown(collateral, lltv);
    expect(() =>
      validatePositionHealth({
        positionData: pos,
        additionalCollateral: 0n,
        borrowAmount: maxBorrow,
        marketId: marketParams.id,
        lltv,
      }),
    ).toThrow(BorrowExceedsSafeLtvError);
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

describe("validateMidnightMarketChainId", () => {
  test("default: accepts raw market params on the expected chain", () => {
    expect(() =>
      validateMidnightMarketChainId(midnightMarket, midnightChainId),
    ).not.toThrow();
  });

  test("behavior: accepts hydrated market state on the expected chain", () => {
    expect(() =>
      validateMidnightMarketChainId(
        {
          params: midnightMarket,
          totalUnits: 1_000n,
          lossFactor: 0n,
          withdrawable: 500n,
          continuousFeeCredit: 0n,
          settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
          continuousFee: 0,
          tickSpacing: 4,
        },
        midnightChainId,
      ),
    ).not.toThrow();
  });

  test("error: ChainIdMismatchError", () => {
    expect(() =>
      validateMidnightMarketChainId(
        { ...midnightMarket, chainId: BigInt(midnightChainId + 1) },
        midnightChainId,
      ),
    ).toThrow(ChainIdMismatchError);
  });
});

// ---------------------------------------------------------------------------
// validateNativeAsset
// ---------------------------------------------------------------------------

describe("validateNativeAsset", () => {
  // On mainnet, wNative = WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
  const wNative = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address;
  const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address;

  test("should pass when asset is wNative", () => {
    expect(() => validateNativeAsset(mainnet.id, wNative)).not.toThrow();
  });

  test("should throw NativeAmountOnNonWNativeAssetError when asset is not wNative", () => {
    expect(() => validateNativeAsset(mainnet.id, usdc)).toThrow(
      NativeAmountOnNonWNativeAssetError,
    );
  });

  test("should throw ChainWNativeMissingError when the chain has no wNative", () => {
    expect(() => validateNativeAsset(ChainId.CeloMainnet, usdc)).toThrow(
      ChainWNativeMissingError,
    );
  });
});

// ---------------------------------------------------------------------------
// validatePositionHealthAfterWithdraw
// ---------------------------------------------------------------------------

describe("validatePositionHealthAfterWithdraw", () => {
  const lltv = WethUsdsBlue.lltv;

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

  test("should throw MarketIdMismatchError when the position market differs", () => {
    const pos = makePosition();
    const otherMarketId = new MarketParams(CbbtcUsdcBlue).id;

    expect(() =>
      validatePositionHealthAfterWithdraw({
        positionData: pos,
        withdrawAmount: 1n,
        lltv,
        marketId: otherMarketId,
      }),
    ).toThrow(MarketIdMismatchError);
  });

  test("should throw WithdrawExceedsCollateralError when withdrawal exceeds collateral", () => {
    const pos = makePosition({ collateral: 1n });

    expect(() =>
      validatePositionHealthAfterWithdraw({
        positionData: pos,
        withdrawAmount: 2n,
        lltv,
        marketId: marketParams.id,
      }),
    ).toThrow(WithdrawExceedsCollateralError);
  });

  test("should allow a withdrawal that leaves the position just under LLTV (no buffer)", () => {
    const collateral = 10n ** 18n;
    const market = makeMarket({ price: ORACLE_PRICE_SCALE });
    const pos = makePosition({ collateral, borrowShares: 10n ** 17n, market });
    const debt = pos.borrowAssets;
    // Keep just enough collateral to stay strictly healthy at the true LLTV
    // (1 wei above the exact boundary). This sits inside the old 0.5% buffer band,
    // which used to throw, and must now pass.
    const minCollateralAfter = MathLib.wDivUp(debt, lltv) + 1n;
    const withdrawAmount = collateral - minCollateralAfter;
    expect(() =>
      validatePositionHealthAfterWithdraw({
        positionData: pos,
        withdrawAmount,
        lltv,
        marketId: marketParams.id,
      }),
    ).not.toThrow();
  });

  test("is inclusive at the LLTV boundary (exactly at LLTV passes, one wei above throws)", () => {
    // 1:1 price + 50% LLTV ⇒ maxBorrow = collateralAfter / 2. Size collateralAfter so the
    // unchanged debt lands exactly on the boundary: exactly at LLTV is healthy (inclusive),
    // mirroring the borrow path.
    const halfLltv = MathLib.WAD / 2n;
    const collateral = 10n ** 18n;
    const market = makeMarket({ price: ORACLE_PRICE_SCALE });
    const pos = makePosition({ collateral, borrowShares: 10n ** 17n, market });
    const debt = pos.borrowAssets;

    // collateralAfter = 2·debt ⇒ maxBorrow == debt ⇒ position exactly at LLTV → allowed.
    expect(() =>
      validatePositionHealthAfterWithdraw({
        positionData: pos,
        withdrawAmount: collateral - 2n * debt,
        lltv: halfLltv,
        marketId: marketParams.id,
      }),
    ).not.toThrow();

    // One wei less collateral ⇒ maxBorrow == debt − 1 ⇒ debt exceeds it → throws.
    expect(() =>
      validatePositionHealthAfterWithdraw({
        positionData: pos,
        withdrawAmount: collateral - (2n * debt - 1n),
        lltv: halfLltv,
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
  const sourceMarketA = new MarketParams(CbbtcUsdcBlue);
  const marketParamsWithId = (id: MarketId) => ({
    ...sourceMarketA,
    id,
  });

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

  test("should throw NegativeInputError when fee is negative", () => {
    expect(() =>
      validateReallocations(
        [{ ...validReallocation, fee: -1n }],
        targetMarketId,
      ),
    ).toThrow(NegativeInputError);
  });

  test("should throw EmptyReallocationWithdrawalsError when withdrawals is empty", () => {
    expect(() =>
      validateReallocations(
        [{ ...validReallocation, withdrawals: [] }],
        targetMarketId,
      ),
    ).toThrow(EmptyReallocationWithdrawalsError);
  });

  test("should throw NonPositiveInputError when withdrawal amount is zero", () => {
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
    ).toThrow(NonPositiveInputError);
  });

  test("should throw NonPositiveInputError when withdrawal amount is negative", () => {
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
    ).toThrow(NonPositiveInputError);
  });

  test("should throw ReallocationWithdrawalOnTargetMarketError when withdrawal targets the target market", () => {
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

  test("should accept mixed-case withdrawal ids when normalized order is ascending", () => {
    const mixedSourceA = `0x${"a".repeat(64)}` as MarketId;
    const mixedSourceB = `0x${"B".repeat(64)}` as MarketId;

    expect(() =>
      validateReallocations(
        [
          {
            ...validReallocation,
            withdrawals: [
              { marketParams: marketParamsWithId(mixedSourceA), amount: 1n },
              { marketParams: marketParamsWithId(mixedSourceB), amount: 1n },
            ],
          },
        ],
        targetMarketId,
      ),
    ).not.toThrow();
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

  test("should throw NegativeInputError when slippage is negative", () => {
    expect(() => validateSlippageTolerance(-1n)).toThrow(NegativeInputError);
  });

  test("should throw ExcessiveSlippageToleranceError just above MAX_SLIPPAGE_TOLERANCE", () => {
    expect(() =>
      validateSlippageTolerance(MAX_SLIPPAGE_TOLERANCE + 1n),
    ).toThrow(ExcessiveSlippageToleranceError);
  });
});

// ---------------------------------------------------------------------------
// validateWithdrawAmount / validateWithdrawShares
// ---------------------------------------------------------------------------

describe("validateWithdrawAmount", () => {
  test("should pass when withdraw assets are within supplied assets", () => {
    const m = makeMarket({ price: ORACLE_PRICE_SCALE });
    const pos = new AccrualPosition(
      {
        user: USER_A,
        supplyShares: 10n ** 24n,
        borrowShares: 0n,
        collateral: 0n,
      },
      m,
    );
    expect(() =>
      validateWithdrawAmount({
        positionData: pos,
        withdrawAssets: 10n ** 18n,
        marketId: marketParams.id,
      }),
    ).not.toThrow();
  });

  test("should throw WithdrawExceedsSupplyError when withdraw assets exceed supplied assets", () => {
    const m = makeMarket({ price: ORACLE_PRICE_SCALE });
    const pos = new AccrualPosition(
      {
        user: USER_A,
        supplyShares: 10n ** 18n,
        borrowShares: 0n,
        collateral: 0n,
      },
      m,
    );
    expect(() =>
      validateWithdrawAmount({
        positionData: pos,
        withdrawAssets: 10n ** 30n,
        marketId: marketParams.id,
      }),
    ).toThrow(WithdrawExceedsSupplyError);
  });
});

describe("validateWithdrawShares", () => {
  test("should pass when withdraw shares are within owned supply shares", () => {
    const m = makeMarket({ price: ORACLE_PRICE_SCALE });
    const pos = new AccrualPosition(
      {
        user: USER_A,
        supplyShares: 10n ** 24n,
        borrowShares: 0n,
        collateral: 0n,
      },
      m,
    );
    expect(() =>
      validateWithdrawShares({
        positionData: pos,
        withdrawShares: 10n ** 18n,
        marketId: marketParams.id,
      }),
    ).not.toThrow();
  });

  test("should throw WithdrawSharesExceedSupplyError when withdraw shares exceed owned supply shares", () => {
    const m = makeMarket({ price: ORACLE_PRICE_SCALE });
    const pos = new AccrualPosition(
      {
        user: USER_A,
        supplyShares: 10n ** 18n,
        borrowShares: 0n,
        collateral: 0n,
      },
      m,
    );
    expect(() =>
      validateWithdrawShares({
        positionData: pos,
        withdrawShares: 10n ** 30n,
        marketId: marketParams.id,
      }),
    ).toThrow(WithdrawSharesExceedSupplyError);
  });
});
