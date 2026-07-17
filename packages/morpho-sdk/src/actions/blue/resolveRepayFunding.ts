import type { MarketId } from "@morpho-org/blue-sdk";
import {
  MutuallyExclusiveRepayAmountsError,
  NegativeInputError,
  NonPositiveInputError,
  TransferAmountNotEqualToAssetsError,
} from "../../types/index.js";

/**
 * Pre-resolved repay amounts (plus `maxSharePrice`) validated by {@link resolveRepayFunding}.
 *
 * These are the fields the entity layer (`MorphoBlue.repay` / `repayWithdrawCollateral`) resolves
 * from live market/position state before either repay builder assembles the bundle.
 *
 * @internal
 */
export interface RepayFundingInput {
  /** (assets mode) ERC-20 loan tokens pulled from the payer. */
  readonly amount: bigint;
  /** (shares mode) Borrow shares to repay. Discriminates the mode when `> 0n`. */
  readonly shares: bigint;
  /** Native ETH wrapped into wNative to help fund the repay. */
  readonly nativeAmount: bigint;
  /** Loan tokens routed into `GeneralAdapter1` (see `RepayActionAmountArgs`). */
  readonly transferAmount: bigint;
  /** Maximum acceptable repay share price (in ray). */
  readonly maxSharePrice: bigint;
}

/**
 * Derived repay funding values consumed by the repay builders.
 *
 * @internal
 */
export interface RepayFunding {
  /** `true` when repaying an exact share count (full close); `false` in assets mode. */
  readonly isSharesMode: boolean;
  /** Assets passed to `morphoRepay` (`transferAmount` in assets mode, `0n` in shares mode). */
  readonly repayAssets: bigint;
  /** Shares passed to `morphoRepay` (`shares` in shares mode, `0n` in assets mode). */
  readonly repayShares: bigint;
  /** ERC-20 loan tokens pulled into `GeneralAdapter1` (net of any wrapped native). */
  readonly erc20Amount: bigint;
}

/**
 * Resolves and validates the repay funding envelope shared by `blueRepay` and
 * `blueRepayWithdrawCollateral`.
 *
 * Encode-only and synchronous — reads no on-chain state and does no amount arithmetic beyond
 * deriving the bundle values from the pre-resolved args (the entity layer resolves the amounts
 * upstream). Runs the shared mode/amount guards, discriminates assets vs shares mode on
 * `shares > 0n`, then validates the funding so the assembled bundle neither strands over-pulled
 * tokens nor under-funds the repay:
 *
 * - **assets mode** (`shares` `0n`): repays `transferAmount` (`= amount + nativeAmount`, additive
 *   like `blueSupply`); ERC-20 pulled = `amount`.
 * - **shares mode** (`shares > 0n`): repays exact `shares`; ERC-20 pulled = `transferAmount` (already
 *   net of native).
 *
 * Single source of truth for the funding math both repay builders depend on — a correctness fix here
 * applies to both paths instead of risking a silent divergence between two copies.
 *
 * @param input - The pre-resolved repay amounts plus the repay `maxSharePrice`.
 * @param marketId - Market id used to tag the thrown errors.
 * @returns `{ isSharesMode, repayAssets, repayShares, erc20Amount }` — the mode discriminator and the
 *   amounts the repay builders assemble the bundle from.
 * @throws {NonPositiveInputError} when `maxSharePrice <= 0n` or total repay funding is zero.
 * @throws {NegativeInputError} when `amount`, `shares`, `nativeAmount`, or `transferAmount` is negative.
 * @throws {MutuallyExclusiveRepayAmountsError} when both `amount` and `shares` are `> 0n`.
 * @throws {TransferAmountNotEqualToAssetsError} when in assets mode and
 *   `transferAmount !== amount + nativeAmount`.
 * @internal
 */
export const resolveRepayFunding = (
  {
    amount,
    shares,
    nativeAmount,
    transferAmount,
    maxSharePrice,
  }: RepayFundingInput,
  marketId: MarketId,
): RepayFunding => {
  if (maxSharePrice <= 0n) {
    throw new NonPositiveInputError("maxSharePrice", maxSharePrice);
  }
  if (nativeAmount < 0n) {
    throw new NegativeInputError("nativeAmount", nativeAmount);
  }
  if (amount < 0n) {
    throw new NegativeInputError("amount", amount);
  }
  if (shares < 0n) {
    throw new NegativeInputError("shares", shares);
  }
  if (amount > 0n && shares > 0n) {
    throw new MutuallyExclusiveRepayAmountsError(marketId);
  }

  // Shares mode repays an exact share count and pulls `transferAmount` ERC-20
  // (already net of native), skimming the residual. Assets mode repays
  // `transferAmount` (= amount + native, additive) and pulls `amount`.
  const isSharesMode = shares > 0n;
  const repayAssets = isSharesMode ? 0n : transferAmount;
  const repayShares = shares;
  const erc20Amount = isSharesMode ? transferAmount : amount;

  // Validate the pre-resolved funding. Assets mode is additive like `blueSupply`:
  // the ERC-20 pulled (`amount`) plus the wrapped `nativeAmount` must equal the
  // assets repaid, and the total must be positive — so the adapter neither strands
  // over-pulled tokens nor under-funds the repay. Shares mode pulls `transferAmount`
  // ERC-20 (0 on a fully-native repay) and wraps `nativeAmount`; the bundle must
  // fund the repay with a non-negative transfer and a positive total.
  if (isSharesMode) {
    if (transferAmount < 0n) {
      throw new NegativeInputError("transferAmount", transferAmount);
    }
    if (transferAmount + nativeAmount <= 0n) {
      throw new NonPositiveInputError(
        "transferAmount + nativeAmount",
        transferAmount + nativeAmount,
      );
    }
  } else {
    if (transferAmount !== amount + nativeAmount) {
      throw new TransferAmountNotEqualToAssetsError({
        transferAmount,
        assets: amount + nativeAmount,
        market: marketId,
      });
    }
    if (repayAssets <= 0n) {
      throw new NonPositiveInputError("amount + nativeAmount", repayAssets);
    }
  }

  return { isSharesMode, repayAssets, repayShares, erc20Amount };
};
