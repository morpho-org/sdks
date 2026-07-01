import type { Address, Hex, WalletClient } from "viem";
import type { Deallocation } from "./deallocation.js";
import {
  AmbiguousRequirementSignaturesError,
  UnexpectedRequirementSignatureError,
} from "./error.js";

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

/**
 * Signed Morpho Blue authorization payload produced when an integrator opts into offchain
 * signatures (`supportSignature: true`). Consumed by the action layer to emit a
 * `setAuthorizationWithSig` bundler call in place of a standalone `setAuthorization` transaction.
 */
export interface AuthorizationSignatureArgs {
  /** Account granting the authorization (the position owner). */
  owner: Address;
  /** Account being authorized to operate on Morpho on the owner's behalf (GeneralAdapter1). */
  authorized: Address;
  /** Whether the authorization is granted (`true`) or revoked (`false`). */
  isAuthorized: boolean;
  /** Morpho authorization nonce consumed by the signature. */
  nonce: bigint;
  /** Signature deadline timestamp in seconds. */
  deadline: bigint;
  /** EIP-712 signature over the Morpho `Authorization` typed data. */
  signature: Hex;
}

/**
 * A signable approval / authorization requirement. `sign()` returns the matching
 * {@link RequirementSignature}; `action` describes the requirement without signing.
 *
 * Generic over the signature it produces so permit encoders narrow to
 * {@link PermitRequirementSignature} and the authorization encoder to
 * {@link AuthorizationRequirementSignature}; the default keeps the broad union for mixed arrays.
 */
export interface Requirement<
  TSignature extends RequirementSignature = RequirementSignature,
> {
  sign: (client: WalletClient, userAddress: Address) => Promise<TSignature>;
  action: TSignature["action"];
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

/**
 * Signable Morpho authorization requirement. Emitted by the entity layer when a bundled path
 * needs GeneralAdapter1 authorized and the client opts into offchain signatures.
 */
export interface AuthorizationAction
  extends BaseAction<
    "authorization",
    { authorized: Address; isAuthorized: boolean; deadline: bigint }
  > {}

/** A signed ERC-2612 permit or Permit2 approval requirement. */
export interface PermitRequirementSignature {
  args: PermitArgs | Permit2Args;
  action: PermitAction | Permit2Action;
}

/** A signed Morpho authorization requirement (consumed via `setAuthorizationWithSig`). */
export interface AuthorizationRequirementSignature {
  args: AuthorizationSignatureArgs;
  action: AuthorizationAction;
}

/**
 * The deep-frozen output of `Requirement.sign()`. Discriminated on `action.type`:
 * `"permit"` / `"permit2"` carry token-approval args, `"authorization"` carries the signed
 * Morpho authorization. Narrow with {@link isPermitSignature} / {@link isAuthorizationSignature}.
 */
export type RequirementSignature =
  | PermitRequirementSignature
  | AuthorizationRequirementSignature;

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

export function isRequirementSignature<
  T extends RequirementSignature = RequirementSignature,
>(
  requirement:
    | Transaction<ERC20ApprovalAction>
    | Transaction<MorphoAuthorizationAction>
    | Requirement<T>
    | undefined,
): requirement is Requirement<T> {
  return (
    requirement !== undefined &&
    "sign" in requirement &&
    typeof requirement.sign === "function"
  );
}

/**
 * Narrows a {@link RequirementSignature} to a permit / Permit2 token-approval signature.
 *
 * @param signature - The signed requirement to test.
 * @returns `true` when `signature.action.type` is `"permit"` or `"permit2"`.
 */
export function isPermitSignature(
  signature: RequirementSignature,
): signature is PermitRequirementSignature {
  return (
    signature.action.type === "permit" || signature.action.type === "permit2"
  );
}

/**
 * Narrows a {@link RequirementSignature} to a signed Morpho authorization.
 *
 * @param signature - The signed requirement to test.
 * @returns `true` when `signature.action.type` is `"authorization"`.
 */
export function isAuthorizationSignature(
  signature: RequirementSignature,
): signature is AuthorizationRequirementSignature {
  return signature.action.type === "authorization";
}

/** The typed permit / authorization slots a bundled path consumes, split from a `buildTx` array. */
export interface SelectedRequirementSignatures {
  /** The single permit / Permit2 signature, when present. */
  permit?: PermitRequirementSignature;
  /** The single Morpho authorization signature, when present. */
  authorization?: AuthorizationRequirementSignature;
}

/**
 * Splits a `buildTx` signature array into its typed permit / authorization slots, rejecting
 * ambiguous or unexpected input so a path never silently consumes the wrong signature.
 *
 * A bundled path consumes at most one permit and one authorization signature. Passing several of
 * the same kind, or a kind the path does not consume, is rejected with a typed error rather than
 * silently dropping the extras — the latter could otherwise leave a required authorization or
 * permit unsigned (and the bundle reverting on-chain) or apply the wrong signature.
 *
 * @param signatures - The signatures passed to `buildTx`.
 * @param accepts - Which signature kinds this operation consumes.
 * @param accepts.permit - Whether a permit / Permit2 signature is consumed.
 * @param accepts.authorization - Whether a Morpho authorization signature is consumed.
 * @returns The single permit and/or authorization signature, when present.
 * @throws {AmbiguousRequirementSignaturesError} when more than one signature of an accepted kind is present.
 * @throws {UnexpectedRequirementSignatureError} when a signature of a kind the operation does not consume is present.
 * @example
 * ```ts
 * import { selectRequirementSignatures } from "@morpho-org/morpho-sdk";
 *
 * const { permit, authorization } = selectRequirementSignatures(signatures, {
 *   permit: true,
 *   authorization: true,
 * });
 * ```
 */
export function selectRequirementSignatures(
  signatures: readonly RequirementSignature[] | undefined,
  accepts: { permit?: boolean; authorization?: boolean },
): SelectedRequirementSignatures {
  if (signatures == null) return {};

  const permits = signatures.filter(isPermitSignature);
  const authorizations = signatures.filter(isAuthorizationSignature);

  if (!accepts.permit && permits.length > 0)
    throw new UnexpectedRequirementSignatureError("permit");
  if (!accepts.authorization && authorizations.length > 0)
    throw new UnexpectedRequirementSignatureError("authorization");
  if (permits.length > 1)
    throw new AmbiguousRequirementSignaturesError("permit", permits.length);
  if (authorizations.length > 1)
    throw new AmbiguousRequirementSignaturesError(
      "authorization",
      authorizations.length,
    );

  return { permit: permits[0], authorization: authorizations[0] };
}
