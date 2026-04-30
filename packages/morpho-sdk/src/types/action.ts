import type { Address, Client, Hex } from "viem";
import type { Deallocation } from "./deallocation.js";

export interface BaseAction<
  TType extends string = string,
  TArgs extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly type: TType;
  readonly args: TArgs;
}

export interface ERC20ApprovalAction
  extends BaseAction<"erc20Approval", { spender: Address; amount: bigint }> {}

export interface ERC20PermitAction {
  sign: (client: Client, userAddress: Address) => Promise<Hex>;
}

export interface VaultV2DepositAction
  extends BaseAction<
    "vaultV2Deposit",
    {
      vault: Address;
      amount: bigint;
      maxSharePrice: bigint;
      recipient: Address;
      nativeAmount?: bigint;
    }
  > {}

export interface VaultV2WithdrawAction
  extends BaseAction<
    "vaultV2Withdraw",
    {
      vault: Address;
      amount: bigint;
      recipient: Address;
    }
  > {}

export interface VaultV2RedeemAction
  extends BaseAction<
    "vaultV2Redeem",
    {
      vault: Address;
      shares: bigint;
      recipient: Address;
    }
  > {}

export interface VaultV2ForceWithdrawAction
  extends BaseAction<
    "vaultV2ForceWithdraw",
    {
      vault: Address;
      deallocations: readonly Deallocation[];
      withdraw: { amount: bigint; recipient: Address };
      onBehalf: Address;
    }
  > {}

export interface VaultV2ForceRedeemAction
  extends BaseAction<
    "vaultV2ForceRedeem",
    {
      vault: Address;
      deallocations: readonly Deallocation[];
      redeem: { shares: bigint; recipient: Address };
      onBehalf: Address;
    }
  > {}

export interface VaultV1DepositAction
  extends BaseAction<
    "vaultV1Deposit",
    {
      vault: Address;
      amount: bigint;
      maxSharePrice: bigint;
      recipient: Address;
      nativeAmount?: bigint;
    }
  > {}

export interface VaultV1WithdrawAction
  extends BaseAction<
    "vaultV1Withdraw",
    {
      vault: Address;
      amount: bigint;
      recipient: Address;
    }
  > {}

export interface VaultV1RedeemAction
  extends BaseAction<
    "vaultV1Redeem",
    {
      vault: Address;
      shares: bigint;
      recipient: Address;
    }
  > {}

export interface VaultV1MigrateToV2Action
  extends BaseAction<
    "vaultV1MigrateToV2",
    {
      sourceVault: Address;
      targetVault: Address;
      shares: bigint;
      minSharePriceVaultV1: bigint;
      maxSharePriceVaultV2: bigint;
      recipient: Address;
    }
  > {}

export interface MarketV1SupplyCollateralAction
  extends BaseAction<
    "marketV1SupplyCollateral",
    {
      market: Hex;
      amount: bigint;
      onBehalf: Address;
      nativeAmount?: bigint;
    }
  > {}

export interface MarketV1BorrowAction
  extends BaseAction<
    "marketV1Borrow",
    {
      market: Hex;
      amount: bigint;
      receiver: Address;
      minSharePrice: bigint;
      reallocationFee: bigint;
    }
  > {}

export interface MarketV1SupplyCollateralBorrowAction
  extends BaseAction<
    "marketV1SupplyCollateralBorrow",
    {
      market: Hex;
      collateralAmount: bigint;
      borrowAmount: bigint;
      minSharePrice: bigint;
      onBehalf: Address;
      receiver: Address;
      nativeAmount?: bigint;
      reallocationFee: bigint;
    }
  > {}

export interface MarketV1RepayAction
  extends BaseAction<
    "marketV1Repay",
    {
      market: Hex;
      assets: bigint;
      shares: bigint;
      transferAmount: bigint;
      onBehalf: Address;
      receiver: Address;
      maxSharePrice: bigint;
    }
  > {}

export interface MarketV1WithdrawCollateralAction
  extends BaseAction<
    "marketV1WithdrawCollateral",
    {
      market: Hex;
      amount: bigint;
      onBehalf: Address;
      receiver: Address;
    }
  > {}

export interface MarketV1RepayWithdrawCollateralAction
  extends BaseAction<
    "marketV1RepayWithdrawCollateral",
    {
      market: Hex;
      repayAssets: bigint;
      repayShares: bigint;
      transferAmount: bigint;
      withdrawAmount: bigint;
      maxSharePrice: bigint;
      onBehalf: Address;
      receiver: Address;
    }
  > {}

/**
 * Enforces that exactly one repay amount source is provided.
 *
 * - `assets`: partial repay by exact asset amount.
 * - `shares`: full repay by exact share count (guarantees full debt repayment
 *   regardless of interest accrued between tx construction and execution).
 */
export type RepayAmountArgs = { assets: bigint } | { shares: bigint };

export interface MorphoAuthorizationAction
  extends BaseAction<
    "morphoAuthorization",
    {
      authorized: Address;
      isAuthorized: boolean;
    }
  > {}

export type TransactionAction =
  | ERC20ApprovalAction
  | VaultV2DepositAction
  | VaultV2WithdrawAction
  | VaultV2RedeemAction
  | VaultV2ForceWithdrawAction
  | VaultV2ForceRedeemAction
  | VaultV1DepositAction
  | VaultV1WithdrawAction
  | VaultV1RedeemAction
  | VaultV1MigrateToV2Action
  | MarketV1SupplyCollateralAction
  | MarketV1BorrowAction
  | MarketV1SupplyCollateralBorrowAction
  | MarketV1RepayAction
  | MarketV1WithdrawCollateralAction
  | MarketV1RepayWithdrawCollateralAction
  | MorphoAuthorizationAction;

export interface Transaction<TAction extends BaseAction = TransactionAction> {
  readonly to: Address;
  readonly value: bigint;
  readonly data: Hex;
  readonly action: TAction;
}

/**
 * Enforces that at least one deposit amount source is provided.
 *
 * - `amount` alone: standard ERC20 deposit.
 * - `nativeAmount` alone: pure native-wrap deposit (vault asset must be wNative).
 * - Both: mixed deposit (ERC20 transfer + native wrap).
 */
export type DepositAmountArgs =
  | { amount: bigint; nativeAmount?: bigint }
  | { nativeAmount: bigint; amount?: bigint };

export interface PermitArgs {
  owner: Address;
  nonce: bigint;
  asset: Address;
  signature: Hex;
  amount: bigint;
  deadline: bigint;
}

export interface Permit2Args {
  owner: Address;
  nonce: bigint;
  asset: Address;
  signature: Hex;
  amount: bigint;
  deadline: bigint;
  expiration: bigint;
}

export interface Requirement {
  sign: (client: Client, userAddress: Address) => Promise<RequirementSignature>;
  action: PermitAction | Permit2Action;
}

export interface PermitAction
  extends BaseAction<
    "permit",
    { spender: Address; amount: bigint; deadline: bigint }
  > {}

export interface Permit2Action
  extends BaseAction<
    "permit2",
    { spender: Address; amount: bigint; deadline: bigint; expiration: bigint }
  > {}

export interface RequirementSignature {
  args: PermitArgs | Permit2Args;
  action: PermitAction | Permit2Action;
}

export function isRequirementApproval(
  requirement:
    | Transaction<ERC20ApprovalAction>
    | Transaction<MorphoAuthorizationAction>
    | Requirement
    | undefined,
): requirement is Transaction<ERC20ApprovalAction> {
  return (
    requirement !== undefined &&
    "to" in requirement &&
    "value" in requirement &&
    "data" in requirement &&
    "action" in requirement &&
    requirement.action.type === "erc20Approval"
  );
}

export function isRequirementAuthorization(
  requirement:
    | Transaction<ERC20ApprovalAction>
    | Transaction<MorphoAuthorizationAction>
    | Requirement
    | undefined,
): requirement is Transaction<MorphoAuthorizationAction> {
  return (
    requirement !== undefined &&
    "to" in requirement &&
    "value" in requirement &&
    "data" in requirement &&
    "action" in requirement &&
    requirement.action.type === "morphoAuthorization"
  );
}

export function isRequirementSignature(
  requirement:
    | Transaction<ERC20ApprovalAction>
    | Transaction<MorphoAuthorizationAction>
    | Requirement
    | undefined,
): requirement is Requirement {
  return (
    requirement !== undefined &&
    "sign" in requirement &&
    typeof requirement.sign === "function"
  );
}
