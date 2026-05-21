import { type MarketId, UnknownDataError } from "@morpho-org/blue-sdk";
import type { Address } from "viem";

/**
 * Typed errors thrown while encoding supported Bundler3 actions.
 *
 * @remarks
 * Import these classes through `@morpho-org/morpho-sdk` when handling
 * failures from `BundlerAction`.
 */
export namespace BundlerErrors {
  /**
   * Thrown when an action that requires an offchain signature is encoded before
   * the signature has been attached.
   *
   * @example
   * ```ts
   * import { BundlerErrors } from "@morpho-org/morpho-sdk";
   *
   * if (error instanceof BundlerErrors.MissingSignature) {
   *   // Attach the missing permit or Permit2 signature, then encode again.
   * }
   * ```
   */
  export class MissingSignature extends Error {
    constructor() {
      super("missing signature");
    }
  }

  /**
   * Thrown when an action is unsupported on the requested chain.
   *
   * @example
   * ```ts
   * import { BundlerErrors } from "@morpho-org/morpho-sdk";
   *
   * if (error instanceof BundlerErrors.UnexpectedAction) {
   *   // Remove or replace the action for the selected chain.
   * }
   * ```
   */
  export class UnexpectedAction extends Error {
    /**
     * @param type - Unsupported Bundler3 action discriminator or name.
     * @param chainId - Chain where the action was requested.
     */
    constructor(type: string, chainId: number) {
      super(`unexpected action "${type}" on chain "${chainId}"`);
    }
  }
}

/** Thrown when an asset amount is required to be positive but is zero or negative. */
export class NonPositiveAssetAmountError extends Error {
  constructor(origin: Address) {
    super(`Asset amount must be positive for address ${origin}`);
  }
}

/** Thrown when a shares amount is required to be positive but is zero or negative. */
export class NonPositiveSharesAmountError extends Error {
  constructor(vault: Address) {
    super(`Shares amount must be positive for address: ${vault}`);
  }
}

/** Thrown when a vault deposit's `maxSharePrice` slippage bound is zero or negative. */
export class NonPositiveMaxSharePriceError extends Error {
  constructor(vault: Address) {
    super(`Max share price must be positive for vault: ${vault}`);
  }
}

/** Thrown when a viem client's account address does not match the address required by the call. */
export class AddressMismatchError extends Error {
  constructor(clientAddress: Address, argsAddress: Address) {
    super(
      `Address mismatch between client: ${clientAddress} and args: ${argsAddress}`,
    );
  }
}

/** Thrown when a viem client's chain id does not match the chain id required by the call. */
export class ChainIdMismatchError extends Error {
  constructor(clientChainId: number | undefined, argsChainId: number) {
    super(
      `Chain ID mismatch between client: ${clientChainId} and args: ${argsChainId}`,
    );
  }
}

/** Thrown when the viem client is missing a property the call requires (e.g. `account.address`). */
export class MissingClientPropertyError extends Error {
  constructor(property: string) {
    super(`A required ${property} is missing from the client.`);
  }
}

/** Thrown when an approval amount is smaller than the spend amount it must cover. */
export class ApprovalAmountLessThanSpendAmountError extends Error {
  constructor() {
    super("Approval amount is less than spend amount");
  }
}

/** Thrown when a slippage tolerance is negative. */
export class NegativeSlippageToleranceError extends Error {
  constructor(slippageTolerance: bigint) {
    super(`Slippage tolerance ${slippageTolerance} must not be negative`);
  }
}

/** Thrown when a Morpho accrual position is missing for a market the call needs to read. */
export class MissingAccrualPositionError extends Error {
  constructor(market: string) {
    super(`Accrual position is missing for market: ${market}`);
  }
}

/** Thrown when a slippage tolerance exceeds `MAX_SLIPPAGE_TOLERANCE` (10%). */
export class ExcessiveSlippageToleranceError extends Error {
  constructor(slippageTolerance: bigint) {
    super(
      `Slippage tolerance ${slippageTolerance} exceeds maximum allowed (10%)`,
    );
  }
}

/** Thrown when a VaultV2 force-withdraw or force-redeem call has no deallocations to perform. */
export class EmptyDeallocationsError extends Error {
  constructor(vault: Address) {
    super(`Deallocations list cannot be empty for vault: ${vault}`);
  }
}

/** Thrown when a deposit's amount differs from the amount the supplied permit / permit2 signature was issued for. */
export class DepositAmountMismatchError extends Error {
  constructor(depositAmount: bigint, signatureAmount: bigint) {
    super(
      `Deposit amount ${depositAmount} does not match requirement signature amount ${signatureAmount}`,
    );
  }
}

/** Thrown when a deposit's asset differs from the asset the supplied permit / permit2 signature was issued for. */
export class DepositAssetMismatchError extends Error {
  constructor(depositAsset: Address, signatureAsset: Address) {
    super(
      `Deposit asset ${depositAsset} does not match requirement signature asset ${signatureAsset}`,
    );
  }
}

/** Thrown when a `permit2` requirement signature is missing the `expiration` field. */
export class Permit2ExpirationMissingError extends Error {
  constructor() {
    super(
      'Requirement signature with action.type === "permit2" must include args.expiration. Re-sign using the permit2 flow.',
    );
  }
}

/** Thrown when a vault deposit uses `nativeAmount` but the vault asset is not the chain's wNative. */
export class NativeAmountOnNonWNativeVaultError extends Error {
  constructor(vaultAsset: Address, wNative: Address) {
    super(
      `Cannot use nativeAmount: vault asset ${vaultAsset} is not the wrapped native token ${wNative}`,
    );
  }
}

/** Thrown when a `nativeAmount` is supplied but the chain has no configured wNative address. */
export class ChainWNativeMissingError extends Error {
  constructor(chainId: number) {
    super(
      `Chain ${chainId} does not have a configured wrapped native token (wNative)`,
    );
  }
}

/** Thrown when `nativeAmount` is negative. */
export class NegativeNativeAmountError extends Error {
  constructor(nativeAmount: bigint) {
    super(`Native amount must not be negative, got ${nativeAmount}`);
  }
}

/** Thrown when both `amount` and `nativeAmount` resolve to zero on a vault deposit. */
export class ZeroDepositAmountError extends Error {
  constructor(vault: Address) {
    super(
      `Total deposit amount must be positive for vault: ${vault}. Both amount and nativeAmount are zero.`,
    );
  }
}

/** Thrown when a vault entity's address does not match the vault address embedded in the call's args. */
export class VaultAddressMismatchError extends Error {
  constructor(vaultAddress: Address, argsVaultAddress: Address) {
    super(
      `Vault address mismatch between vault: ${vaultAddress} and args: ${argsVaultAddress}`,
    );
  }
}

/** Thrown when a market borrow amount is zero or negative. */
export class NonPositiveBorrowAmountError extends Error {
  constructor(market: string) {
    super(`Borrow amount must be positive for market: ${market}`);
  }
}

/** Thrown when both `amount` and `nativeAmount` resolve to zero on a market collateral supply. */
export class ZeroCollateralAmountError extends Error {
  constructor(market: string) {
    super(
      `Total collateral amount must be positive for market: ${market}. Both amount and nativeAmount are zero.`,
    );
  }
}

/** Thrown when a collateral supply uses `nativeAmount` but the collateral token is not the chain's wNative. */
export class NativeAmountOnNonWNativeCollateralError extends Error {
  constructor(collateralToken: Address, wNative: Address) {
    super(
      `Cannot use nativeAmount: collateral token ${collateralToken} is not the wrapped native token ${wNative}`,
    );
  }
}

/** Thrown when a borrow exceeds the LLTV-buffered safe maximum for the position. */
export class BorrowExceedsSafeLtvError extends Error {
  constructor(borrowAmount: bigint, maxSafeBorrow: bigint) {
    super(
      `Borrow amount ${borrowAmount} exceeds safe maximum ${maxSafeBorrow} (LLTV minus buffer). Reduce borrow or increase collateral.`,
    );
  }
}

/** Thrown when the market's oracle price is unavailable and position health cannot be validated. */
export class MissingMarketPriceError extends Error {
  constructor(market: string) {
    super(
      `Oracle price unavailable for market ${market}. Cannot validate position health.`,
    );
  }
}

/** Thrown when a `MarketParams.id` does not match the expected market id derived from the other fields. */
export class MarketIdMismatchError extends Error {
  constructor(marketId: string, expectedMarketId: string) {
    super(
      `Market ${marketId} does not match expected market ${expectedMarketId}`,
    );
  }
}

/** Thrown when an accrual position belongs to a different user than the one expected by the call. */
export class AccrualPositionUserMismatchError extends Error {
  constructor(positionUser: string, expectedUser: string) {
    super(
      `Accrual position user ${positionUser} does not match expected user ${expectedUser}`,
    );
  }
}

/** Thrown when a reallocation's fee is negative. */
export class NegativeReallocationFeeError extends Error {
  constructor(vault: string) {
    super(`Reallocation fee must not be negative for vault: ${vault}`);
  }
}

/** Thrown when a reallocation has no withdrawals. */
export class EmptyReallocationWithdrawalsError extends Error {
  constructor(vault: string) {
    super(`Reallocation withdrawals list cannot be empty for vault: ${vault}`);
  }
}

/** Thrown when a reallocation withdrawal amount is zero or negative. */
export class NonPositiveReallocationAmountError extends Error {
  constructor(vault: string, market: string) {
    super(
      `Reallocation withdrawal amount must be positive for vault ${vault} on market ${market}`,
    );
  }
}

/** Thrown when a reallocation withdrawal references the borrow target market (which would be a no-op or self-deal). */
export class ReallocationWithdrawalOnTargetMarketError extends Error {
  constructor(vault: string, marketId: string) {
    super(
      `Reallocation withdrawal cannot include the borrow target market ${marketId} for vault ${vault}.`,
    );
  }
}

/** Thrown when reallocation withdrawals within a vault are not strictly sorted by market id. */
export class UnsortedReallocationWithdrawalsError extends Error {
  constructor(vault: string, marketId: string) {
    super(
      `Reallocation withdrawals must be strictly sorted by market ID for vault ${vault}. Market ${marketId} is out of order.`,
    );
  }
}

/** Thrown when a market repay's `transferAmount` is zero or negative. */
export class NonPositiveTransferAmountError extends Error {
  constructor(market: string) {
    super(`Transfer amount must be positive for market: ${market}`);
  }
}

/** Thrown when a market repay in assets mode has `transferAmount !== assets` (asset-mode requires exact transfer). */
export class TransferAmountNotEqualToAssetsError extends Error {
  constructor(params: {
    transferAmount: bigint;
    assets: bigint;
    market: string;
  }) {
    super(
      `Transfer amount ${params.transferAmount} is not equal to repay assets ${params.assets} for market: ${params.market}`,
    );
  }
}

/** Thrown when a market repay specifies both `assets` and `shares` as non-zero (modes are mutually exclusive). */
export class MutuallyExclusiveRepayAmountsError extends Error {
  constructor(market: string) {
    super(
      `Exactly one of assets or shares must be non-zero for market: ${market}. Both were provided.`,
    );
  }
}

/** Thrown when a market repay has non-positive amounts: both `assets` and `shares` are zero, or either is negative. */
export class NonPositiveRepayAmountError extends Error {
  constructor(market: string) {
    super(`Repay amount must be positive for market: ${market}`);
  }
}

/** Thrown when a market repay's `maxSharePrice` slippage bound is zero or negative. */
export class NonPositiveRepayMaxSharePriceError extends Error {
  constructor(market: string) {
    super(`Max share price must be positive for market: ${market}`);
  }
}

/** Thrown when a market `withdrawCollateral` amount is zero or negative. */
export class NonPositiveWithdrawCollateralAmountError extends Error {
  constructor(market: string) {
    super(`Withdraw collateral amount must be positive for market: ${market}`);
  }
}

/** Thrown when a withdraw amount exceeds the position's available collateral. */
export class WithdrawExceedsCollateralError extends Error {
  constructor(params: {
    withdrawAmount: bigint;
    available: bigint;
    market: string;
  }) {
    super(
      `Withdraw amount ${params.withdrawAmount} exceeds available collateral ${params.available} for market: ${params.market}`,
    );
  }
}

/** Thrown when a collateral withdrawal would leave the borrower's position above the LLTV-buffered safe maximum. */
export class WithdrawMakesPositionUnhealthyError extends Error {
  constructor(params: {
    withdrawAmount: bigint;
    borrowAssets: bigint;
    maxSafeBorrow: bigint;
  }) {
    super(
      `Withdrawing ${params.withdrawAmount} collateral would make position unhealthy. Max safe borrow after withdrawal: ${params.maxSafeBorrow}. Actual Borrow assets: ${params.borrowAssets}.`,
    );
  }
}

/** Thrown when a share-amount conversion would divide by zero (the market has no shares of the relevant kind). */
export class ShareDivideByZeroError extends Error {
  constructor(market: string) {
    super(`Share divide by zero error for market: ${market}`);
  }
}

/** Thrown when a repay amount in assets exceeds the borrower's outstanding debt. */
export class RepayExceedsDebtError extends Error {
  constructor(params: { repayAmount: bigint; debt: bigint; market: string }) {
    super(
      `Repay amount ${params.repayAmount} exceeds outstanding debt ${params.debt} for market: ${params.market}`,
    );
  }
}

/** Thrown when EIP-712 signature verification fails (the signed data does not match the expected signer). */
export class InvalidSignatureError extends Error {
  constructor() {
    super(
      "Signature verification failed: the signed data does not match the expected signer address",
    );
  }
}

/** Thrown when a repay in shares mode supplies more shares than the borrower owes. */
export class RepaySharesExceedDebtError extends Error {
  constructor(params: {
    repayShares: bigint;
    borrowShares: bigint;
    market: string;
  }) {
    super(
      `Repay shares ${params.repayShares} exceed outstanding borrow shares ${params.borrowShares} for market: ${params.market}`,
    );
  }
}

/** Thrown when a vault selected for reallocation has no configured `PublicAllocator`. */
export class MissingPublicAllocatorConfigError extends Error {
  constructor(vault: string) {
    super(
      `Vault ${vault} has no public allocator configured but was selected for reallocation`,
    );
  }
}

/** Thrown when a reallocation attempts to use a disabled vault market. */
export class DisabledReallocationMarketError extends Error {
  constructor(
    public readonly vault: Address,
    public readonly marketId: MarketId,
  ) {
    super(
      `Vault ${vault} has disabled market ${marketId}. Remove it from reallocations or re-enable the market before reallocating.`,
    );
  }
}

/**
 * Thrown when shared liquidity selected by `computeReallocations` cannot cover
 * the absolute borrow shortfall on the target market — the resulting
 * `morphoBorrow` would still revert onchain.
 *
 * Pattern-match on the class and inspect `params` to surface the gap to users.
 */
export class InsufficientSharedLiquidityError extends Error {
  constructor(
    public readonly params: {
      readonly marketId: MarketId;
      readonly shortfall: bigint;
      readonly available: bigint;
    },
  ) {
    super(
      `Shared liquidity is insufficient to cover the borrow on market ${params.marketId}: shortfall "${params.shortfall}", available "${params.available}". Reduce the borrow amount or wait for additional vault liquidity.`,
    );
  }
}

/** Thrown when reallocation state does not contain a requested market. */
export class UnknownReallocationMarketError extends UnknownDataError {
  /**
   * @param marketId - Missing market id.
   */
  constructor(public readonly marketId: MarketId) {
    super(`unknown reallocation market "${marketId}"`);
  }
}

/** Thrown when reallocation state does not contain a requested vault. */
export class UnknownReallocationVaultError extends UnknownDataError {
  /**
   * @param vault - Missing vault address.
   */
  constructor(public readonly vault: Address) {
    super(`unknown reallocation vault "${vault}"`);
  }
}

/** Thrown when reallocation state does not contain a requested vault-market config. */
export class UnknownReallocationVaultMarketConfigError extends UnknownDataError {
  /**
   * @param vault - Vault address for the missing config.
   * @param marketId - Market id for the missing config.
   */
  constructor(
    public readonly vault: Address,
    public readonly marketId: MarketId,
  ) {
    super(
      `unknown reallocation config for vault "${vault}" on market "${marketId}"`,
    );
  }
}

/** Thrown when reallocation state does not contain a requested market position. */
export class UnknownReallocationPositionError extends UnknownDataError {
  /**
   * @param user - Position owner address.
   * @param marketId - Market id for the missing position.
   */
  constructor(
    public readonly user: Address,
    public readonly marketId: MarketId,
  ) {
    super(`unknown reallocation position of "${user}" on market "${marketId}"`);
  }
}

/** Thrown when a market borrow's `minSharePrice` slippage bound is negative. */
export class NonPositiveMinBorrowSharePriceError extends Error {
  constructor(market: string) {
    super(`Min share price must be non-negative for market: ${market}`);
  }
}

/** Thrown when a vault migration's source vault asset differs from the target vault asset. */
export class VaultAssetMismatchError extends Error {
  constructor(sourceAsset: Address, targetAsset: Address) {
    super(
      `Source vault asset ${sourceAsset} does not match target vault asset ${targetAsset}`,
    );
  }
}

/** Thrown when a vault redeem's `minSharePrice` slippage bound is negative. */
export class NegativeMinSharePriceError extends Error {
  constructor(vault: Address) {
    super(`Min share price must be non-negative for vault: ${vault}`);
  }
}
