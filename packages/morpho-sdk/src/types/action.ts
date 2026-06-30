import type { Address, Hex, WalletClient } from "viem";
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
  sign: (client: WalletClient, userAddress: Address) => Promise<Hex>;
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

export interface BlueSupplyAction
  extends BaseAction<
    "blueSupply",
    {
      market: Hex;
      amount: bigint;
      onBehalf: Address;
      maxSharePrice: bigint;
      nativeAmount?: bigint;
    }
  > {}

export interface BlueWithdrawAction
  extends BaseAction<
    "blueWithdraw",
    {
      market: Hex;
      assets: bigint;
      shares: bigint;
      receiver: Address;
      minSharePrice: bigint;
      reallocationFee: bigint;
    }
  > {}

export interface BlueSupplyCollateralAction
  extends BaseAction<
    "blueSupplyCollateral",
    {
      market: Hex;
      amount: bigint;
      onBehalf: Address;
      nativeAmount?: bigint;
    }
  > {}

export interface BlueBorrowAction
  extends BaseAction<
    "blueBorrow",
    {
      market: Hex;
      amount: bigint;
      receiver: Address;
      minSharePrice: bigint;
      reallocationFee: bigint;
    }
  > {}

export interface BlueSupplyCollateralBorrowAction
  extends BaseAction<
    "blueSupplyCollateralBorrow",
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

export interface BlueRepayAction
  extends BaseAction<
    "blueRepay",
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

export interface BlueWithdrawCollateralAction
  extends BaseAction<
    "blueWithdrawCollateral",
    {
      market: Hex;
      amount: bigint;
      onBehalf: Address;
      receiver: Address;
    }
  > {}

export interface BlueRepayWithdrawCollateralAction
  extends BaseAction<
    "blueRepayWithdrawCollateral",
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

export interface BlueRefinanceAction
  extends BaseAction<
    "blueRefinance",
    {
      readonly sourceMarket: Hex;
      readonly targetMarket: Hex;
      readonly collateralAmount: bigint;
      readonly borrowAssets: bigint;
      readonly borrowShares: bigint;
      readonly minBorrowSharePrice: bigint;
      readonly maxRepaySharePrice: bigint;
      readonly user: Address;
      readonly reallocationFee: bigint;
    }
  > {}

/**
 * Enforces that exactly one of `assets` / `shares` is provided.
 *
 * - `assets`: operate on an exact asset amount.
 * - `shares`: operate on an exact share count (typical for full position closes,
 *   immune to interest accrual between tx construction and execution).
 *
 * Used by repay (asserts on borrow side) and withdraw (asserts on supply side).
 */
export type AssetsOrSharesArgs = { assets: bigint } | { shares: bigint };

/** @deprecated Use {@link AssetsOrSharesArgs}. Kept as an alias for back-compat. */
export type RepayAmountArgs = AssetsOrSharesArgs;

/** Metadata for a Blue authorization prerequisite transaction. */
export interface BlueAuthorizationAction
  extends BaseAction<
    "blueAuthorization",
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
  | BlueSupplyAction
  | BlueWithdrawAction
  | BlueSupplyCollateralAction
  | BlueBorrowAction
  | BlueSupplyCollateralBorrowAction
  | BlueRepayAction
  | BlueWithdrawCollateralAction
  | BlueRepayWithdrawCollateralAction
  | BlueRefinanceAction
  | BlueAuthorizationAction;

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

/** Signature prerequisite returned by requirement helpers. */
export interface Requirement<
  TAction extends PermitAction | Permit2Action = PermitAction | Permit2Action,
  TArgs extends PermitArgs | Permit2Args = PermitArgs | Permit2Args,
> {
  sign: (
    client: WalletClient,
    userAddress: Address,
  ) => Promise<RequirementSignature<TAction, TArgs>>;
  action: TAction;
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

/** Result returned by a prerequisite signature request. */
export interface RequirementSignature<
  TAction extends PermitAction | Permit2Action = PermitAction | Permit2Action,
  TArgs extends PermitArgs | Permit2Args = PermitArgs | Permit2Args,
> {
  args: TArgs;
  action: TAction;
}

/** Blue token signature requirement. */
export type BlueTokenSignatureRequirement =
  | Requirement<PermitAction, PermitArgs>
  | Requirement<Permit2Action, Permit2Args>;

export function isRequirementApproval(
  requirement: unknown,
): requirement is Transaction<ERC20ApprovalAction> {
  return (
    typeof requirement === "object" &&
    requirement !== null &&
    "to" in requirement &&
    "value" in requirement &&
    "data" in requirement &&
    "action" in requirement &&
    typeof requirement.action === "object" &&
    requirement.action !== null &&
    "type" in requirement.action &&
    requirement.action.type === "erc20Approval"
  );
}

/** Checks whether an action requirement is a Blue authorization transaction. */
export function isRequirementBlueAuthorization(
  requirement: unknown,
): requirement is Transaction<BlueAuthorizationAction> {
  return (
    typeof requirement === "object" &&
    requirement !== null &&
    "to" in requirement &&
    "value" in requirement &&
    "data" in requirement &&
    "action" in requirement &&
    typeof requirement.action === "object" &&
    requirement.action !== null &&
    "type" in requirement.action &&
    requirement.action.type === "blueAuthorization"
  );
}

export function isRequirementSignature(
  requirement:
    | Transaction<ERC20ApprovalAction>
    | Transaction<BlueAuthorizationAction>
    | BlueTokenSignatureRequirement
    | undefined,
): requirement is BlueTokenSignatureRequirement;
export function isRequirementSignature(
  requirement:
    | Transaction<ERC20ApprovalAction>
    | Transaction<BlueAuthorizationAction>
    | Requirement
    | undefined,
): requirement is Requirement;
export function isRequirementSignature(requirement: unknown): boolean {
  return (
    requirement !== undefined &&
    typeof requirement === "object" &&
    requirement !== null &&
    "sign" in requirement &&
    typeof requirement.sign === "function"
  );
}
