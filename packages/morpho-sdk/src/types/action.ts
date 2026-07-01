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
      /** Native token wrapped into wNative to fund the repay. Present when `> 0n`. */
      nativeAmount?: bigint;
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
      /** Native token wrapped into wNative to fund the repay. Present when `> 0n`. */
      nativeAmount?: bigint;
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
 * Used by withdraw (asserts on supply side). Repay uses {@link RepayAmountArgs},
 * which additionally supports native wrapping.
 */
export type AssetsOrSharesArgs = { assets: bigint } | { shares: bigint };

/**
 * Repay funding sources for the **entity layer** (`MorphoBlue.repay` /
 * `MorphoBlue.repayWithdrawCollateral`), which computes the loan-token
 * `transferAmount` itself from live market state.
 *
 * - **assets mode** ({@link DepositAmountArgs}): repay an exact asset total of
 *   `amount` (ERC-20) + `nativeAmount` (wrapped native). Additive — mirrors `blueSupply`.
 * - **shares mode** (`{ shares }`): repay an exact borrow-share count (full close,
 *   immune to interest accrual). `nativeAmount` funds part of the transfer.
 *
 * `nativeAmount` requires the market's loan token to be the chain's wNative.
 */
export type RepayAmountArgs =
  | DepositAmountArgs
  | { shares: bigint; nativeAmount?: bigint };

/**
 * Repay funding sources for the **action layer** (`blueRepay` /
 * `blueRepayWithdrawCollateral`). Identical to {@link RepayAmountArgs} except the
 * shares branch carries the caller-supplied upper-bound `transferAmount`: the
 * ERC-20 pulled is `transferAmount − nativeAmount` and the residual loan token is
 * skimmed back to `receiver`.
 */
export type RepayActionAmountArgs =
  | DepositAmountArgs
  | { shares: bigint; transferAmount: bigint; nativeAmount?: bigint };

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
  | BlueSupplyAction
  | BlueWithdrawAction
  | BlueSupplyCollateralAction
  | BlueBorrowAction
  | BlueSupplyCollateralBorrowAction
  | BlueRepayAction
  | BlueWithdrawCollateralAction
  | BlueRepayWithdrawCollateralAction
  | BlueRefinanceAction
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
  sign: (
    client: WalletClient,
    userAddress: Address,
  ) => Promise<RequirementSignature>;
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
