import type { Address } from "viem";

export class NonPositiveAssetAmountError extends Error {
  constructor(origin: Address) {
    super(`Asset amount must be positive for address ${origin}`);
  }
}

export class NonPositiveSharesAmountError extends Error {
  constructor(vault: Address) {
    super(`Shares amount must be positive for address: ${vault}`);
  }
}

export class NonPositiveMaxSharePriceError extends Error {
  constructor(vault: Address) {
    super(`Max share price must be positive for vault: ${vault}`);
  }
}

export class AddressMismatchError extends Error {
  constructor(clientAddress: Address, argsAddress: Address) {
    super(
      `Address mismatch between client: ${clientAddress} and args: ${argsAddress}`,
    );
  }
}

export class ChainIdMismatchError extends Error {
  constructor(clientChainId: number | undefined, argsChainId: number) {
    super(
      `Chain ID mismatch between client: ${clientChainId} and args: ${argsChainId}`,
    );
  }
}

export class MissingClientPropertyError extends Error {
  constructor(property: string) {
    super(`A required ${property} is missing from the client.`);
  }
}

export class ApprovalAmountLessThanSpendAmountError extends Error {
  constructor() {
    super("Approval amount is less than spend amount");
  }
}

export class NegativeSlippageToleranceError extends Error {
  constructor(slippageTolerance: bigint) {
    super(`Slippage tolerance ${slippageTolerance} must not be negative`);
  }
}

export class MissingAccrualPositionError extends Error {
  constructor(market: string) {
    super(`Accrual position is missing for market: ${market}`);
  }
}

export class ExcessiveSlippageToleranceError extends Error {
  constructor(slippageTolerance: bigint) {
    super(
      `Slippage tolerance ${slippageTolerance} exceeds maximum allowed (10%)`,
    );
  }
}

export class EmptyDeallocationsError extends Error {
  constructor(vault: Address) {
    super(`Deallocations list cannot be empty for vault: ${vault}`);
  }
}

export class DepositAmountMismatchError extends Error {
  constructor(depositAmount: bigint, signatureAmount: bigint) {
    super(
      `Deposit amount ${depositAmount} does not match requirement signature amount ${signatureAmount}`,
    );
  }
}

export class DepositAssetMismatchError extends Error {
  constructor(depositAsset: Address, signatureAsset: Address) {
    super(
      `Deposit asset ${depositAsset} does not match requirement signature asset ${signatureAsset}`,
    );
  }
}

export class NativeAmountOnNonWNativeVaultError extends Error {
  constructor(vaultAsset: Address, wNative: Address) {
    super(
      `Cannot use nativeAmount: vault asset ${vaultAsset} is not the wrapped native token ${wNative}`,
    );
  }
}

export class ChainWNativeMissingError extends Error {
  constructor(chainId: number) {
    super(
      `Chain ${chainId} does not have a configured wrapped native token (wNative)`,
    );
  }
}

export class NegativeNativeAmountError extends Error {
  constructor(nativeAmount: bigint) {
    super(`Native amount must not be negative, got ${nativeAmount}`);
  }
}

export class ZeroDepositAmountError extends Error {
  constructor(vault: Address) {
    super(
      `Total deposit amount must be positive for vault: ${vault}. Both amount and nativeAmount are zero.`,
    );
  }
}

export class VaultAddressMismatchError extends Error {
  constructor(vaultAddress: Address, argsVaultAddress: Address) {
    super(
      `Vault address mismatch between vault: ${vaultAddress} and args: ${argsVaultAddress}`,
    );
  }
}

export class NonPositiveBorrowAmountError extends Error {
  constructor(market: string) {
    super(`Borrow amount must be positive for market: ${market}`);
  }
}

export class ZeroCollateralAmountError extends Error {
  constructor(market: string) {
    super(
      `Total collateral amount must be positive for market: ${market}. Both amount and nativeAmount are zero.`,
    );
  }
}

export class NativeAmountOnNonWNativeCollateralError extends Error {
  constructor(collateralToken: Address, wNative: Address) {
    super(
      `Cannot use nativeAmount: collateral token ${collateralToken} is not the wrapped native token ${wNative}`,
    );
  }
}

export class BorrowExceedsSafeLtvError extends Error {
  constructor(borrowAmount: bigint, maxSafeBorrow: bigint) {
    super(
      `Borrow amount ${borrowAmount} exceeds safe maximum ${maxSafeBorrow} (LLTV minus buffer). Reduce borrow or increase collateral.`,
    );
  }
}

export class MissingMarketPriceError extends Error {
  constructor(market: string) {
    super(
      `Oracle price unavailable for market ${market}. Cannot validate position health.`,
    );
  }
}

export class MarketIdMismatchError extends Error {
  constructor(marketId: string, expectedMarketId: string) {
    super(
      `Market ${marketId} does not match expected market ${expectedMarketId}`,
    );
  }
}

export class AccrualPositionUserMismatchError extends Error {
  constructor(positionUser: string, expectedUser: string) {
    super(
      `Accrual position user ${positionUser} does not match expected user ${expectedUser}`,
    );
  }
}

export class NegativeReallocationFeeError extends Error {
  constructor(vault: string) {
    super(`Reallocation fee must not be negative for vault: ${vault}`);
  }
}

export class EmptyReallocationWithdrawalsError extends Error {
  constructor(vault: string) {
    super(`Reallocation withdrawals list cannot be empty for vault: ${vault}`);
  }
}

export class NonPositiveReallocationAmountError extends Error {
  constructor(vault: string, market: string) {
    super(
      `Reallocation withdrawal amount must be positive for vault ${vault} on market ${market}`,
    );
  }
}

export class ReallocationWithdrawalOnTargetMarketError extends Error {
  constructor(vault: string, marketId: string) {
    super(
      `Reallocation withdrawal cannot include the borrow target market ${marketId} for vault ${vault}.`,
    );
  }
}

export class UnsortedReallocationWithdrawalsError extends Error {
  constructor(vault: string, marketId: string) {
    super(
      `Reallocation withdrawals must be strictly sorted by market ID for vault ${vault}. Market ${marketId} is out of order.`,
    );
  }
}

export class NonPositiveTransferAmountError extends Error {
  constructor(market: string) {
    super(`Transfer amount must be positive for market: ${market}`);
  }
}

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

export class MutuallyExclusiveRepayAmountsError extends Error {
  constructor(market: string) {
    super(
      `Exactly one of assets or shares must be non-zero for market: ${market}. Both were provided.`,
    );
  }
}

export class NonPositiveRepayAmountError extends Error {
  constructor(market: string) {
    super(`Repay amount must be positive for market: ${market}`);
  }
}

export class NonPositiveRepayMaxSharePriceError extends Error {
  constructor(market: string) {
    super(`Max share price must be positive for market: ${market}`);
  }
}

export class NonPositiveWithdrawCollateralAmountError extends Error {
  constructor(market: string) {
    super(`Withdraw collateral amount must be positive for market: ${market}`);
  }
}

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

export class ShareDivideByZeroError extends Error {
  constructor(market: string) {
    super(`Share divide by zero error for market: ${market}`);
  }
}

export class RepayExceedsDebtError extends Error {
  constructor(params: { repayAmount: bigint; debt: bigint; market: string }) {
    super(
      `Repay amount ${params.repayAmount} exceeds outstanding debt ${params.debt} for market: ${params.market}`,
    );
  }
}

export class InvalidSignatureError extends Error {
  constructor() {
    super(
      "Signature verification failed: the signed data does not match the expected signer address",
    );
  }
}

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

export class MissingPublicAllocatorConfigError extends Error {
  constructor(vault: string) {
    super(
      `Vault ${vault} has no public allocator configured but was selected for reallocation`,
    );
  }
}

export class NonPositiveMinBorrowSharePriceError extends Error {
  constructor(market: string) {
    super(`Min share price must be non-negative for market: ${market}`);
  }
}

export class VaultAssetMismatchError extends Error {
  constructor(sourceAsset: Address, targetAsset: Address) {
    super(
      `Source vault asset ${sourceAsset} does not match target vault asset ${targetAsset}`,
    );
  }
}

export class NegativeMinSharePriceError extends Error {
  constructor(vault: Address) {
    super(`Min share price must be non-negative for vault: ${vault}`);
  }
}
