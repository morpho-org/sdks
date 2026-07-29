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
 * `blueRepayWithdrawCollateral`) — a flat, pre-resolved shape. The entity layer
 * ({@link RepayAmountArgs}) derives these from live market state; the action does no
 * amount arithmetic. The mode is discriminated on `shares`:
 *
 * - **assets mode** (`shares` unset/`0n`): repays `transferAmount` assets
 *   (`= amount + nativeAmount`, additive like `blueSupply`), pulling `amount` ERC-20
 *   and wrapping `nativeAmount`. No residual.
 * - **shares mode** (`shares > 0n`): repays an exact borrow-share count (full close),
 *   pulling `transferAmount` ERC-20 (already net of native) and wrapping `nativeAmount`;
 *   the residual loan token is skimmed back to `receiver`.
 *
 * `nativeAmount` requires the market's loan token to be the chain's wNative.
 */
export interface RepayActionAmountArgs {
  /** Assets-mode ERC-20 loan tokens pulled from the payer. Omit (or `0n`) in shares mode. */
  amount?: bigint;
  /** Shares-mode borrow shares to repay (full close). Omit (or `0n`) in assets mode. */
  shares?: bigint;
  /** Native ETH wrapped into wNative to help fund the repay. Loan token must be wNative. */
  nativeAmount?: bigint;
  /**
   * Loan tokens routed into `GeneralAdapter1`. Assets mode: the total repaid
   * (`amount + nativeAmount`). Shares mode: the ERC-20 pulled
   * (`toBorrowAssets(shares) − nativeAmount`).
   */
  transferAmount: bigint;
}

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

/**
 * Signable Morpho authorization requirement. Emitted by the entity layer when a bundled path
 * needs GeneralAdapter1 authorized and the client opts into offchain signatures.
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
  | AuthorizationAction
  | MidnightOfferRootSignatureAction;

/** Argument payloads returned by signature requirements. */
export type RequirementSignatureArgs =
  | PermitArgs
  | Permit2Args
  | AuthorizationSignatureArgs
  | MidnightOfferRootSignatureArgs;

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

/** A signed Midnight Ecrecover offer-root requirement. */
export interface MidnightOfferRootSignature {
  readonly args: MidnightOfferRootSignatureArgs;
  readonly action: MidnightOfferRootSignatureAction;
}

/**
 * The deep-frozen output of `Requirement.sign()`. Discriminated on `action.type`:
 * `"permit"` / `"permit2"` carry Bundler3 token-approval args, `"authorization"` carries the
 * signed Morpho authorization, and Midnight adds `"midnightOfferRootSignature"`.
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

/** Midnight Ecrecover offer-root signature requirement. */
export type MidnightOfferRootRequirement = Requirement<
  MidnightOfferRootSignatureAction,
  MidnightOfferRootSignatureArgs
>;

/** Permit or Permit2 token signature requirement. */
export type TokenSignatureRequirement = Bundler3TokenSignatureRequirement;

/** Bundler3 token signature result. */
export type Bundler3TokenRequirementSignature = PermitRequirementSignature;

/** Permit or Permit2 token signature result. */
export type TokenRequirementSignature = Bundler3TokenRequirementSignature;

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
  /** The single permit / Permit2 signature, when present. */
  permit?: PermitRequirementSignature;
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
 * @param accepts.permit - Whether a permit / Permit2 signature is consumed.
 * @param accepts.authorization - Whether a Morpho authorization signature is consumed.
 * @param accepts.midnightOfferRoot - Whether a Midnight offer-root signature is consumed.
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
  accepts: {
    permit?: boolean;
    authorization?: boolean;
    midnightOfferRoot?: boolean;
  },
): SelectedRequirementSignatures {
  if (signatures == null) return {};

  const permits = signatures.filter(isPermitSignature);
  const authorizations = signatures.filter(isAuthorizationSignature);
  const midnightOfferRoots = signatures.filter(isMidnightOfferRootSignature);

  if (!accepts.permit && permits.length > 0)
    throw new UnexpectedRequirementSignatureError("permit");
  if (!accepts.authorization && authorizations.length > 0)
    throw new UnexpectedRequirementSignatureError("authorization");
  if (!accepts.midnightOfferRoot && midnightOfferRoots.length > 0)
    throw new UnexpectedRequirementSignatureError("midnightOfferRootSignature");
  if (permits.length > 1)
    throw new AmbiguousRequirementSignaturesError("permit", permits.length);
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
    authorization: authorizations[0],
    midnightOfferRoot: midnightOfferRoots[0],
  };
}
