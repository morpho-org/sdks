import { type Market, MathLib } from "@morpho-org/blue-sdk";
import {
  ExcessiveSlippageToleranceError,
  NonPositiveInputError,
  ShareDivideByZeroError,
  VaultV2ForceWithdrawZeroSharePriceError,
} from "../types/index.js";
import { MAX_ABSOLUTE_SHARE_PRICE } from "./constant.js";

/**
 * Computes the minimum borrow share price (in RAY, 1e27) for slippage protection.
 *
 * Mirrors the on-chain check in GeneralAdapter1's `morphoBorrow`:
 * ```solidity
 * require(borrowedAssets.rDivDown(borrowedShares) >= minSharePriceE27)
 * ```
 *
 * @param params - Computation parameters.
 * @param params.borrowAmount - The amount of assets to borrow.
 * @param params.market - The market to compute the minimum borrow share price for.
 * @param params.slippageTolerance - Slippage tolerance in WAD (e.g. 0.003e18 = 0.3%).
 * @returns minSharePriceE27 in RAY scale (1e27).
 */
export function computeMinBorrowSharePrice(params: {
  borrowAmount: bigint;
  market: Market;
  slippageTolerance: bigint;
}): bigint {
  const { borrowAmount, market, slippageTolerance } = params;

  if (slippageTolerance >= MathLib.WAD) {
    throw new ExcessiveSlippageToleranceError(slippageTolerance);
  }

  const expectedShares = market.toBorrowShares(borrowAmount, "Up");

  if (expectedShares === 0n) {
    throw new ShareDivideByZeroError(market.params.id);
  }

  return MathLib.mulDivDown(
    borrowAmount,
    MathLib.wToRay(MathLib.WAD - slippageTolerance),
    expectedShares,
  );
}

/**
 * Computes the maximum repay share price (in RAY, 1e27) for slippage protection.
 *
 * Supports both repay-by-assets and repay-by-shares paths:
 * - By assets: derives expected shares from the repay amount via `toBorrowShares("Down")`.
 * - By shares: derives expected assets from the shares via `toBorrowAssets("Up")`.
 *
 * Direction is opposite of borrow's `minSharePrice`:
 * - Borrow uses `(WAD - slippage)` → lower bound (protects borrower from getting fewer assets per share).
 * - Repay uses `(WAD + slippage)` → upper bound (protects repayer from paying too many assets per share).
 *
 * Capped at {@link MAX_ABSOLUTE_SHARE_PRICE} to prevent absurd values.
 *
 * @param params - Computation parameters.
 * @param params.repayAssets - The amount of assets to repay (0n when repaying by shares).
 * @param params.repayShares - The amount of shares to repay (0n when repaying by assets).
 * @param params.market - The market to compute the maximum repay share price for.
 * @param params.slippageTolerance - Slippage tolerance in WAD (e.g. 0.003e18 = 0.3%).
 * @returns maxSharePriceE27 in RAY scale (1e27).
 */
export function computeMaxRepaySharePrice(params: {
  repayAssets: bigint;
  repayShares: bigint;
  market: Market;
  slippageTolerance: bigint;
}): bigint {
  const { repayAssets, repayShares, market, slippageTolerance } = params;

  if (slippageTolerance >= MathLib.WAD) {
    throw new ExcessiveSlippageToleranceError(slippageTolerance);
  }

  let assets: bigint;
  let shares: bigint;

  if (repayShares > 0n) {
    assets = market.toBorrowAssets(repayShares, "Up");
    shares = repayShares;
  } else {
    assets = repayAssets;
    shares = market.toBorrowShares(repayAssets, "Down");
  }

  if (shares === 0n) {
    throw new ShareDivideByZeroError(market.params.id);
  }

  const maxSharePrice = MathLib.mulDivUp(
    assets,
    MathLib.wToRay(MathLib.WAD + slippageTolerance),
    shares,
  );

  return MathLib.min(maxSharePrice, MAX_ABSOLUTE_SHARE_PRICE);
}

/**
 * Computes the maximum supply share price (in RAY, 1e27) for slippage protection.
 *
 * Mirrors the on-chain check in GeneralAdapter1's `morphoSupply`:
 * ```solidity
 * require(suppliedAssets.rDivUp(suppliedShares) <= maxSharePriceE27)
 * ```
 *
 * Caps at {@link MAX_ABSOLUTE_SHARE_PRICE} to prevent absurd values on extreme markets.
 *
 * @param params - Computation parameters.
 * @param params.supplyAssets - The amount of loan assets to supply.
 * @param params.market - The market to compute the maximum supply share price for.
 * @param params.slippageTolerance - Slippage tolerance in WAD (e.g. `0.003e18` = 0.3%).
 * @returns `maxSharePriceE27` in RAY scale (1e27).
 * @throws {ExcessiveSlippageToleranceError} when `slippageTolerance >= WAD`.
 * @throws {ShareDivideByZeroError} when expected shares round down to zero.
 */
export function computeMaxSupplySharePrice(params: {
  supplyAssets: bigint;
  market: Market;
  slippageTolerance: bigint;
}): bigint {
  const { supplyAssets, market, slippageTolerance } = params;

  if (slippageTolerance >= MathLib.WAD) {
    throw new ExcessiveSlippageToleranceError(slippageTolerance);
  }

  const expectedShares = market.toSupplyShares(supplyAssets, "Down");

  if (expectedShares === 0n) {
    throw new ShareDivideByZeroError(market.params.id);
  }

  const maxSharePrice = MathLib.mulDivUp(
    supplyAssets,
    MathLib.wToRay(MathLib.WAD + slippageTolerance),
    expectedShares,
  );

  return MathLib.min(maxSharePrice, MAX_ABSOLUTE_SHARE_PRICE);
}

/**
 * Computes the minimum Vault V2 force-withdraw share price (in RAY, 1e27) for slippage protection.
 *
 * Mirrors the on-chain check in `VaultExitBundlesV1.vaultExitBundlesV1ForceWithdrawVaultV2`:
 * ```solidity
 * require(totalSharesBurnt == 0 || withdrawn.mulDivDown(1e27, totalSharesBurnt) >= minSharePriceE27)
 * ```
 *
 * The realized price sits structurally *below* the vault's share price because the
 * force-deallocation penalty is debited from the position but never withdrawn, so a bound derived
 * from the raw share price would reject every penalised exit. Both inputs are therefore taken from
 * the same plan: `withdrawnAssets` (a lower bound of what the contract pays out) over
 * `sharesBurnt` (an upper bound of what it burns). The result is conservative on both sides, so a
 * faithful snapshot never trips the check while a real price drop, a penalty increase, or liquidity
 * shifting from the penalty-free leg to the penalised leg all do.
 *
 * The referral fee is deducted *after* this check, so it is outside the bound's protection.
 *
 * @param params - Computation parameters.
 * @param params.withdrawnAssets - Assets the contract withdraws in total, before the referral fee.
 * @param params.sharesBurnt - Upper bound of the vault shares the exit burns.
 * @param params.slippageTolerance - Slippage tolerance in WAD (e.g. `0.003e18` = 0.3%).
 * @returns `minSharePriceE27` in RAY scale (1e27).
 * @throws {ExcessiveSlippageToleranceError} when `slippageTolerance >= WAD`.
 * @throws {NonPositiveInputError} when `sharesBurnt` or `withdrawnAssets` is not positive, which
 *   would silently nullify the on-chain bound.
 * @throws {VaultV2ForceWithdrawZeroSharePriceError} when the ratio itself rounds down to zero, which
 *   would nullify the bound just as a non-positive input would.
 * @example
 * ```ts
 * import { computeMinForceWithdrawSharePrice } from "@morpho-org/morpho-sdk";
 *
 * const minSharePriceE27 = computeMinForceWithdrawSharePrice({
 *   withdrawnAssets: plan.withdrawnAssets,
 *   sharesBurnt,
 *   slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
 * });
 * ```
 */
export function computeMinForceWithdrawSharePrice(params: {
  readonly withdrawnAssets: bigint;
  readonly sharesBurnt: bigint;
  readonly slippageTolerance: bigint;
}): bigint {
  const { withdrawnAssets, sharesBurnt, slippageTolerance } = params;

  if (slippageTolerance >= MathLib.WAD) {
    throw new ExcessiveSlippageToleranceError(slippageTolerance);
  }
  // A zero on either side would yield `minSharePriceE27 = 0`, i.e. no bound at all.
  if (withdrawnAssets <= 0n) {
    throw new NonPositiveInputError("withdrawnAssets", withdrawnAssets);
  }
  if (sharesBurnt <= 0n) {
    throw new NonPositiveInputError("sharesBurnt", sharesBurnt);
  }

  const minSharePriceE27 = MathLib.mulDivDown(
    withdrawnAssets,
    MathLib.wToRay(MathLib.WAD - slippageTolerance),
    sharesBurnt,
  );
  // Positive inputs are not enough: the ratio itself can round down to zero once the burn exceeds
  // what the withdrawn assets can price at RAY scale, which would reintroduce the very opt-out the
  // guards above exist to prevent.
  if (minSharePriceE27 === 0n) {
    throw new VaultV2ForceWithdrawZeroSharePriceError({
      withdrawnAssets,
      sharesBurnt,
      slippageTolerance,
    });
  }

  return minSharePriceE27;
}

/**
 * Computes the minimum withdraw share price (in RAY, 1e27) for slippage protection.
 *
 * Mirrors the on-chain check in GeneralAdapter1's `morphoWithdraw`:
 * ```solidity
 * require(withdrawnAssets.rDivDown(withdrawnShares) >= minSharePriceE27)
 * ```
 *
 * Supports both assets and shares modes:
 * - By assets: derives expected shares via `toSupplyShares("Up")` (upper bound, protects the
 *   withdrawer against over-burning shares).
 * - By shares: derives expected assets via `toSupplyAssets("Down")` (lower bound, the on-chain
 *   amount paid out).
 *
 * Direction is opposite of supply's `maxSharePrice`:
 * - Supply uses `(WAD + slippage)` → upper bound (anti-inflation).
 * - Withdraw uses `(WAD − slippage)` → lower bound (protects withdrawer from receiving too few
 *   assets per share burned).
 *
 * @param params - Computation parameters.
 * @param params.withdrawAssets - The amount of assets to withdraw (`0n` when withdrawing by shares).
 * @param params.withdrawShares - The amount of shares to withdraw (`0n` when withdrawing by assets).
 * @param params.market - The market to compute the minimum withdraw share price for.
 * @param params.slippageTolerance - Slippage tolerance in WAD (e.g. `0.003e18` = 0.3%).
 * @returns `minSharePriceE27` in RAY scale (1e27).
 * @throws {ExcessiveSlippageToleranceError} when `slippageTolerance >= WAD`.
 * @throws {ShareDivideByZeroError} when expected shares round down to zero.
 */
export function computeMinWithdrawSharePrice(params: {
  withdrawAssets: bigint;
  withdrawShares: bigint;
  market: Market;
  slippageTolerance: bigint;
}): bigint {
  const { withdrawAssets, withdrawShares, market, slippageTolerance } = params;

  if (slippageTolerance >= MathLib.WAD) {
    throw new ExcessiveSlippageToleranceError(slippageTolerance);
  }

  let assets: bigint;
  let shares: bigint;

  if (withdrawShares > 0n) {
    assets = market.toSupplyAssets(withdrawShares, "Down");
    shares = withdrawShares;
  } else {
    assets = withdrawAssets;
    shares = market.toSupplyShares(withdrawAssets, "Up");
  }

  // Dust shares can round to `assets === 0n` here, which would make
  // `minSharePriceE27 = 0` and silently nullify the on-chain slippage cap.
  if (shares === 0n || assets === 0n) {
    throw new ShareDivideByZeroError(market.params.id);
  }

  return MathLib.mulDivDown(
    assets,
    MathLib.wToRay(MathLib.WAD - slippageTolerance),
    shares,
  );
}
