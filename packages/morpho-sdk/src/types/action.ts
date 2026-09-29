import type { InputMarketParams } from "@morpho-org/blue-sdk";
import type { Address, Hex, TypedDataDefinition, WalletClient } from "viem";
import type { Deallocation } from "./deallocation.js";
import {
  AmbiguousRequirementSignaturesError,
  UnexpectedRequirementSignatureError,
  UnsupportedRequirementSignatureError,
} from "./error.js";

/**
 * Serves as the common discriminated action-metadata base shared by both
 * {@link TransactionAction} (actions that carry encoded calldata) and
 * {@link SignatureRequirementAction} (signature requirements whose metadata is
 * exposed before any calldata exists). Each concrete action narrows
 * {@link BaseAction} on its literal `type` tag and carries an
 * operation-specific `args` record surfaced for tracing.
 *
 * @typeParam TType - Literal discriminator identifying the action.
 * @typeParam TArgs - The action's argument record.
 */
export interface BaseAction<
  TType extends string = string,
  TArgs extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly type: TType;
  readonly args: TArgs;
}

/** Metadata for an ERC-20 `approve` call granting `spender` an `amount` allowance. */
export interface ERC20ApprovalAction
  extends BaseAction<"erc20Approval", { spender: Address; amount: bigint }> {}

/** Metadata for an ERC-2612 permit signature requirement, exposing only the `sign` callback. */
export interface ERC20PermitAction {
  sign: (client: WalletClient, userAddress: Address) => Promise<Hex>;
}

/** Metadata for a direct Vault V2 deposit through VaultBundlesV1. */
export interface VaultV2DepositAction
  extends BaseAction<
    "vaultV2Deposit",
    {
      /** Destination vault receiving net assets; shares are minted to the transaction sender. */
      readonly vault: Address;
      /** Gross funding in asset base units, for either ERC-20 or native funding, before fees. */
      readonly amount: bigint;
      /** Maximum asset/share ratio scaled by 1e27, computed from net assets through the deadline. */
      readonly maxSharePrice: bigint;
      /** Native funding marker: equals `amount` and transaction `value` on native deposits; otherwise undefined. */
      readonly nativeAmount?: bigint;
      /** Referral fee fraction scaled by WAD (1e18); zero disables the fee. */
      readonly referralFeePct: bigint;
      /** Recipient of the referral fee; zero address when the fee is disabled by default. */
      readonly referralFeeRecipient: Address;
      /** Fee in asset base units: floor(amount * referralFeePct / WAD). */
      readonly referralFeeAssets: bigint;
      /** Assets deposited into the vault: amount minus referralFeeAssets. */
      readonly netAssets: bigint;
      /** Execution and token-permit expiration as a Unix timestamp in seconds. */
      readonly deadline: bigint;
    }
  > {}

/** Metadata for an exact-assets Vault V2 withdrawal through VaultBundlesV1. */
export interface VaultV2WithdrawAction
  extends BaseAction<
    "vaultV2Withdraw",
    {
      /** Source vault whose shares are burned from the transaction sender. */
      readonly vault: Address;
      /** Gross withdrawal in asset base units, before the referral fee is deducted. */
      readonly amount: bigint;
      /** Referral fee fraction scaled by WAD (1e18); zero disables the fee. */
      readonly referralFeePct: bigint;
      /** Recipient of the referral fee; zero address when the fee is disabled by default. */
      readonly referralFeeRecipient: Address;
      /** Fee in asset base units: floor(amount * referralFeePct / WAD). */
      readonly referralFeeAssets: bigint;
      /** Assets received by the transaction sender: amount minus referralFeeAssets. */
      readonly netAssets: bigint;
      /** Execution and share-permit expiration as a Unix timestamp in seconds. */
      readonly deadline: bigint;
    }
  > {}

/** Metadata for an exact-shares Vault V2 redemption through VaultBundlesV1. */
export interface VaultV2RedeemAction
  extends BaseAction<
    "vaultV2Redeem",
    {
      /** Source vault whose shares are burned from the transaction sender. */
      readonly vault: Address;
      /** Exact shares to burn, in vault-share base units. */
      readonly shares: bigint;
      /** Referral fee fraction scaled by WAD (1e18), deducted from redeemed assets; zero disables it. */
      readonly referralFeePct: bigint;
      /** Recipient of the referral fee; zero address when the fee is disabled by default. */
      readonly referralFeeRecipient: Address;
      /** Execution and share-permit expiration as a Unix timestamp in seconds. */
      readonly deadline: bigint;
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

/**
 * Metadata for a Vault V2 force withdrawal through VaultExitBundlesV1.
 *
 * `exitAssets` is penalty-inclusive: the assets actually delivered are
 * `assetsToWithdraw + floor((exitAssets - assetsToWithdraw) * WAD / (WAD + penalty))`, minus the
 * referral fee.
 */
export interface VaultV2ForceWithdrawAction
  extends BaseAction<
    "vaultV2ForceWithdraw",
    {
      readonly vault: Address;
      readonly adapter: Address;
      readonly exitAssets: bigint;
      readonly minSharePriceE27: bigint;
      readonly referralFeePct: bigint;
      readonly referralFeeRecipient: Address;
      readonly onBehalf: Address;
      readonly deadline: bigint;
    }
  > {}

/** Metadata for a Vault V2 force redeem executed through the vault's native multicall. */
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

/** Metadata for a direct Vault V1 deposit through VaultBundlesV1. */
export interface VaultV1DepositAction
  extends BaseAction<
    "vaultV1Deposit",
    {
      /** Destination vault receiving net assets; shares are minted to the transaction sender. */
      readonly vault: Address;
      /** Gross funding in asset base units, for either ERC-20 or native funding, before fees. */
      readonly amount: bigint;
      /** Maximum asset/share ratio scaled by 1e27, computed from net assets through the deadline. */
      readonly maxSharePrice: bigint;
      /** Native funding marker: equals `amount` and transaction `value` on native deposits; otherwise undefined. */
      readonly nativeAmount?: bigint;
      /** Referral fee fraction scaled by WAD (1e18); zero disables the fee. */
      readonly referralFeePct: bigint;
      /** Recipient of the referral fee; zero address when the fee is disabled by default. */
      readonly referralFeeRecipient: Address;
      /** Fee in asset base units: floor(amount * referralFeePct / WAD). */
      readonly referralFeeAssets: bigint;
      /** Assets deposited into the vault: amount minus referralFeeAssets. */
      readonly netAssets: bigint;
      /** Execution and token-permit expiration as a Unix timestamp in seconds. */
      readonly deadline: bigint;
    }
  > {}

/** Metadata for an exact-assets Vault V1 withdrawal through VaultBundlesV1. */
export interface VaultV1WithdrawAction
  extends BaseAction<
    "vaultV1Withdraw",
    {
      /** Source vault whose shares are burned from the transaction sender. */
      readonly vault: Address;
      /** Gross withdrawal in asset base units, before the referral fee is deducted. */
      readonly amount: bigint;
      /** Referral fee fraction scaled by WAD (1e18); zero disables the fee. */
      readonly referralFeePct: bigint;
      /** Recipient of the referral fee; zero address when the fee is disabled by default. */
      readonly referralFeeRecipient: Address;
      /** Fee in asset base units: floor(amount * referralFeePct / WAD). */
      readonly referralFeeAssets: bigint;
      /** Assets received by the transaction sender: amount minus referralFeeAssets. */
      readonly netAssets: bigint;
      /** Execution and share-permit expiration as a Unix timestamp in seconds. */
      readonly deadline: bigint;
    }
  > {}

/** Metadata for an exact-shares Vault V1 redemption through VaultBundlesV1. */
export interface VaultV1RedeemAction
  extends BaseAction<
    "vaultV1Redeem",
    {
      /** Source vault whose shares are burned from the transaction sender. */
      readonly vault: Address;
      /** Exact shares to burn, in vault-share base units. */
      readonly shares: bigint;
      /** Referral fee fraction scaled by WAD (1e18), deducted from redeemed assets; zero disables it. */
      readonly referralFeePct: bigint;
      /** Recipient of the referral fee; zero address when the fee is disabled by default. */
      readonly referralFeeRecipient: Address;
      /** Execution and share-permit expiration as a Unix timestamp in seconds. */
      readonly deadline: bigint;
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

/** Metadata for an assets-or-shares Vault V1 to Vault V2 migration through VaultBundlesV1. */
export interface VaultV1MigrateToV2Action
  extends BaseAction<
    "vaultV1MigrateToV2",
    {
      /** Source Vault V1 whose shares are burned from the transaction sender. */
      readonly sourceVault: Address;
      /** Destination Vault V2 receiving net assets; shares are minted to the transaction sender. */
      readonly targetVault: Address;
      /** Gross assets to withdraw in asset base units; zero in exact-shares mode. */
      readonly assets: bigint;
      /** Source shares to burn in vault-share base units; zero in exact-assets mode. */
      readonly shares: bigint;
      /** Maximum destination asset base units per share base unit, scaled by RAY (1e27). */
      readonly maxSharePriceVaultV2: bigint;
      /** Referral fee fraction scaled by WAD (1e18), deducted before depositing; zero disables it. */
      readonly referralFeePct: bigint;
      /** Recipient of the referral fee; zero address when the fee is disabled by default. */
      readonly referralFeeRecipient: Address;
      /** Fee in asset base units: floor(assets * referralFeePct / WAD); omitted in exact-shares mode. */
      readonly referralFeeAssets?: bigint;
      /** Assets deposited: assets minus referralFeeAssets; omitted in exact-shares mode. */
      readonly netAssets?: bigint;
      /** Execution and source share-permit expiration as a Unix timestamp in seconds. */
      readonly deadline: bigint;
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

/**
 * Enumerates every action a {@link Transaction} can describe across the VaultV1,
 * VaultV2, Blue, and Midnight flows. The `type` tag discriminates the union so
 * consumers can `switch` exhaustively on it.
 */
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
  | BlueSupplyCollateralAction
  | BlueBorrowAction
  | BlueSupplyCollateralBorrowAction
  | BlueRepayAction
  | BlueWithdrawCollateralAction
  | BlueRepayWithdrawCollateralAction
  | BlueWithdrawAction
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

/**
 * Describes a single, immutable, deep-frozen transaction to submit on-chain:
 * the target `to`, native `value`, encoded call `data`, and the originating
 * {@link BaseAction} for tracing. Every action builder returns one.
 *
 * @typeParam TAction - The action that produced this transaction.
 */
export interface Transaction<TAction extends BaseAction = TransactionAction> {
  readonly to: Address;
  readonly value: bigint;
  readonly data: Hex;
  readonly action: TAction;
}

/** Mutually exclusive ERC-20 or native funding accepted by fixed bundles entrypoints. */
export type BundlesFundingArgs =
  | { readonly amount: bigint; readonly nativeAmount?: never }
  | { readonly nativeAmount: bigint; readonly amount?: never };

/** Controls token requirements generated for a bundles-funded action. */
export interface BundlesTokenRequirementsOptions {
  /** Prefer ERC-2612 when the funded token exposes a compatible nonce. */
  readonly useSimplePermit?: boolean;
  /** Explicit unused Permit2 SignatureTransfer unordered nonce; defaults to the lowest unused nonce. */
  readonly permit2Nonce?: bigint;
}

/** Mutually exclusive source amount accepted by a Vault V1 to Vault V2 migration. */
export type VaultV1MigrateToV2AmountArgs =
  | { readonly shares: bigint; readonly assets?: never }
  | { readonly assets: bigint; readonly shares?: never };

/**
 * Holds the pre-resolved arguments for an ERC-2612 `permit`: the signed approval
 * of `amount` of `asset` from `owner` to the permitted spender, bounded by the
 * `deadline` timestamp and consuming the given `nonce`. The associated
 * {@link PermitAction} identifies the permitted fixed-bundle contract.
 */
export interface PermitArgs {
  readonly owner: Address;
  readonly nonce: bigint;
  readonly asset: Address;
  readonly signature: Hex;
  readonly amount: bigint;
  readonly deadline: bigint;
}

/**
 * Signed Morpho Blue authorization payload produced when an integrator opts into offchain
 * signatures (`supportSignature: true`). BlueBundlesV1 encodes it into its
 * signed-authorization struct.
 */
export interface AuthorizationSignatureArgs {
  /** Account granting the authorization (the position owner). */
  readonly owner: Address;
  /** Account being authorized to operate on Morpho on the owner's behalf. */
  readonly authorized: Address;
  /** Whether the authorization is granted (`true`) or revoked (`false`). */
  readonly isAuthorized: boolean;
  /** Morpho authorization nonce consumed by the signature. */
  readonly nonce: bigint;
  /** Signature deadline timestamp in seconds. */
  readonly deadline: bigint;
  /** EIP-712 signature over the Morpho `Authorization` typed data. */
  readonly signature: Hex;
}

/** Signed and encoded Ecrecover offer-root payload used by Midnight maker flows. */
export interface MidnightOfferRootSignatureArgs {
  readonly owner: Address;
  readonly root: Hex;
  readonly signature: Hex;
  readonly payload: Hex;
}

/** EIP-712 payload carried by a signable requirement action. */
export type RequirementTypedData = TypedDataDefinition<
  Record<string, unknown>,
  string
>;

/** Signable ERC-2612 permit requirement for a fixed-bundles token pull. */
export interface PermitAction
  extends BaseAction<
    "permit",
    {
      readonly spender: Address;
      readonly amount: bigint;
      readonly deadline: bigint;
      /** Permit nonce captured by a prepared requirement, when available. */
      readonly nonce?: bigint;
    }
  > {
  /**
   * EIP-712 payload `sign()` signs for this permit, exposed so it can be inspected or displayed
   * before signing. Required on {@link Requirement.action}; optional here only so hand-built action
   * metadata (e.g. test fixtures) need not supply it. The payload is deep-frozen and `sign()` signs
   * this exact payload.
   */
  readonly typedData?: RequirementTypedData;
}

/** Signable Permit2 SignatureTransfer requirement for a fixed bundles token pull. */
export interface Permit2SignatureTransferAction
  extends BaseAction<
    "permit2SignatureTransfer",
    {
      readonly spender: Address;
      readonly amount: bigint;
      readonly nonce: bigint;
      readonly deadline: bigint;
    }
  > {
  /** EIP-712 payload to sign for this Permit2 SignatureTransfer. See {@link PermitAction.typedData}. */
  readonly typedData?: RequirementTypedData;
}

/**
 * Signable Morpho authorization requirement for direct BlueBundlesV1 writes.
 */
export interface AuthorizationAction
  extends BaseAction<
    "authorization",
    { authorized: Address; isAuthorized: boolean; deadline: bigint }
  > {
  /** EIP-712 payload to sign for this Morpho authorization. See {@link PermitAction.typedData}. */
  readonly typedData?: RequirementTypedData;
}

/** Metadata for a Midnight offer-root signature request. */
export interface MidnightOfferRootSignatureAction
  extends BaseAction<
    "midnightOfferRootSignature",
    {
      readonly root: Hex;
      readonly ratifier: Address;
      readonly offers: number;
    }
  > {
  /**
   * EIP-712 offer-tree payload `sign()` signs for this Midnight ratification, exposed so it can be
   * inspected or displayed before signing. See {@link PermitAction.typedData}.
   *
   * A bare signature over this payload is not enough to build the submit-offers transaction:
   * `sign()` also derives the ratification payload (`MidnightOfferRootSignature.args.payload`) that
   * `buildTx()` submits to the mempool.
   */
  readonly typedData?: RequirementTypedData;
}

/** Action metadata supported by signature requirements. */
export type SignatureRequirementAction =
  | PermitAction
  | Permit2SignatureTransferAction
  | AuthorizationAction
  | MidnightOfferRootSignatureAction;

/** Argument payloads returned by signature requirements. */
export type RequirementSignatureArgs =
  | PermitArgs
  | AuthorizationSignatureArgs
  | MidnightOfferRootSignatureArgs;

/** A signed ERC-2612 permit requirement. */
export interface Erc2612RequirementSignature {
  readonly args: Readonly<PermitArgs>;
  readonly action: PermitAction;
}

/** A signed ERC-2612 permit requirement accepted by vault-share bundle calls. */
export type PermitRequirementSignature = Erc2612RequirementSignature;

/** A signed Permit2 SignatureTransfer requirement used by fixed bundles contracts. */
export interface Permit2SignatureTransferRequirementSignature {
  readonly args: Readonly<PermitArgs>;
  readonly action: Permit2SignatureTransferAction;
}

/** A signed Morpho authorization consumed by a direct BlueBundlesV1 call. */
export interface AuthorizationRequirementSignature {
  readonly args: AuthorizationSignatureArgs;
  readonly action: AuthorizationAction;
}

/** A signed Midnight Ecrecover offer-root requirement. */
export interface MidnightOfferRootSignature {
  readonly args: MidnightOfferRootSignatureArgs;
  readonly action: MidnightOfferRootSignatureAction;
}

/**
 * The deep-frozen output of `Requirement.sign()`. Discriminated on `action.type`:
 * `"permit"` carries token-approval args, `"permit2SignatureTransfer"` carries a
 * bundles SignatureTransfer, `"authorization"` carries the signed Morpho authorization,
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
      | Permit2SignatureTransferRequirementSignature
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
 * {@link RequirementSignature}; `action` describes the requirement without signing and carries the
 * EIP-712 `typedData` payload so an integrator can inspect or display it before signing.
 *
 * Generic over the signature it produces so permit encoders narrow to
 * {@link PermitRequirementSignature} and the authorization encoder to
 * {@link AuthorizationRequirementSignature}; the two-parameter form is kept for
 * Midnight action requirements that are parameterized by action and args.
 *
 * @example
 * ```ts
 * const requirement = (await output.getRequirements()).find(isRequirementSignature);
 * if (requirement == null) return; // nothing to sign (only on-chain approvals, or none)
 *
 * const typedData = requirement.action.typedData; // exact EIP-712 payload `sign()` will sign
 * const signed = await requirement.sign(walletClient, owner);
 * const tx = output.buildTx([signed]); // Midnight outputs take the single signature instead
 * ```
 */
export interface Requirement<
  TSignatureOrAction extends
    | RequirementSignature
    | SignatureRequirementAction = RequirementSignature,
  TArgs extends RequirementSignatureArgs | undefined = undefined,
> {
  /** Signs `action.typedData` with `client`, verifies the signature recovers `userAddress`, and returns the signed requirement. */
  readonly sign: (
    client: WalletClient,
    userAddress: Address,
  ) => Promise<RequirementResult<TSignatureOrAction, TArgs>>;
  /** Requirement metadata; `typedData` is always populated on SDK-built requirements. */
  readonly action: RequirementResult<TSignatureOrAction, TArgs>["action"] & {
    readonly typedData: RequirementTypedData;
  };
}

/** ERC-2612 or Permit2 SignatureTransfer requirement consumed by a fixed bundles contract. */
export type BundlesTokenSignatureRequirement =
  Requirement<BundlesTokenRequirementSignature>;

/** Midnight Ecrecover offer-root signature requirement. */
export type MidnightOfferRootRequirement = Requirement<
  MidnightOfferRootSignatureAction,
  MidnightOfferRootSignatureArgs
>;

/** Any token signature requirement supported by an SDK transaction route. */
export type TokenSignatureRequirement = BundlesTokenSignatureRequirement;

/** Token signature result consumed by a fixed bundles contract. */
export type BundlesTokenRequirementSignature =
  | Erc2612RequirementSignature
  | Permit2SignatureTransferRequirementSignature;

/** Any token signature result supported by an SDK transaction route. */
export type TokenRequirementSignature = BundlesTokenRequirementSignature;

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

/**
 * Narrows an action requirement to a signature requirement.
 *
 * A signature requirement exposes a `sign` callback; call requirements are plain transactions.
 *
 * @param requirement - The requirement returned by `getRequirements()` to test.
 * @returns `true` when `requirement` carries a `sign` function.
 * @example
 * ```ts
 * import { isRequirementSignature } from "@morpho-org/morpho-sdk";
 *
 * for (const requirement of await handle.getRequirements()) {
 *   if (isRequirementSignature(requirement)) {
 *     signatures.push(await requirement.sign(walletClient, userAddress));
 *   } else {
 *     const hash = await walletClient.sendTransaction(requirement);
 *     await client.waitForTransactionReceipt({ hash });
 *   }
 * }
 * ```
 */
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
 * Narrows a {@link RequirementSignature} to an ERC-2612 permit signature.
 *
 * @param signature - The signed requirement to test.
 * @returns `true` when `signature.action.type` is `"permit"`.
 * @example
 * ```ts
 * import {
 *   isPermitSignature,
 *   type RequirementSignature,
 * } from "@morpho-org/morpho-sdk";
 *
 * const getPermitDeadline = (signature: RequirementSignature): bigint | undefined =>
 *   isPermitSignature(signature) ? signature.args.deadline : undefined;
 * ```
 */
export function isPermitSignature(
  signature: RequirementSignature,
): signature is PermitRequirementSignature {
  return signature.action.type === "permit";
}

/**
 * Narrows a {@link RequirementSignature} to a Permit2 SignatureTransfer result.
 *
 * @param signature - The signed requirement to test.
 * @returns `true` when `signature.action.type` is `"permit2SignatureTransfer"`.
 * @example
 * ```ts
 * import {
 *   isPermit2SignatureTransferSignature,
 *   type RequirementSignature,
 * } from "@morpho-org/morpho-sdk";
 *
 * const getPermit2Nonce = (signature: RequirementSignature): bigint | undefined =>
 *   isPermit2SignatureTransferSignature(signature) ? signature.args.nonce : undefined;
 * ```
 */
export function isPermit2SignatureTransferSignature(
  signature: RequirementSignature,
): signature is Permit2SignatureTransferRequirementSignature {
  return signature.action.type === "permit2SignatureTransfer";
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
  /** The single ERC-2612 signature, when present. */
  readonly permit?: PermitRequirementSignature;
  /** The single Permit2 SignatureTransfer signature, when present. */
  readonly permit2SignatureTransfer?: Permit2SignatureTransferRequirementSignature;
  /** The single Morpho authorization signature, when present. */
  readonly authorization?: AuthorizationRequirementSignature;
  /** The single Midnight offer-root signature, when present. */
  readonly midnightOfferRoot?: MidnightOfferRootSignature;
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
 * @param accepts.permit - Whether an ERC-2612 signature is consumed.
 * @param accepts.permit2SignatureTransfer - Whether a Permit2 SignatureTransfer is consumed.
 * @param accepts.authorization - Whether a Morpho authorization signature is consumed.
 * @param accepts.midnightOfferRoot - Whether a Midnight offer-root signature is consumed.
 * @returns The accepted signature in each typed slot, when present.
 * @throws {AmbiguousRequirementSignaturesError} when more than one signature of an accepted kind is present.
 * @throws {UnsupportedRequirementSignatureError} when a signature has an unsupported action type.
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
    readonly permit?: boolean;
    readonly permit2SignatureTransfer?: boolean;
    readonly authorization?: boolean;
    readonly midnightOfferRoot?: boolean;
  },
): SelectedRequirementSignatures {
  if (signatures == null) return {};

  const permits = signatures.filter(isPermitSignature);
  const permit2Transfers = signatures.filter(
    isPermit2SignatureTransferSignature,
  );
  const authorizations = signatures.filter(isAuthorizationSignature);
  const midnightOfferRoots = signatures.filter(isMidnightOfferRootSignature);

  const unsupported = signatures.find(
    (signature): boolean =>
      !isPermitSignature(signature) &&
      !isPermit2SignatureTransferSignature(signature) &&
      !isAuthorizationSignature(signature) &&
      !isMidnightOfferRootSignature(signature),
  );
  if (unsupported != null)
    throw new UnsupportedRequirementSignatureError(unsupported.action.type);

  if (!accepts.permit && permits.length > 0)
    throw new UnexpectedRequirementSignatureError("permit");
  if (!accepts.permit2SignatureTransfer && permit2Transfers.length > 0)
    throw new UnexpectedRequirementSignatureError("permit2SignatureTransfer");
  if (!accepts.authorization && authorizations.length > 0)
    throw new UnexpectedRequirementSignatureError("authorization");
  if (!accepts.midnightOfferRoot && midnightOfferRoots.length > 0)
    throw new UnexpectedRequirementSignatureError("midnightOfferRootSignature");
  if (permits.length > 1)
    throw new AmbiguousRequirementSignaturesError("permit", permits.length);
  if (permit2Transfers.length > 1)
    throw new AmbiguousRequirementSignaturesError(
      "permit2SignatureTransfer",
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
    permit2SignatureTransfer: permit2Transfers[0],
    authorization: authorizations[0],
    midnightOfferRoot: midnightOfferRoots[0],
  };
}
