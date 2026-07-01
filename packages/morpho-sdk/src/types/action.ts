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

/** Metadata for a Midnight authorization prerequisite transaction. */
export interface MidnightAuthorizationAction
  extends BaseAction<
    "midnightAuthorization",
    {
      authorized: Address;
      isAuthorized: boolean;
      onBehalf: Address;
    }
  > {}

/** Metadata for a SetterRatifier ratify-root prerequisite transaction. */
export interface MidnightRatifyRootAction
  extends BaseAction<
    "midnightRatifyRoot",
    {
      maker: Address;
      root: Hex;
      isRootRatified: boolean;
    }
  > {}

/** Metadata for a Midnight bundle that lends into fixed-rate offers. */
export interface MidnightTakeLendAction
  extends BaseAction<
    "midnightTakeLend",
    {
      market: Hex;
      assets: bigint;
      minUnits: bigint;
      taker: Address;
      takeableOffers: number;
    }
  > {}

/** Metadata for a Midnight bundle that borrows from fixed-rate offers. */
export interface MidnightTakeBorrowAction
  extends BaseAction<
    "midnightTakeBorrow",
    {
      market: Hex;
      loanAssets: bigint;
      maxUnits: bigint;
      taker: Address;
      receiver: Address;
      takeableOffers: number;
    }
  > {}

/** Metadata for a Midnight bundle that supplies collateral and borrows from fixed-rate offers. */
export interface MidnightSupplyCollateralTakeBorrowAction
  extends BaseAction<
    "midnightSupplyCollateralTakeBorrow",
    {
      market: Hex;
      collateralAssets: bigint;
      loanAssets: bigint;
      maxUnits: bigint;
      taker: Address;
      receiver: Address;
      takeableOffers: number;
    }
  > {}

/** Metadata for a direct Midnight collateral-supply transaction. */
export interface MidnightSupplyCollateralAction
  extends BaseAction<
    "midnightSupplyCollateral",
    {
      market: Hex;
      collateralIndex: bigint;
      assets: bigint;
      onBehalf: Address;
    }
  > {}

/** Metadata for a Midnight mempool payload submission. */
export interface MidnightSubmitOffersAction
  extends BaseAction<
    "midnightSubmitOffers",
    {
      groups: readonly Hex[];
      root: Hex;
      maker: Address;
      ratifier: Address;
      ratifierType: "ecrecover" | "setter";
      offers: number;
    }
  > {}

/** Metadata for a direct Midnight credit redemption transaction. */
export interface MidnightRedeemAction
  extends BaseAction<
    "midnightRedeem",
    {
      market: Hex;
      units: bigint;
      onBehalf: Address;
      receiver: Address;
    }
  > {}

/** Metadata for a Midnight bundle that repays credit and/or withdraws collateral. */
export interface MidnightRepayWithdrawCollateralAction
  extends BaseAction<
    "midnightRepayWithdrawCollateral",
    {
      market: Hex;
      repayAssets: bigint;
      withdrawCollateralAssets: bigint;
      onBehalf: Address;
      receiver: Address;
    }
  > {}

/** Metadata for a direct Midnight offer-cancellation transaction. */
export interface MidnightCancelOfferAction
  extends BaseAction<
    "midnightCancelOffer",
    {
      group: Hex;
      amount: bigint;
      onBehalf: Address;
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
  | BlueAuthorizationAction
  | MidnightAuthorizationAction
  | MidnightRatifyRootAction
  | MidnightTakeLendAction
  | MidnightTakeBorrowAction
  | MidnightSupplyCollateralTakeBorrowAction
  | MidnightSupplyCollateralAction
  | MidnightSubmitOffersAction
  | MidnightRedeemAction
  | MidnightRepayWithdrawCollateralAction
  | MidnightCancelOfferAction;

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

/** Signed Permit2 SignatureTransfer payload returned by Midnight bundle token-pull requirements. */
export interface Permit2TransferArgs {
  owner: Address;
  nonce: bigint;
  asset: Address;
  signature: Hex;
  amount: bigint;
  deadline: bigint;
}

/** Signed and encoded Ecrecover offer-root payload used by Midnight maker flows. */
export interface MidnightOfferRootSignatureArgs {
  owner: Address;
  root: Hex;
  signature: Hex;
  payload: Hex;
}

/** Signature prerequisite returned by action-output `getRequirements()`. */
export interface Requirement<
  TAction extends SignatureRequirementAction = PermitAction | Permit2Action,
  TArgs extends RequirementSignatureArgs = PermitArgs | Permit2Args,
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

/** Metadata for a Permit2 SignatureTransfer request. */
export interface Permit2TransferAction
  extends BaseAction<
    "permit2Transfer",
    { spender: Address; amount: bigint; deadline: bigint }
  > {}

/** Metadata for a Midnight offer-root signature request. */
export interface MidnightOfferRootSignatureAction
  extends BaseAction<
    "midnightOfferRootSignature",
    {
      root: Hex;
      ratifier: Address;
      offers: number;
    }
  > {}

/** Action metadata supported by signature requirements. */
export type SignatureRequirementAction =
  | PermitAction
  | Permit2Action
  | Permit2TransferAction
  | MidnightOfferRootSignatureAction;

/** Argument payloads returned by signature requirements. */
export type RequirementSignatureArgs =
  | PermitArgs
  | Permit2Args
  | Permit2TransferArgs
  | MidnightOfferRootSignatureArgs;

/** Result returned by a prerequisite signature request. */
export interface RequirementSignature<
  TAction extends SignatureRequirementAction = PermitAction | Permit2Action,
  TArgs extends RequirementSignatureArgs = PermitArgs | Permit2Args,
> {
  args: TArgs;
  action: TAction;
}

/** Bundler3 token signature requirement. */
export type Bundler3TokenSignatureRequirement =
  | Requirement<PermitAction, PermitArgs>
  | Requirement<Permit2Action, Permit2Args>;

/** Midnight Ecrecover offer-root signature requirement. */
export type MidnightOfferRootRequirement = Requirement<
  MidnightOfferRootSignatureAction,
  MidnightOfferRootSignatureArgs
>;

/** Midnight Ecrecover offer-root signature result. */
export type MidnightOfferRootSignature = RequirementSignature<
  MidnightOfferRootSignatureAction,
  MidnightOfferRootSignatureArgs
>;

/** Permit or Permit2 token signature requirement. */
export type TokenSignatureRequirement =
  | Bundler3TokenSignatureRequirement
  | Requirement<Permit2TransferAction, Permit2TransferArgs>;

/** Bundler3 token signature result. */
export type Bundler3TokenRequirementSignature =
  | RequirementSignature<PermitAction, PermitArgs>
  | RequirementSignature<Permit2Action, Permit2Args>;

/** Permit or Permit2 token signature result. */
export type TokenRequirementSignature =
  | Bundler3TokenRequirementSignature
  | RequirementSignature<Permit2TransferAction, Permit2TransferArgs>;

/** Any signature result returned by an action-output signature requirement. */
export type AnyRequirementSignature =
  | TokenRequirementSignature
  | MidnightOfferRootSignature;

/** Any signature requirement returned by an entity action output. */
export type SignatureRequirement =
  | TokenSignatureRequirement
  | MidnightOfferRootRequirement;

/** Transaction action metadata that can appear as an action prerequisite. */
export type TransactionRequirementAction =
  | ERC20ApprovalAction
  | BlueAuthorizationAction
  | MidnightAuthorizationAction
  | MidnightRatifyRootAction
  | MidnightSupplyCollateralAction;

/** Transaction prerequisite returned by action-output `getRequirements()`. */
export type TransactionRequirement = Readonly<
  Transaction<TransactionRequirementAction>
>;

/** Transaction or signature prerequisite returned by an entity action output. */
export type ActionRequirement = TransactionRequirement | SignatureRequirement;

/** Lazy entity result exposing prerequisite resolution and synchronous transaction building. */
export interface ActionOutput<
  TAction extends BaseAction = TransactionAction,
  TSignatures = RequirementSignature,
> {
  buildTx: (signatures?: TSignatures) => Readonly<Transaction<TAction>>;
  getRequirements: (params?: {
    /**
     * Prefer the ERC-2612 simple-permit path when the SDK detects support.
     * Leave unset or set to `false` to force the Permit2/classic approval fallback when
     * a token is known to be incompatible despite passing the SDK's shallow nonce probe.
     */
    readonly useSimplePermit?: boolean;
  }) => Promise<readonly ActionRequirement[]>;
}

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
    | Bundler3TokenSignatureRequirement
    | undefined,
): requirement is Bundler3TokenSignatureRequirement;
export function isRequirementSignature(
  requirement:
    | Transaction<ERC20ApprovalAction>
    | Transaction<BlueAuthorizationAction>
    | Requirement
    | undefined,
): requirement is Requirement;
export function isRequirementSignature(
  requirement: ActionRequirement | undefined,
): requirement is SignatureRequirement;
export function isRequirementSignature(requirement: unknown): boolean {
  return (
    requirement !== undefined &&
    typeof requirement === "object" &&
    requirement !== null &&
    "sign" in requirement &&
    typeof requirement.sign === "function"
  );
}
