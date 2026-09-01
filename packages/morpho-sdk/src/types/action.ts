import type { InputMarketParams } from "@morpho-org/blue-sdk";
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

/** Metadata for a Vault V2 in-kind redemption into Morpho Blue supply positions. */
export interface VaultV2InKindRedeemAction
  extends BaseAction<
    "vaultV2InKindRedeem",
    {
      readonly vault: Address;
      readonly adapter: Address;
      readonly amount: bigint;
      readonly marketParamsList: readonly InputMarketParams[];
      readonly onBehalf: Address;
      readonly deadline: bigint;
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

/** Metadata for a Vault V1 in-kind redemption into Morpho Blue supply positions. */
export interface VaultV1InKindRedeemAction
  extends BaseAction<
    "vaultV1InKindRedeem",
    {
      readonly vault: Address;
      readonly amount: bigint;
      readonly marketParamsList: readonly InputMarketParams[];
      readonly onBehalf: Address;
      readonly deadline: bigint;
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

/** Metadata for a direct BlueBundlesV1 loan-asset supply. */
export interface BlueSupplyAction
  extends BaseAction<
    "blueSupply",
    {
      readonly market: Hex;
      readonly assets: bigint;
      readonly onBehalf: Address;
      readonly nativeAmount?: bigint;
      readonly referralFeePct: bigint;
      readonly referralFeeRecipient: Address;
      readonly deadline: bigint;
    }
  > {}

/** Metadata for a direct BlueBundlesV1 loan-asset withdrawal. */
export interface BlueWithdrawAction
  extends BaseAction<
    "blueWithdraw",
    {
      readonly market: Hex;
      readonly withdrawAssets: bigint;
      readonly withdrawShares: bigint;
      readonly onBehalf: Address;
      readonly reallocations: number;
      readonly reallocationPenaltyAssets: bigint;
      readonly referralFeePct: bigint;
      readonly referralFeeRecipient: Address;
      readonly deadline: bigint;
    }
  > {}

type BlueSupplyCollateralBorrowActionArgs = {
  readonly market: Hex;
  readonly collateralAssets: bigint;
  readonly borrowAssets: bigint;
  readonly maxLtv: bigint;
  readonly onBehalf: Address;
  readonly nativeAmount?: bigint;
  readonly reallocations: number;
  readonly reallocationPenaltyAssets: bigint;
  readonly referralFeePct: bigint;
  readonly referralFeeRecipient: Address;
  readonly deadline: bigint;
};

/** Metadata for a direct BlueBundlesV1 collateral supply. */
export interface BlueSupplyCollateralAction
  extends BaseAction<
    "blueSupplyCollateral",
    BlueSupplyCollateralBorrowActionArgs
  > {}

/** Metadata for a direct BlueBundlesV1 borrow. */
export interface BlueBorrowAction
  extends BaseAction<"blueBorrow", BlueSupplyCollateralBorrowActionArgs> {}

/** Metadata for a direct BlueBundlesV1 collateral-supply and/or borrow. */
export interface BlueSupplyCollateralBorrowAction
  extends BaseAction<
    "blueSupplyCollateralBorrow",
    BlueSupplyCollateralBorrowActionArgs
  > {}

type BlueRepayWithdrawCollateralActionArgs = {
  readonly market: Hex;
  readonly repayAssets: bigint;
  readonly repayShares: bigint;
  readonly maxRepayAssets: bigint;
  readonly collateralAssets: bigint;
  readonly maxLtv: bigint;
  readonly onBehalf: Address;
  readonly nativeAmount?: bigint;
  readonly referralFeePct: bigint;
  readonly referralFeeRecipient: Address;
  readonly deadline: bigint;
};

/** Metadata for a direct BlueBundlesV1 repayment. */
export interface BlueRepayAction
  extends BaseAction<"blueRepay", BlueRepayWithdrawCollateralActionArgs> {}

/** Metadata for a direct BlueBundlesV1 collateral withdrawal. */
export interface BlueWithdrawCollateralAction
  extends BaseAction<
    "blueWithdrawCollateral",
    BlueRepayWithdrawCollateralActionArgs
  > {}

/** Metadata for a direct BlueBundlesV1 repay and/or collateral withdrawal. */
export interface BlueRepayWithdrawCollateralAction
  extends BaseAction<
    "blueRepayWithdrawCollateral",
    BlueRepayWithdrawCollateralActionArgs
  > {}

/** Metadata for a direct BlueBundlesV1 full borrow-position migration. */
export interface BlueRefinanceAction
  extends BaseAction<
    "blueRefinance",
    {
      readonly sourceMarket: Hex;
      readonly destinationMarket: Hex;
      readonly maxLtv: bigint;
      readonly onBehalf: Address;
      readonly reallocations: number;
      /** Loan-token assets donated as BluePublicAllocator V2 penalties. */
      readonly reallocationPenaltyAssets: bigint;
      readonly referralFeePct: bigint;
      readonly referralFeeRecipient: Address;
      readonly deadline: bigint;
    }
  > {}

/**
 * Enforces that exactly one of `assets` / `shares` is provided.
 *
 * - `assets`: operate on an exact asset amount.
 * - `shares`: operate on an exact share count (typical for full position closes,
 *   immune to interest accrual between tx construction and execution).
 *
 * Used by BlueBundlesV1 withdrawal; repayment has its own assets-or-shares union because a pure
 * collateral withdrawal has no repay amount.
 */
export type AssetsOrSharesArgs =
  | { readonly assets: bigint }
  | { readonly shares: bigint };

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
      readonly authorized: Address;
      readonly isAuthorized: boolean;
      readonly onBehalf: Address;
    }
  > {}

/** Metadata for a SetterRatifier ratify-root prerequisite transaction. */
export interface SetterRatifierRatifyRootAction
  extends BaseAction<
    "setterRatifierRatifyRoot",
    {
      readonly maker: Address;
      readonly root: Hex;
      readonly isRootRatified: boolean;
    }
  > {}

/** Metadata for a Midnight bundle that lends into fixed-rate offers. */
export interface MidnightTakeLendAction
  extends BaseAction<
    "midnightTakeLend",
    {
      readonly market: Hex;
      readonly assets: bigint;
      readonly minUnits: bigint;
      readonly taker: Address;
      readonly takeableOffers: number;
      readonly deadline: bigint;
    }
  > {}

/** Metadata for a Midnight bundle that borrows from fixed-rate offers. */
export interface MidnightTakeBorrowAction
  extends BaseAction<
    "midnightTakeBorrow",
    {
      readonly market: Hex;
      readonly loanAssets: bigint;
      readonly maxUnits: bigint;
      readonly taker: Address;
      readonly receiver: Address;
      readonly collateralSupplies: number;
      readonly takeableOffers: number;
      readonly deadline: bigint;
    }
  > {}

/** Metadata for a Midnight bundle that supplies collateral and borrows from fixed-rate offers. */
export interface MidnightSupplyCollateralTakeBorrowAction
  extends BaseAction<
    "midnightSupplyCollateralTakeBorrow",
    {
      readonly market: Hex;
      readonly collateralAssets: bigint;
      readonly loanAssets: bigint;
      readonly maxUnits: bigint;
      readonly taker: Address;
      readonly receiver: Address;
      readonly collateralSupplies: number;
      readonly takeableOffers: number;
      readonly deadline: bigint;
    }
  > {}

/** Metadata for a direct Midnight collateral-supply transaction. */
export interface MidnightSupplyCollateralAction
  extends BaseAction<
    "midnightSupplyCollateral",
    {
      readonly market: Hex;
      readonly collateralIndex: bigint;
      readonly assets: bigint;
      readonly onBehalf: Address;
    }
  > {}

/** Metadata for a Midnight mempool payload submission. */
export interface MempoolSubmitOffersAction
  extends BaseAction<
    "mempoolSubmitOffers",
    {
      readonly groups: readonly Hex[];
      readonly root: Hex;
      readonly maker: Address;
      readonly ratifier: Address;
      readonly ratifierType: "ecrecover" | "setter";
      readonly offers: number;
    }
  > {}

/** Metadata for a direct Midnight credit redemption transaction. */
export interface MidnightRedeemAction
  extends BaseAction<
    "midnightRedeem",
    {
      readonly market: Hex;
      readonly units: bigint;
      readonly onBehalf: Address;
      readonly receiver: Address;
    }
  > {}

/** Metadata for a Midnight bundle that repays credit and/or withdraws collateral. */
export interface MidnightRepayWithdrawCollateralAction
  extends BaseAction<
    "midnightRepayWithdrawCollateral",
    {
      readonly market: Hex;
      readonly repayAssets: bigint;
      readonly collateralWithdrawals: number;
      readonly onBehalf: Address;
      readonly collateralReceiver: Address;
      readonly deadline: bigint;
    }
  > {}

/** Metadata for a direct Midnight offer-cancellation transaction. */
export interface MidnightCancelOfferAction
  extends BaseAction<
    "midnightCancelOffer",
    {
      readonly group: Hex;
      readonly amount: bigint;
      readonly onBehalf: Address;
    }
  > {}

/** Metadata discriminators carried by transactions returned by the SDK. */
export type TransactionAction =
  | ERC20ApprovalAction
  | VaultV2DepositAction
  | VaultV2WithdrawAction
  | VaultV2RedeemAction
  | VaultV2InKindRedeemAction
  | VaultV2ForceWithdrawAction
  | VaultV2ForceRedeemAction
  | VaultV1DepositAction
  | VaultV1WithdrawAction
  | VaultV1RedeemAction
  | VaultV1InKindRedeemAction
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
  | SetterRatifierRatifyRootAction
  | MidnightTakeLendAction
  | MidnightTakeBorrowAction
  | MidnightSupplyCollateralTakeBorrowAction
  | MidnightSupplyCollateralAction
  | MempoolSubmitOffersAction
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

/**
 * Signed Morpho Blue authorization payload produced when an integrator opts into offchain
 * signatures (`supportSignature: true`). Bundler3 consumes it through `setAuthorizationWithSig`;
 * direct BlueBundlesV1 writes encode it into their signed-authorization struct.
 */
export interface AuthorizationSignatureArgs {
  /** Account granting the authorization (the position owner). */
  owner: Address;
  /** Account being authorized to operate on Morpho on the owner's behalf. */
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

/** Signed and encoded Ecrecover offer-root payload used by Midnight maker flows. */
export interface MidnightOfferRootSignatureArgs {
  readonly owner: Address;
  readonly root: Hex;
  readonly signature: Hex;
  readonly payload: Hex;
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

/** Signable Permit2 SignatureTransfer requirement for a direct BlueBundlesV1 pull. */
export interface Permit2TransferFromAction
  extends BaseAction<
    "permit2TransferFrom",
    {
      readonly spender: Address;
      readonly amount: bigint;
      readonly deadline: bigint;
    }
  > {}

/**
 * Signable Morpho authorization requirement. Its `authorized` operator is route-specific:
 * GeneralAdapter1 for Bundler3 flows or BlueBundlesV1 for direct Blue writes.
 */
export interface AuthorizationAction
  extends BaseAction<
    "authorization",
    { authorized: Address; isAuthorized: boolean; deadline: bigint }
  > {}

/** Metadata for a Midnight offer-root signature request. */
export interface MidnightOfferRootSignatureAction
  extends BaseAction<
    "midnightOfferRootSignature",
    {
      readonly root: Hex;
      readonly ratifier: Address;
      readonly offers: number;
    }
  > {}

/** Action metadata supported by signature requirements. */
export type SignatureRequirementAction =
  | PermitAction
  | Permit2Action
  | Permit2TransferFromAction
  | AuthorizationAction
  | MidnightOfferRootSignatureAction;

/** Argument payloads returned by signature requirements. */
export type RequirementSignatureArgs =
  | PermitArgs
  | Permit2Args
  | AuthorizationSignatureArgs
  | MidnightOfferRootSignatureArgs;

/** A signed ERC-2612 permit requirement. */
export interface Erc2612RequirementSignature {
  args: PermitArgs;
  action: PermitAction;
}

/** A signed Permit2 AllowanceTransfer requirement used by Bundler3. */
export interface Permit2AllowanceRequirementSignature {
  args: Permit2Args;
  action: Permit2Action;
}

/** A signed ERC-2612 permit or Permit2 AllowanceTransfer requirement. */
export type PermitRequirementSignature =
  | Erc2612RequirementSignature
  | Permit2AllowanceRequirementSignature;

/** A signed Permit2 SignatureTransfer requirement used by BlueBundlesV1. */
export interface Permit2TransferFromRequirementSignature {
  readonly args: Readonly<PermitArgs>;
  readonly action: Permit2TransferFromAction;
}

/** A signed Morpho authorization consumed by Bundler3 or a direct BlueBundlesV1 call. */
export interface AuthorizationRequirementSignature {
  args: AuthorizationSignatureArgs;
  action: AuthorizationAction;
}

/** A signed Midnight Ecrecover offer-root requirement. */
export interface MidnightOfferRootSignature {
  readonly args: MidnightOfferRootSignatureArgs;
  readonly action: MidnightOfferRootSignatureAction;
}

/**
 * The deep-frozen output of `Requirement.sign()`. Discriminated on `action.type`:
 * `"permit"` / `"permit2"` carry token-approval args, `"permit2TransferFrom"` carries a
 * BlueBundlesV1 SignatureTransfer, `"authorization"` carries the signed Morpho authorization,
 * and Midnight adds `"midnightOfferRootSignature"`.
 */
export type RequirementSignature<
  TAction extends SignatureRequirementAction | undefined = undefined,
  TArgs extends RequirementSignatureArgs | undefined = undefined,
> = TAction extends SignatureRequirementAction
  ? TArgs extends RequirementSignatureArgs
    ? {
        args: TArgs;
        action: TAction;
      }
    : never
  :
      | PermitRequirementSignature
      | Permit2TransferFromRequirementSignature
      | AuthorizationRequirementSignature
      | MidnightOfferRootSignature;

type RequirementResult<
  TSignatureOrAction extends RequirementSignature | SignatureRequirementAction,
  TArgs extends RequirementSignatureArgs | undefined,
> = TSignatureOrAction extends SignatureRequirementAction
  ? RequirementSignature<
      TSignatureOrAction,
      Extract<TArgs, RequirementSignatureArgs>
    >
  : Extract<TSignatureOrAction, RequirementSignature>;

/**
 * A signable approval / authorization requirement. `sign()` returns the matching
 * {@link RequirementSignature}; `action` describes the requirement without signing.
 *
 * Generic over the signature it produces so permit encoders narrow to
 * {@link PermitRequirementSignature} and the authorization encoder to
 * {@link AuthorizationRequirementSignature}; the two-parameter form is kept for
 * Midnight action requirements that are parameterized by action and args.
 */
export interface Requirement<
  TSignatureOrAction extends
    | RequirementSignature
    | SignatureRequirementAction = RequirementSignature,
  TArgs extends RequirementSignatureArgs | undefined = undefined,
> {
  sign: (
    client: WalletClient,
    userAddress: Address,
  ) => Promise<RequirementResult<TSignatureOrAction, TArgs>>;
  action: RequirementResult<TSignatureOrAction, TArgs>["action"];
}

/** Bundler3 token signature requirement. */
export type Bundler3TokenSignatureRequirement =
  Requirement<PermitRequirementSignature>;

/** BlueBundlesV1 ERC-2612 or Permit2 SignatureTransfer requirement. */
export type BlueBundlesV1TokenSignatureRequirement =
  Requirement<BlueBundlesV1TokenRequirementSignature>;

/** Midnight Ecrecover offer-root signature requirement. */
export type MidnightOfferRootRequirement = Requirement<
  MidnightOfferRootSignatureAction,
  MidnightOfferRootSignatureArgs
>;

/** Any token signature requirement supported by an SDK transaction route. */
export type TokenSignatureRequirement =
  | Bundler3TokenSignatureRequirement
  | BlueBundlesV1TokenSignatureRequirement;

/** Bundler3 token signature result. */
export type Bundler3TokenRequirementSignature = PermitRequirementSignature;

/** BlueBundlesV1 token signature result. */
export type BlueBundlesV1TokenRequirementSignature =
  | Erc2612RequirementSignature
  | Permit2TransferFromRequirementSignature;

/** Any token signature result supported by an SDK transaction route. */
export type TokenRequirementSignature =
  | Bundler3TokenRequirementSignature
  | BlueBundlesV1TokenRequirementSignature;

/** Any signature result returned by an action-output signature requirement. */
export type AnyRequirementSignature =
  | TokenRequirementSignature
  | AuthorizationRequirementSignature
  | MidnightOfferRootSignature;

/** Any signature requirement returned by an entity action output. */
export type SignatureRequirement =
  | TokenSignatureRequirement
  | MidnightOfferRootRequirement
  | Requirement<AuthorizationRequirementSignature>;

/** Call action metadata that can appear as an action prerequisite. */
export type CallRequirementAction =
  | ERC20ApprovalAction
  | BlueAuthorizationAction
  | MidnightAuthorizationAction
  | SetterRatifierRatifyRootAction
  | MidnightSupplyCollateralAction;

/** Onchain call prerequisite returned by action-output `getRequirements()`. */
export type CallRequirement = Readonly<Transaction<CallRequirementAction>>;

/** Onchain call or signature prerequisite returned by an entity action output. */
export type ActionRequirement = CallRequirement | SignatureRequirement;

/** Optional controls used while resolving action prerequisites. */
interface ActionRequirementsParams {
  /**
   * Prefer the ERC-2612 simple-permit path when the SDK detects support.
   * Leave unset or set to `false` to force the Permit2/classic approval fallback when
   * a token is known to be incompatible despite passing the SDK's shallow nonce probe.
   */
  readonly useSimplePermit?: boolean;
}

/** Lazy entity result exposing prerequisite resolution and synchronous transaction building. */
export interface ActionOutput<
  TAction extends BaseAction = TransactionAction,
  TSignatures = RequirementSignature,
  TRequirementsParams = ActionRequirementsParams,
> {
  readonly buildTx: (
    signatures?: TSignatures,
  ) => Readonly<Transaction<TAction>>;
  readonly getRequirements: (
    params?: TRequirementsParams,
  ) => Promise<readonly ActionRequirement[]>;
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

/** Checks whether an action requirement is a Blue authorization call. */
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

export function isRequirementSignature<
  T extends RequirementSignature = RequirementSignature,
>(
  requirement: CallRequirement | Requirement<T> | undefined,
): requirement is Requirement<T>;
export function isRequirementSignature(
  requirement: CallRequirement | Requirement | undefined,
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
 * Narrows a {@link RequirementSignature} to a Permit2 SignatureTransfer result.
 *
 * @param signature - The signed requirement to test.
 * @returns `true` when `signature.action.type` is `"permit2TransferFrom"`.
 * @example
 * ```ts
 * import {
 *   isPermit2TransferFromSignature,
 *   type RequirementSignature,
 * } from "@morpho-org/morpho-sdk";
 *
 * const getPermit2Nonce = (signature: RequirementSignature): bigint | undefined =>
 *   isPermit2TransferFromSignature(signature) ? signature.args.nonce : undefined;
 * ```
 */
export function isPermit2TransferFromSignature(
  signature: RequirementSignature,
): signature is Permit2TransferFromRequirementSignature {
  return signature.action.type === "permit2TransferFrom";
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

/**
 * Narrows a {@link RequirementSignature} to a Midnight offer-root signature.
 *
 * @param signature - The signed requirement to test.
 * @returns `true` when `signature.action.type` is `"midnightOfferRootSignature"`.
 */
export function isMidnightOfferRootSignature(
  signature: RequirementSignature,
): signature is MidnightOfferRootSignature {
  return signature.action.type === "midnightOfferRootSignature";
}

/** The typed requirement-signature slots a transaction builder consumes, split from a `buildTx` array. */
export interface SelectedRequirementSignatures {
  /** The single ERC-2612 or Permit2 AllowanceTransfer signature, when present. */
  permit?: PermitRequirementSignature;
  /** The single Permit2 SignatureTransfer signature, when present. */
  permit2TransferFrom?: Permit2TransferFromRequirementSignature;
  /** The single Morpho authorization signature, when present. */
  authorization?: AuthorizationRequirementSignature;
  /** The single Midnight offer-root signature, when present. */
  midnightOfferRoot?: MidnightOfferRootSignature;
}

/**
 * Splits a `buildTx` signature array into its typed requirement-signature slots, rejecting
 * ambiguous or unexpected input so a path never silently consumes the wrong signature.
 *
 * A bundled path consumes at most one signature of each accepted kind. Passing several of the same
 * kind, or a kind the path does not consume, is rejected with a typed error rather than silently
 * dropping the extras — the latter could otherwise leave a required authorization or permit
 * unsigned (and the bundle reverting on-chain) or apply the wrong signature.
 *
 * @param signatures - The signatures passed to `buildTx`.
 * @param accepts - Which signature kinds this operation consumes.
 * @param accepts.permit - Whether an ERC-2612 or Permit2 AllowanceTransfer signature is consumed.
 * @param accepts.permit2TransferFrom - Whether a Permit2 SignatureTransfer is consumed.
 * @param accepts.authorization - Whether a Morpho authorization signature is consumed.
 * @param accepts.midnightOfferRoot - Whether a Midnight offer-root signature is consumed.
 * @returns The accepted signature in each typed slot, when present.
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
  accepts: {
    permit?: boolean;
    permit2TransferFrom?: boolean;
    authorization?: boolean;
    midnightOfferRoot?: boolean;
  },
): SelectedRequirementSignatures {
  if (signatures == null) return {};

  const permits = signatures.filter(isPermitSignature);
  const permit2Transfers = signatures.filter(isPermit2TransferFromSignature);
  const authorizations = signatures.filter(isAuthorizationSignature);
  const midnightOfferRoots = signatures.filter(isMidnightOfferRootSignature);

  if (!accepts.permit && permits.length > 0)
    throw new UnexpectedRequirementSignatureError("permit");
  if (!accepts.permit2TransferFrom && permit2Transfers.length > 0)
    throw new UnexpectedRequirementSignatureError("permit2TransferFrom");
  if (!accepts.authorization && authorizations.length > 0)
    throw new UnexpectedRequirementSignatureError("authorization");
  if (!accepts.midnightOfferRoot && midnightOfferRoots.length > 0)
    throw new UnexpectedRequirementSignatureError("midnightOfferRootSignature");
  if (permits.length > 1)
    throw new AmbiguousRequirementSignaturesError("permit", permits.length);
  if (permit2Transfers.length > 1)
    throw new AmbiguousRequirementSignaturesError(
      "permit2TransferFrom",
      permit2Transfers.length,
    );
  if (authorizations.length > 1)
    throw new AmbiguousRequirementSignaturesError(
      "authorization",
      authorizations.length,
    );
  if (midnightOfferRoots.length > 1)
    throw new AmbiguousRequirementSignaturesError(
      "midnightOfferRootSignature",
      midnightOfferRoots.length,
    );

  return {
    permit: permits[0],
    permit2TransferFrom: permit2Transfers[0],
    authorization: authorizations[0],
    midnightOfferRoot: midnightOfferRoots[0],
  };
}
