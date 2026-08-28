import {
  AccrualPosition,
  DEFAULT_SLIPPAGE_TOLERANCE,
  type Market,
  type MarketId,
  type MarketParams,
  MathLib,
  type Position,
  type Vault,
  type VaultMarketConfig,
  VaultV2BluePublicAllocatorConfigUtils,
} from "@morpho-org/blue-sdk";
import {
  fetchAccrualPosition,
  fetchAccrualVaultV2,
  fetchMarket,
  fetchPosition,
  fetchVault,
  fetchVaultMarketConfig,
  fetchVaultV2BluePublicAllocatorData,
} from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual } from "viem";
import {
  getBlueBundlesV1PenaltyAssets,
  getBlueBundlesV1PublicAllocations,
  normalizeBlueBundlesV1CommonParams,
  selectBlueBundlesV1RequirementSignatures,
  validateBlueBundlesV1NativeFunding,
} from "../../actions/blue/common.js";
import {
  blueBorrow,
  blueRefinance,
  blueRepay,
  blueRepayWithdrawCollateral,
  blueSupply,
  blueSupplyCollateral,
  blueSupplyCollateralBorrow,
  blueWithdraw,
  blueWithdrawCollateral,
  getBlueAuthorizationRequirement,
  getBlueBundlesV1TokenRequirements,
  getGeneralAdapterRequirements,
} from "../../actions/index.js";
import {
  computeMaxRepaySharePrice,
  computeMinBorrowSharePrice,
  computeVaultV1Reallocations,
  validateAccrualPosition,
  validateChainId,
  validateNativeAsset,
  validatePositionHealth,
  validatePositionHealthAfterWithdraw,
  validateRepayAmount,
  validateRepayShares,
  validateSlippageTolerance,
  validateWithdrawAmount,
  validateWithdrawShares,
} from "../../helpers/index.js";
import { validateAndNormalizeVaultV2BlueReallocations } from "../../helpers/validate.js";
import type { FetchParameters } from "../../types/data.js";
import {
  type ActionOutput,
  type ActionRequirement,
  type AssetsOrSharesArgs,
  type BlueAuthorizationAction,
  type BlueBorrowAction,
  type BlueRefinanceAction,
  type BlueRepayAction,
  type BlueRepayWithdrawCollateralAction,
  type BlueSupplyAction,
  type BlueSupplyCollateralAction,
  type BlueSupplyCollateralBorrowAction,
  type BlueWithdrawAction,
  type BlueWithdrawCollateralAction,
  BorrowAmountAndSharesExclusiveError,
  type DepositAmountArgs,
  type ERC20ApprovalAction,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  MissingAccrualPositionError,
  type MorphoClientType,
  MutuallyExclusiveRepayAmountsError,
  MutuallyExclusiveWithdrawAmountsError,
  NegativeInputError,
  NonPositiveInputError,
  type PermitRequirementSignature,
  type ReallocationComputeOptions,
  RefinanceExceedsBorrowAssetsError,
  RefinanceExceedsBorrowSharesError,
  RefinanceExceedsCollateralError,
  RefinanceSameMarketError,
  RefinanceTokenMismatchError,
  type RepayAmountArgs,
  type Requirement,
  type RequirementSignature,
  selectRequirementSignatures,
  type Transaction,
  type VaultV1Reallocation,
  type VaultV2BluePublicAllocatorOptions,
  type VaultV2BlueReallocation,
  WithdrawExceedsCollateralError,
} from "../../types/index.js";
import { VaultV1ReallocationData } from "../vaultV1ReallocationData.js";
import { VaultV2BlueReallocationData } from "../vaultV2BlueReallocationData.js";

type VaultV1ReallocationsParams = {
  readonly reallocationData: VaultV1ReallocationData;
  readonly options?: ReallocationComputeOptions;
} & (
  | {
      readonly operation: "borrow" | "withdraw";
      readonly amount: bigint;
      readonly borrowAmount?: never;
    }
  | {
      /** @deprecated Pass `{ operation: "borrow", amount }` instead. */
      readonly borrowAmount: bigint;
      readonly operation?: never;
      readonly amount?: never;
    }
);

type VaultV2BlueReallocationsParams = {
  readonly reallocationData: VaultV2BlueReallocationData;
  readonly options?: VaultV2BluePublicAllocatorOptions & {
    readonly operation?: {
      readonly type: "borrow" | "withdraw";
      readonly amount: bigint;
    };
  };
};

/** Options for resolving token-backed BlueBundlesV1 approval or signature prerequisites. */
export interface BlueTokenRequirementsParams {
  /** Prefer ERC-2612 when the funded token exposes a compatible nonce. */
  useSimplePermit?: boolean;
  /** Explicit unused Permit2 SignatureTransfer unordered nonce. */
  permit2Nonce?: bigint;
}

export interface BlueActions {
  /**
   * Fetches the latest market data with accrued interest.
   *
   * @param parameters - Optional fetch parameters (block number, state overrides).
   * @returns Market state including total supply/borrow assets and shares.
   */
  getMarketData: (parameters?: FetchParameters) => Promise<Market>;

  /**
   * Fetches the user's position in this market with accrued interest.
   *
   * @param userAddress - The user whose position to fetch.
   * @param parameters - Optional fetch parameters (block number, state overrides).
   * @returns Accrual position with health metrics (maxBorrowAssets, ltv, isHealthy).
   */
  getPositionData: (
    userAddress: Address,
    parameters?: FetchParameters,
  ) => Promise<AccrualPosition>;

  /**
   * Prepares a supply-collateral transaction.
   *
   * Routed through bundler via GeneralAdapter1.
   * `getRequirements` returns ERC20 approval or permit for GeneralAdapter1.
   * When `nativeAmount` is provided, native token is wrapped; collateral must be wNative.
   *
   * @param params - Supply collateral parameters.
   * @returns Object with `buildTx` and `getRequirements`.
   */
  supplyCollateral: (params: { userAddress: Address } & DepositAmountArgs) => {
    buildTx: (
      signatures?: readonly RequirementSignature[],
    ) => Readonly<Transaction<BlueSupplyCollateralAction>>;
    getRequirements: (params?: {
      /**
       * Prefer the ERC-2612 simple-permit path when the SDK detects support.
       * Leave unset or set to `false` to force the Permit2/classic approval fallback when
       * a token is known to be incompatible despite passing the SDK's shallow nonce probe.
       */
      useSimplePermit?: boolean;
    }) => Promise<
      (
        | Readonly<Transaction<ERC20ApprovalAction>>
        | Requirement<PermitRequirementSignature>
      )[]
    >;
  };

  /**
   * Prepares a direct BlueBundlesV1 loan-asset supply.
   *
   * `getRequirements()` reads only the loan-token allowance and selected ERC-2612 or Permit2
   * nonce state. Direct approvals and ERC-2612 name BlueBundlesV1 as spender; Permit2 keeps its
   * ERC-20 approval on canonical Permit2. Native funding is exclusive and skips token requirements.
   * The referral fee is deducted from the gross `assets` supplied. This route exposes no Bundler3
   * share-price bound or `slippageTolerance`.
   *
   * @param params.userAddress - User funding and receiving the supply position.
   * @param params.assets - Gross loan-token assets funded before the referral fee.
   * @param params.nativeAmount - Optional full native funding; must equal `assets` and requires wNative.
   * @param params.deadline - Final call deadline in Unix seconds.
   * @param params.referralFeePct - Optional WAD-scaled referral fee below 100%.
   * @param params.referralFeeRecipient - Recipient required for a positive fee.
   * @returns Lazy prerequisite resolution and a synchronous deep-frozen transaction builder.
   * @throws {ChainIdMismatchError} when the client targets another chain.
   * @throws {ExpiredDeadlineError} when the deadline is not in the future at creation or requirement resolution.
   * @throws {NonPositiveInputError} when `assets` is not positive.
   * @throws {NegativeInputError} when native funding or the referral fee is negative.
   * @throws {NativeFundingAmountMismatchError} when native funding is partial or mixed.
   * @throws {ChainWNativeMissingError} when native funding is requested on a chain without wNative.
   * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets another token.
   * @throws {InputExceedsMaxError} when the referral fee is at least WAD.
   * @throws {MissingReferralFeeRecipientError} when a positive fee has no recipient.
   * @throws {MissingPermit2TransferFromNonceError} from `getRequirements()` when Permit2 is selected without an explicit nonce.
   * @throws {Permit2TransferFromNonceAlreadyUsedError} from `getRequirements()` when the explicit Permit2 nonce is consumed.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple token signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when the route cannot consume a supplied signature.
   * @throws {DepositOwnerMismatchError} from `buildTx()` when the signed owner differs from `userAddress`.
   * @throws {DepositAssetMismatchError} from `buildTx()` when the signed asset differs from the loan token.
   * @throws {DepositAmountMismatchError} from `buildTx()` when the signed amount differs from `assets`.
   * @throws {DepositSpenderMismatchError} from `buildTx()` when the signed spender is not BlueBundlesV1.
   * @throws {BlueBundlesV1RequirementSignatureMismatchError} from `buildTx()` when a signature cannot be encoded safely.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
   * @throws {viem.BaseError} from `getRequirements()` when a required allowance, nonce, or token metadata read fails.
   * @example
   * ```ts
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http, zeroAddress } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   *
   * const userAddress = zeroAddress;
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const market = client.morpho.blue(markets[mainnet.id].usdc_wbtc, mainnet.id);
   * const action = market.supply({
   *   userAddress,
   *   assets: 1_000_000n,
   *   deadline: BigInt(Math.floor(Date.now() / 1_000) + 3_600),
   * });
   * const requirements = await action.getRequirements();
   * const tx = action.buildTx();
   * // tx satisfies Readonly<Transaction<BlueSupplyAction>>
   * ```
   */
  supply: (params: {
    userAddress: Address;
    assets: bigint;
    nativeAmount?: bigint;
    deadline: bigint;
    referralFeePct?: bigint;
    referralFeeRecipient?: Address;
  }) => ActionOutput<
    BlueSupplyAction,
    readonly RequirementSignature[],
    BlueTokenRequirementsParams
  >;

  /**
   * Prepares a direct BlueBundlesV1 loan-asset withdrawal by assets or shares.
   *
   * `getRequirements()` reads Morpho authorization state for BlueBundlesV1. Optional reallocations
   * are Vault V2-only; their penalties and the referral fee reduce withdrawal proceeds. Shares
   * mode has neither a saturated full-close sentinel nor an onchain minimum-assets guarantee.
   * This route exposes no Bundler3 share-price bound or `slippageTolerance`.
   *
   * @param params.userAddress - User whose supply position is withdrawn.
   * @param params.positionData - Pre-fetched position used for ownership and balance validation.
   * @param params.assets - Exact assets withdrawn, exclusive with `shares`.
   * @param params.shares - Exact shares burned, exclusive with `assets`.
   * @param params.reallocations - Optional Vault V2 reallocations executed before withdrawal.
   * @param params.deadline - Final call deadline in Unix seconds.
   * @param params.referralFeePct - Optional WAD-scaled referral fee below 100%.
   * @param params.referralFeeRecipient - Recipient required for a positive fee.
   * @returns Lazy authorization resolution and a synchronous deep-frozen transaction builder.
   * @throws {ChainIdMismatchError} when the client targets another chain.
   * @throws {ExpiredDeadlineError} when the deadline is stale.
   * @throws {MissingAccrualPositionError} when no position snapshot is provided at runtime.
   * @throws {MarketIdMismatchError} when `positionData` belongs to another market.
   * @throws {AccrualPositionUserMismatchError} when `positionData` belongs to another user.
   * @throws {NegativeInputError} when an amount, referral fee, or reallocation penalty is negative.
   * @throws {NonPositiveInputError} when no withdrawal mode or positive reallocation amount is provided.
   * @throws {MutuallyExclusiveWithdrawAmountsError} when assets and shares are both nonzero.
   * @throws {WithdrawExceedsSupplyError} when assets exceed the supplied balance.
   * @throws {WithdrawSharesExceedSupplyError} when shares exceed the owned balance.
   * @throws {InputExceedsMaxError} when a fee or reallocation exceeds its ABI bound.
   * @throws {MissingReferralFeeRecipientError} when a positive fee has no recipient.
   * @throws {InvalidReallocationAddressError} when a vault or adapter address is malformed.
   * @throws {InvalidReallocationSourceTypeError} when a reallocation source is malformed.
   * @throws {InconsistentReallocationPenaltyError} when one vault uses different penalties.
   * @throws {ReallocationWithdrawalOnTargetMarketError} when a source is the target market.
   * @throws {ReallocationLoanTokenMismatchError} when a source uses another loan token.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple authorization signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a non-authorization signature is supplied.
   * @throws {DepositOwnerMismatchError} from `buildTx()` when the signed owner differs from `userAddress`.
   * @throws {BlueBundlesV1RequirementSignatureMismatchError} from `buildTx()` when authorization cannot be encoded safely.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
   * @throws {viem.BaseError} from `getRequirements()` when authorization reads fail.
   * @example
   * ```ts
   * import { AccrualPosition } from "@morpho-org/blue-sdk";
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http, zeroAddress } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   *
   * const userAddress = zeroAddress;
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const market = client.morpho.blue(markets[mainnet.id].usdc_wbtc, mainnet.id);
   * const positionData = new AccrualPosition(
   *   { user: userAddress, supplyShares: 1n, borrowShares: 0n, collateral: 0n },
   *   await market.getMarketData(),
   * );
   * const action = market.withdraw({
   *   userAddress,
   *   positionData,
   *   shares: 1n,
   *   deadline: BigInt(Math.floor(Date.now() / 1_000) + 3_600),
   * });
   * const requirements = await action.getRequirements();
   * const tx = action.buildTx();
   * // tx satisfies Readonly<Transaction<BlueWithdrawAction>>
   * ```
   */
  withdraw: (
    params: {
      userAddress: Address;
      positionData: AccrualPosition;
      reallocations?: Iterable<VaultV2BlueReallocation>;
      deadline: bigint;
      referralFeePct?: bigint;
      referralFeeRecipient?: Address;
    } & AssetsOrSharesArgs,
  ) => ActionOutput<
    BlueWithdrawAction,
    readonly RequirementSignature[],
    undefined
  >;

  /**
   * Prepares a borrow transaction.
   *
   * Routed through bundler3 via `morphoBorrow`.
   * Validates position health with LLTV buffer (0.5%) using the pre-fetched `positionData`.
   * Computes `minSharePrice` from market borrow state and `slippageTolerance`.
   *
   * Optional Vault V2 reallocations run before borrowing. Their penalties are paid in the loan
   * token.
   *
   * `getRequirements` returns the loan-token approval needed for V2 penalties
   * and Morpho authorization for GeneralAdapter1 when needed.
   *
   * **Stale `positionData` may cause unexpected health.**
   *
   * @param params - Borrow parameters including pre-fetched `positionData` for health validation.
   * @returns Object with `buildTx` and `getRequirements`.
   * @throws {BundlerErrors.UnexpectedAction} when a V2 plan is unsupported on the chain.
   * @throws {InputExceedsMaxError} when a V2 reallocation asset amount exceeds `uint128` or its penalty exceeds WAD.
   * @throws {InconsistentReallocationPenaltyError} when V2 entries for one vault use different penalties.
   * @throws {InvalidReallocationAddressError} when a V2 vault or adapter address is malformed.
   * @throws {InvalidReallocationSourceTypeError} when a V2 source is absent, incomplete, or has an unknown discriminator.
   */
  borrow: (params: {
    userAddress: Address;
    amount: bigint;
    positionData: AccrualPosition;
    slippageTolerance?: bigint;
    /** Optional Vault V2 BluePublicAllocator reallocations. */
    reallocations?: Iterable<VaultV2BlueReallocation>;
  }) => {
    buildTx: (
      signatures?: readonly RequirementSignature[],
    ) => Readonly<Transaction<BlueBorrowAction>>;
    getRequirements: () => Promise<
      (
        | Readonly<Transaction<ERC20ApprovalAction>>
        | Readonly<Transaction<BlueAuthorizationAction>>
        | Requirement
      )[]
    >;
  };

  /**
   * Prepares a repay transaction.
   *
   * Routed through bundler3 via GeneralAdapter1.
   * Supports two modes via {@link RepayAmountArgs}:
   * - **By assets** (`{ amount }`): repays an exact asset amount (partial repay).
   * - **By shares** (`{ shares }`): repays exact shares (full repay, immune to interest accrual).
   *
   * Computes `maxSharePrice` from market borrow state and `slippageTolerance`.
   *
   * `getRequirements` returns ERC20 approval for loan token to GeneralAdapter1.
   * Does NOT require Morpho authorization (anyone can repay on behalf of anyone).
   *
   * **Shares mode:** `slippageTolerance` also caps `transferAmount`.
   *
   * @param params - Repay parameters including pre-fetched `positionData`.
   * @returns Object with `buildTx` and `getRequirements`.
   */
  repay: (
    params: {
      userAddress: Address;
      positionData: AccrualPosition;
      slippageTolerance?: bigint;
    } & RepayAmountArgs,
  ) => {
    buildTx: (
      signatures?: readonly RequirementSignature[],
    ) => Readonly<Transaction<BlueRepayAction>>;
    getRequirements: (params?: {
      /**
       * Prefer the ERC-2612 simple-permit path when the SDK detects support.
       * Leave unset or set to `false` to force the Permit2/classic approval fallback when
       * a token is known to be incompatible despite passing the SDK's shallow nonce probe.
       */
      useSimplePermit?: boolean;
    }) => Promise<
      (
        | Readonly<Transaction<ERC20ApprovalAction>>
        | Requirement<PermitRequirementSignature>
      )[]
    >;
  };

  /**
   * Prepares a withdraw-collateral transaction.
   *
   * Direct call to `morpho.withdrawCollateral()` — no bundler, no GeneralAdapter1.
   * The caller (`msg.sender`) must be `onBehalf`.
   * Validates position health after withdrawal using the LLTV buffer.
   *
   * No `getRequirements` — no ERC20 approval or GeneralAdapter1 authorization needed
   * (collateral flows out of Morpho, not in).
   *
   * **No on-chain slippage guard — stale `positionData` risks liquidation.**
   *
   * @param params - Withdraw collateral parameters including pre-fetched `positionData` for health validation.
   * @returns Object with `buildTx`.
   */
  withdrawCollateral: (params: {
    userAddress: Address;
    amount: bigint;
    positionData: AccrualPosition;
  }) => {
    buildTx: () => Readonly<Transaction<BlueWithdrawCollateralAction>>;
  };

  /**
   * Prepares an atomic repay-and-withdraw-collateral transaction.
   *
   * Routed through bundler3. Bundle order: repay FIRST, then withdraw.
   * Validates combined position health: simulates the repay, then checks
   * that the resulting position can sustain the collateral withdrawal.
   *
   * `getRequirements` returns in parallel:
   * - ERC20 approval for loan token to GeneralAdapter1 (for the repay).
   * - `morpho.setAuthorization(generalAdapter1, true)` if not yet authorized (for the withdraw).
   *
   * **Stale `positionData` risks underestimated debt and unsafe withdrawal.**
   *
   * @param params - Combined parameters including pre-fetched `positionData`.
   * @returns Object with `buildTx` and `getRequirements`.
   */
  repayWithdrawCollateral: (
    params: {
      userAddress: Address;
      withdrawAmount: bigint;
      positionData: AccrualPosition;
      slippageTolerance?: bigint;
    } & RepayAmountArgs,
  ) => {
    buildTx: (
      signatures?: readonly RequirementSignature[],
    ) => Readonly<Transaction<BlueRepayWithdrawCollateralAction>>;
    getRequirements: (params?: {
      /**
       * Prefer the ERC-2612 simple-permit path when the SDK detects support.
       * Leave unset or set to `false` to force the Permit2/classic approval fallback when
       * a token is known to be incompatible despite passing the SDK's shallow nonce probe.
       */
      useSimplePermit?: boolean;
    }) => Promise<
      (
        | Readonly<Transaction<ERC20ApprovalAction>>
        | Readonly<Transaction<BlueAuthorizationAction>>
        | Requirement
      )[]
    >;
  };

  /**
   * Prepares an atomic supply-collateral-and-borrow transaction.
   *
   * Routed through the bundler. Validates position health with LLTV buffer
   * to prevent instant liquidation on new positions near the LLTV threshold.
   *
   * Optional Vault V2 reallocations run between the collateral supply and `morphoBorrow`. Their
   * penalties are paid in the loan token.
   *
   * `getRequirements` returns in parallel:
   * - ERC20 approval or permit for collateral token (to GeneralAdapter1).
   * - Classic ERC20 approval for any V2 loan-token penalties.
   * - `morpho.setAuthorization(generalAdapter1, true)` if adapter is not yet authorized.
   *
   * **Stale `positionData` may cause unexpected health.**
   *
   * @param params - Combined parameters including pre-fetched `positionData` for health validation.
   * @returns Object with `buildTx` and `getRequirements`.
   * @throws {BundlerErrors.UnexpectedAction} when a V2 plan is unsupported on the chain.
   * @throws {InputExceedsMaxError} when a V2 reallocation asset amount exceeds `uint128` or its penalty exceeds WAD.
   * @throws {InconsistentReallocationPenaltyError} when V2 entries for one vault use different penalties.
   * @throws {InvalidReallocationAddressError} when a V2 vault or adapter address is malformed.
   * @throws {InvalidReallocationSourceTypeError} when a V2 source is absent, incomplete, or has an unknown discriminator.
   */
  supplyCollateralBorrow: (
    params: {
      userAddress: Address;
      positionData: AccrualPosition;
      borrowAmount: bigint;
      slippageTolerance?: bigint;
      /** Optional Vault V2 BluePublicAllocator reallocations. */
      reallocations?: Iterable<VaultV2BlueReallocation>;
    } & DepositAmountArgs,
  ) => {
    buildTx: (
      signatures?: readonly RequirementSignature[],
    ) => Readonly<Transaction<BlueSupplyCollateralBorrowAction>>;
    getRequirements: (params?: {
      /**
       * Prefer the ERC-2612 simple-permit path when the SDK detects support.
       * Leave unset or set to `false` to force the Permit2/classic approval fallback when
       * a token is known to be incompatible despite passing the SDK's shallow nonce probe.
       */
      useSimplePermit?: boolean;
    }) => Promise<
      (
        | Readonly<Transaction<ERC20ApprovalAction>>
        | Readonly<Transaction<BlueAuthorizationAction>>
        | Requirement
      )[]
    >;
  };

  /**
   * Prepares an atomic refinance migrating this market's position to another Morpho Blue market
   * that shares the same loan and collateral tokens. See {@link blueRefinance} for the bundle.
   *
   * Validates ownership, token/id match, that amounts do not exceed the source position, and that
   * both the residual source and the aggregate target position stay within LLTV − buffer. Both
   * markets are forward-accrued to `now`; in shares mode the target borrow is overshot by
   * `slippageTolerance` and the callback sweeps the residual.
   * Optional Vault V2 target reallocations run first and pay penalties in the loan token.
   *
   * `getRequirements` returns the loan-token approval needed for V2 penalties
   * and Morpho authorization for GeneralAdapter1 when needed.
   *
   * @param params.userAddress - Position owner on both markets.
   * @param params.positionData - Pre-fetched source-market accrual position.
   * @param params.target.marketParams - Target market params.
   * @param params.target.positionData - Pre-fetched target-market accrual position (zero-position if none).
   * @param params.collateralAmount - Amount of collateral to migrate from source to target.
   * @param params.borrowAssets - Loan assets to repay on source; exclusive with `borrowShares`.
   * @param params.borrowShares - Borrow shares to repay on source; exclusive with `borrowAssets`.
   * @param params.slippageTolerance - WAD slippage tolerance. Defaults to `DEFAULT_SLIPPAGE_TOLERANCE`.
   * @param params.targetReallocations - Optional Vault V2 reallocations into the target market.
   * @returns Object with `buildTx` and `getRequirements`.
   * @throws {BundlerErrors.UnexpectedAction} when a V2 plan is unsupported on the chain.
   * @throws {InputExceedsMaxError} when a V2 reallocation asset amount exceeds `uint128` or its penalty exceeds WAD.
   * @throws {InconsistentReallocationPenaltyError} when V2 entries for one vault use different penalties.
   * @throws {InvalidReallocationAddressError} when a V2 vault or adapter address is malformed.
   * @throws {InvalidReallocationSourceTypeError} when a V2 source is absent, incomplete, or has an unknown discriminator.
   */
  refinance: (params: {
    userAddress: Address;
    positionData: AccrualPosition;
    target: {
      marketParams: MarketParams;
      positionData: AccrualPosition;
    };
    collateralAmount: bigint;
    borrowAssets?: bigint;
    borrowShares?: bigint;
    slippageTolerance?: bigint;
    /** Optional Vault V2 BluePublicAllocator reallocations. */
    targetReallocations?: Iterable<VaultV2BlueReallocation>;
  }) => {
    buildTx: (
      signatures?: readonly RequirementSignature[],
    ) => Readonly<Transaction<BlueRefinanceAction>>;
    getRequirements: () => Promise<
      (
        | Readonly<Transaction<ERC20ApprovalAction>>
        | Readonly<Transaction<BlueAuthorizationAction>>
        | Requirement
      )[]
    >;
  };

  /**
   * Fetches all on-chain data needed to construct a {@link VaultV1ReallocationData}
   * for computing vault reallocations via the public allocator.
   *
   * The target market is refetched internally at `block.number` so the
   * reallocation planner always sees a snapshot from the same block as the
   * source vaults. A caller-owned market would let stale or adversarial data
   * inject unnecessary `reallocateTo` actions (and their PublicAllocator
   * fees) into the resulting bundle.
   *
   * The returned data can be passed to {@link getVaultV1Reallocations} for explicit low-level
   * Bundler3 composition.
   *
   * **Stale data reverts on-chain (fail-safe).**
   *
   * @param params.vaultAddresses - Addresses of MetaMorpho vaults that allocate to this market.
   * @param params.block - The block to fetch data at (number and timestamp).
   * @returns A VaultV1ReallocationData instance populated with all required data.
   * @throws {ChainIdMismatchError} when the client chain does not match this market.
   * @deprecated Prefer {@link getVaultV2BlueReallocationData} for high-level Blue writes. This V1
   * snapshot remains available for low-level Bundler3 composition.
   */
  getVaultV1ReallocationData: (params: {
    vaultAddresses: readonly Address[];
    block: {
      readonly number: bigint;
      readonly timestamp: bigint;
    };
  }) => Promise<VaultV1ReallocationData>;

  /**
   * Fetches Vault V1 PublicAllocator state using the deprecated unversioned name.
   *
   * @param params.vaultAddresses - Addresses of MetaMorpho vaults that allocate to this market.
   * @param params.block.number - Block number used for every RPC read.
   * @param params.block.timestamp - Timestamp corresponding to the fetched block.
   * @returns A `VaultV1ReallocationData` snapshot populated from one block.
   * @throws {ChainIdMismatchError} when the client chain does not match this market.
   * @deprecated Use {@link getVaultV1ReallocationData} instead.
   */
  getReallocationData: (params: {
    vaultAddresses: readonly Address[];
    block: {
      readonly number: bigint;
      readonly timestamp: bigint;
    };
  }) => Promise<VaultV1ReallocationData>;

  /**
   * Fetches Vault V2 BluePublicAllocator state for this target market.
   *
   * Reads the target Morpho Blue market, each Vault V2 accrual tree, and each
   * vault's BluePublicAllocator permissions and allocation caps at one block.
   *
   * @param params.vaultAddresses - Vault V2 addresses to inspect for market or idle liquidity.
   * @param params.block.number - Block number used for every RPC read.
   * @param params.block.timestamp - Timestamp corresponding to the fetched block.
   * @returns A `VaultV2BlueReallocationData` snapshot ready for {@link getVaultV2BlueReallocations}.
   * @throws {ChainIdMismatchError} when the client chain does not match this market.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when the chain has no BluePublicAllocator deployment.
   * @throws {UnknownBlueFactory} when the chain has no Vault V2 factory.
   * @throws {UnknownBlueOfFactory} when a requested address is not a Vault V2 from that factory.
   * @throws {UnsupportedBlueVaultV2AdapterError} when a vault contains an unsupported adapter.
   * @throws {viem.BaseError} when an RPC or contract read fails with no fallback left.
   */
  getVaultV2BlueReallocationData: (params: {
    vaultAddresses: readonly Address[];
    block: {
      readonly number: bigint;
      readonly timestamp: bigint;
    };
  }) => Promise<VaultV2BlueReallocationData>;

  /**
   * Computes Vault V1 PublicAllocator reallocations for this market.
   *
   * Uses the shared-liquidity algorithm to determine which vaults should reallocate liquidity to
   * this market via the PublicAllocator, based on the post-operation utilization target.
   *
   * Pass `{ borrowAmount }` for a borrow (legacy alias, equivalent to `{ operation: "borrow",
   * amount }`) or `{ operation: "withdraw", amount }` for a loan-asset withdraw.
   *
   * @param params.reallocationData - The current on-chain state (from {@link getVaultV1ReallocationData}).
   * @param params.operation - The operation driving the reallocation (`"borrow"` or `"withdraw"`).
   *        Defaults to `"borrow"` when `borrowAmount` is provided.
   * @param params.amount - The borrow or withdraw amount used to compute the post-state utilization.
   * @param params.borrowAmount - {@deprecated} Equivalent to `{ operation: "borrow", amount }`. Use the
   *   `operation` + `amount` form on new code.
   * @param params.options - Optional reallocation computation options
   *        (timestamp, utilization targets, reallocatable vaults filter, etc.).
   *        Pass the fetched block timestamp to compute reallocations at the same block.
   * @returns Vault V1 reallocations for explicit low-level Bundler3 composition.
   * @throws {ChainIdMismatchError} when `reallocationData` belongs to a different chain than this market.
   * @throws {InsufficientSharedLiquidityError} when shared liquidity cannot cover the operation's absolute shortfall on the target market — preventing fee-bearing reallocations from being attached to a call that would still revert onchain.
   * @throws {ReallocationWithdrawExceedsMarketSupplyError} when a withdrawal exceeds the target market supply.
   * @throws {MissingPublicAllocatorConfigError} when a selected vault is missing its public allocator config.
   * @throws {UnknownReallocationMarketError} when the target market is absent from the reallocation data.
   * @deprecated Prefer {@link getVaultV2BlueReallocations} for high-level Blue writes. This V1
   * planner remains available for low-level Bundler3 composition.
   * @example
   * ```ts
   * const reallocations = market.getVaultV1Reallocations({
   *   reallocationData,
   *   operation: "borrow",
   *   amount: 1_000_000n,
   * });
   * ```
   */
  getVaultV1Reallocations: (
    params: VaultV1ReallocationsParams,
  ) => readonly VaultV1Reallocation[];

  /**
   * Computes Vault V1 PublicAllocator reallocations using the deprecated unversioned name.
   *
   * @param params.reallocationData - State returned by {@link getVaultV1ReallocationData}.
   * @param params.operation - The operation driving the reallocation (`"borrow"` or `"withdraw"`).
   * @param params.amount - The borrow or withdraw amount used to compute post-state utilization.
   * @param params.borrowAmount - Deprecated borrow amount alias.
   * @param params.options - Optional allocator and utilization options.
   * @returns Vault V1 reallocations for explicit low-level Bundler3 composition.
   * @throws {ChainIdMismatchError} when `reallocationData` belongs to another chain.
   * @throws {InsufficientSharedLiquidityError} when shared liquidity cannot cover the operation.
   * @throws {ReallocationWithdrawExceedsMarketSupplyError} when a withdrawal exceeds market supply.
   * @throws {MissingPublicAllocatorConfigError} when a selected vault lacks allocator state.
   * @throws {UnknownReallocationMarketError} when the target market is absent.
   * @deprecated Use {@link getVaultV1Reallocations} instead.
   * @example
   * ```ts
   * const reallocations = market.getReallocations({
   *   reallocationData,
   *   operation: "borrow",
   *   amount: 1_000_000n,
   * });
   * ```
   */
  getReallocations: (
    params: VaultV1ReallocationsParams,
  ) => readonly VaultV1Reallocation[];

  /**
   * Computes Vault V2 BluePublicAllocator reallocations for this market.
   *
   * @param params.reallocationData - State returned by {@link getVaultV2BlueReallocationData}.
   * @param params.options - Optional allocator discovery controls and operation to support.
   * @returns Action-ready reallocations and their post-simulation state.
   * @throws {ChainIdMismatchError} when `reallocationData` belongs to another chain.
   * @throws {NegativeInputError} when a utilization or penalty limit is negative.
   * @throws {InputExceedsMaxError} when a utilization or penalty limit exceeds WAD.
   * @throws {NonPositiveInputError} when an enabled operation amount is not positive.
   * @throws {UnknownReallocationMarketError} when a required market is absent.
   * @throws {UnknownReallocationVaultError} when configured vault state is absent.
   * @throws {UnknownReallocationPublicAllocatorConfigError} when allocator authorization state is absent.
   * @throws {UnknownReallocationActiveAdaptersError} when active-adapter state is absent.
   * @throws {UnknownReallocationMarketPublicAllocatorConfigError} when an adapter-market allocator configuration is absent.
   * @throws {UnknownReallocationAllocationError} when required allocation state is absent.
   * @throws {ReallocationAdapterSupplySharesUnderflowError} when an inconsistent adapter snapshot underflows during the final transition.
   * @throws {ReallocationAllocationUnderflowError} when an inconsistent allocation snapshot underflows during the final transition.
   * @throws {InsufficientSharedLiquidityError} when selected liquidity cannot cover the shortfall.
   * @throws {ReallocationWithdrawExceedsMarketSupplyError} when a withdrawal exceeds market supply.
   * @example
   * ```ts
   * const result = market.getVaultV2BlueReallocations({
   *   reallocationData,
   *   options: { operation: { type: "borrow", amount: 1_000_000n } },
   * });
   * ```
   */
  getVaultV2BlueReallocations: (params: VaultV2BlueReallocationsParams) => {
    readonly reallocations: readonly VaultV2BlueReallocation[];
    readonly data: VaultV2BlueReallocationData;
  };
}

export class MorphoBlue implements BlueActions {
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  constructor(
    private readonly client: MorphoClientType,
    public readonly marketParams: MarketParams,
    private readonly chainId: number,
  ) {}

  private validateDeadline(deadline: bigint): void {
    const timestamp = Time.timestamp();
    if (deadline <= timestamp) {
      throw new ExpiredDeadlineError(deadline, timestamp);
    }
  }

  private validateWriteCommon(params: {
    userAddress: Address;
    deadline: bigint;
    referralFeePct?: bigint;
    referralFeeRecipient?: Address;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    this.validateDeadline(params.deadline);
    // Resolve at handle creation so unsupported deployments fail before any RPC prerequisite work.
    getChainAddress(this.chainId, "bundles.blueBundlesV1");
    return normalizeBlueBundlesV1CommonParams({
      chainId: this.chainId,
      userAddress: params.userAddress,
      deadline: params.deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
    });
  }

  private async getTokenRequirements(params: {
    token: Address;
    amount: bigint;
    userAddress: Address;
    deadline: bigint;
    useSimplePermit?: boolean;
    permit2Nonce?: bigint;
  }): Promise<readonly ActionRequirement[]> {
    this.validateDeadline(params.deadline);
    return getBlueBundlesV1TokenRequirements(this.client.viemClient, {
      token: params.token,
      amount: params.amount,
      owner: params.userAddress,
      chainId: this.chainId,
      deadline: params.deadline,
      supportSignature: this.client.options.supportSignature,
      supportDeployless: this.client.options.supportDeployless,
      useSimplePermit: params.useSimplePermit,
      permit2Nonce: params.permit2Nonce,
    });
  }

  private async getAuthorizationRequirements(params: {
    userAddress: Address;
    deadline: bigint;
  }): Promise<readonly ActionRequirement[]> {
    this.validateDeadline(params.deadline);
    const requirement = await getBlueAuthorizationRequirement({
      viemClient: this.client.viemClient,
      chainId: this.chainId,
      userAddress: params.userAddress,
      supportSignature: this.client.options.supportSignature,
      authorized: getChainAddress(this.chainId, "bundles.blueBundlesV1"),
      deadline: params.deadline,
    });
    return requirement == null ? [] : [requirement];
  }

  private getReallocationPenaltyRequirements(
    userAddress: Address,
    reallocations: readonly VaultV2BlueReallocation[],
  ) {
    const amount = reallocations.reduce(
      (total, reallocation) =>
        total +
        VaultV2BluePublicAllocatorConfigUtils.getPenaltyAssets(
          reallocation,
          reallocation.assets,
        ),
      0n,
    );

    // Separate-token penalty funding uses a classic GeneralAdapter1 allowance so a collateral
    // permit and a loan-token penalty can coexist in one bundle. The shared-token path aggregates
    // both amounts into the collateral requirement instead.
    return getGeneralAdapterRequirements(this.client.viemClient, {
      address: this.marketParams.loanToken,
      chainId: this.chainId,
      supportSignature: false,
      args: { amount, from: userAddress },
    });
  }

  async getMarketData(parameters?: FetchParameters): Promise<Market> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    return fetchMarket(this.marketParams.id, this.client.viemClient, {
      ...parameters,
      chainId: this.chainId,
      deployless: this.client.options.supportDeployless,
    });
  }

  async getPositionData(
    userAddress: Address,
    parameters?: FetchParameters,
  ): Promise<AccrualPosition> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    return fetchAccrualPosition(
      userAddress,
      this.marketParams.id,
      this.client.viemClient,
      {
        ...parameters,
        deployless: this.client.options.supportDeployless,
        chainId: this.chainId,
      },
    );
  }

  /** {@inheritDoc BlueActions.supply} */
  supply(params: {
    userAddress: Address;
    assets: bigint;
    nativeAmount?: bigint;
    deadline: bigint;
    referralFeePct?: bigint;
    referralFeeRecipient?: Address;
  }) {
    const {
      userAddress,
      assets,
      nativeAmount,
      deadline,
      referralFeePct,
      referralFeeRecipient,
    } = params;
    this.validateWriteCommon(params);
    if (assets <= 0n) throw new NonPositiveInputError("assets", assets);
    const nativeValue = validateBlueBundlesV1NativeFunding({
      chainId: this.chainId,
      token: this.marketParams.loanToken,
      fundedAmount: assets,
      nativeAmount,
    });

    return {
      getRequirements: (requirementsParams?: BlueTokenRequirementsParams) => {
        this.validateDeadline(deadline);
        if (nativeValue > 0n) return Promise.resolve([]);
        return this.getTokenRequirements({
          token: this.marketParams.loanToken,
          amount: assets,
          userAddress,
          deadline,
          useSimplePermit: requirementsParams?.useSimplePermit,
          permit2Nonce: requirementsParams?.permit2Nonce,
        });
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { token } = selectBlueBundlesV1RequirementSignatures(signatures, {
          token: nativeValue === 0n,
        });
        return blueSupply({
          market: { chainId: this.chainId, marketParams: this.marketParams },
          args: {
            userAddress,
            assets,
            nativeAmount: nativeValue > 0n ? nativeValue : undefined,
            deadline,
            referralFeePct,
            referralFeeRecipient,
            requirementSignature: token,
          },
          metadata: this.client.options.metadata,
        });
      },
    };
  }

  /** {@inheritDoc BlueActions.withdraw} */
  withdraw(
    params: {
      userAddress: Address;
      positionData: AccrualPosition;
      reallocations?: Iterable<VaultV2BlueReallocation>;
      deadline: bigint;
      referralFeePct?: bigint;
      referralFeeRecipient?: Address;
    } & AssetsOrSharesArgs,
  ) {
    const {
      userAddress,
      positionData,
      deadline,
      referralFeePct,
      referralFeeRecipient,
    } = params;
    this.validateWriteCommon(params);
    const assets = ("assets" in params ? params.assets : undefined) ?? 0n;
    const shares = ("shares" in params ? params.shares : undefined) ?? 0n;
    if (assets < 0n) throw new NegativeInputError("assets", assets);
    if (shares < 0n) throw new NegativeInputError("shares", shares);
    if (assets > 0n && shares > 0n) {
      throw new MutuallyExclusiveWithdrawAmountsError(this.marketParams.id);
    }
    if (assets === 0n && shares === 0n) {
      throw new NonPositiveInputError("assets or shares", 0n);
    }
    if (positionData == null) {
      throw new MissingAccrualPositionError(this.marketParams.id);
    }
    validateAccrualPosition({
      positionData,
      expectedMarketId: this.marketParams.id,
      expectedUser: userAddress,
    });
    if (shares > 0n) {
      validateWithdrawShares({
        positionData,
        withdrawShares: shares,
        marketId: this.marketParams.id,
      });
    } else {
      validateWithdrawAmount({
        positionData,
        withdrawAssets: assets,
        marketId: this.marketParams.id,
      });
    }
    const reallocations = [...(params.reallocations ?? [])];
    // Validate the exact PublicAllocations mapping before requirement reads.
    const publicAllocations = getBlueBundlesV1PublicAllocations(
      reallocations,
      this.marketParams,
    );
    const reallocationPenaltyAssets =
      getBlueBundlesV1PenaltyAssets(publicAllocations);
    const expectedWithdrawAssets =
      assets > 0n ? assets : positionData.market.toSupplyAssets(shares, "Down");
    if (reallocationPenaltyAssets > expectedWithdrawAssets) {
      throw new InputExceedsMaxError({
        field: "reallocationPenaltyAssets",
        value: reallocationPenaltyAssets,
        max: expectedWithdrawAssets,
      });
    }

    return {
      getRequirements: () =>
        this.getAuthorizationRequirements({ userAddress, deadline }),
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { authorization } = selectBlueBundlesV1RequirementSignatures(
          signatures,
          {
            authorization: true,
          },
        );
        return blueWithdraw({
          market: { chainId: this.chainId, marketParams: this.marketParams },
          args: {
            userAddress,
            withdrawAssets: assets,
            withdrawShares: shares,
            reallocations,
            deadline,
            referralFeePct,
            referralFeeRecipient,
            authorizationSignature: authorization,
          },
          metadata: this.client.options.metadata,
        });
      },
    };
  }

  supplyCollateral({
    amount = 0n,
    userAddress,
    nativeAmount,
  }: { userAddress: Address } & DepositAmountArgs) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    if (amount < 0n) {
      throw new NegativeInputError("amount", amount);
    }

    if (nativeAmount !== undefined && nativeAmount < 0n) {
      throw new NegativeInputError("nativeAmount", nativeAmount);
    }

    const totalCollateral = amount + (nativeAmount ?? 0n);
    if (totalCollateral === 0n) {
      throw new NonPositiveInputError("totalCollateral", totalCollateral);
    }

    if (nativeAmount !== undefined && nativeAmount > 0n) {
      validateNativeAsset(this.chainId, this.marketParams.collateralToken);
    }
    return {
      getRequirements: (params?: { useSimplePermit?: boolean }) =>
        getGeneralAdapterRequirements(this.client.viemClient, {
          address: this.marketParams.collateralToken,
          chainId: this.chainId,
          supportSignature: this.client.options.supportSignature,
          supportDeployless: this.client.options.supportDeployless,
          useSimplePermit: params?.useSimplePermit,
          args: { amount, from: userAddress },
        }),

      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { permit } = selectRequirementSignatures(signatures, {
          permit: true,
        });

        return blueSupplyCollateral({
          market: {
            chainId: this.chainId,
            marketParams: this.marketParams,
          },
          args: {
            amount,
            nativeAmount,
            onBehalf: userAddress,
            requirementSignature: permit,
          },
          metadata: this.client.options.metadata,
        });
      },
    };
  }

  borrow({
    amount,
    userAddress,
    positionData,
    slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
    reallocations,
  }: {
    amount: bigint;
    userAddress: Address;
    positionData: AccrualPosition;
    slippageTolerance?: bigint;
    reallocations?: Iterable<VaultV2BlueReallocation>;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    const reallocationList = validateAndNormalizeVaultV2BlueReallocations({
      reallocations,
      targetMarketId: this.marketParams.id,
      chainId: this.chainId,
    });

    if (amount <= 0n) {
      throw new NonPositiveInputError("amount", amount);
    }

    validateSlippageTolerance(slippageTolerance);
    if (!positionData) {
      throw new MissingAccrualPositionError(this.marketParams.id);
    }

    validateAccrualPosition({
      positionData,
      expectedMarketId: this.marketParams.id,
      expectedUser: userAddress,
    });

    validatePositionHealth({
      positionData,
      additionalCollateral: 0n,
      borrowAmount: amount,
      marketId: this.marketParams.id,
      lltv: this.marketParams.lltv,
    });
    const minSharePrice = computeMinBorrowSharePrice({
      borrowAmount: amount,
      market: positionData.market,
      slippageTolerance,
    });

    return {
      getRequirements: async () => {
        const [penaltyRequirements, authTx] = await Promise.all([
          this.getReallocationPenaltyRequirements(
            userAddress,
            reallocationList,
          ),
          getBlueAuthorizationRequirement({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            userAddress,
            supportSignature: this.client.options.supportSignature,
          }),
        ]);
        return [...penaltyRequirements, ...(authTx ? [authTx] : [])];
      },

      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { authorization } = selectRequirementSignatures(signatures, {
          authorization: true,
        });

        return blueBorrow({
          market: {
            chainId: this.chainId,
            marketParams: this.marketParams,
          },
          args: {
            amount,
            receiver: userAddress,
            minSharePrice,
            reallocations: reallocationList,
            authorizationSignature: authorization,
          },
          metadata: this.client.options.metadata,
        });
      },
    };
  }

  repay(
    params: {
      userAddress: Address;
      positionData: AccrualPosition;
      slippageTolerance?: bigint;
    } & RepayAmountArgs,
  ) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    const {
      userAddress,
      positionData,
      slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
    } = params;

    const nativeAmount = params.nativeAmount ?? 0n;
    if (nativeAmount < 0n) {
      throw new NegativeInputError("nativeAmount", nativeAmount);
    }

    const amount = ("amount" in params ? params.amount : undefined) ?? 0n;
    const shares = ("shares" in params ? params.shares : undefined) ?? 0n;
    if (amount < 0n) {
      throw new NegativeInputError("amount", amount);
    }
    if (shares < 0n) {
      throw new NegativeInputError("shares", shares);
    }
    if (amount > 0n && shares > 0n) {
      throw new MutuallyExclusiveRepayAmountsError(this.marketParams.id);
    }

    if ("shares" in params) {
      if (shares === 0n) {
        throw new NonPositiveInputError("shares", shares);
      }
    } else {
      if (amount + nativeAmount <= 0n) {
        throw new NonPositiveInputError(
          "amount + nativeAmount",
          amount + nativeAmount,
        );
      }
    }

    validateSlippageTolerance(slippageTolerance);

    if (!positionData) {
      throw new MissingAccrualPositionError(this.marketParams.id);
    }

    validateAccrualPosition({
      positionData,
      expectedMarketId: this.marketParams.id,
      expectedUser: userAddress,
    });

    if (nativeAmount > 0n) {
      validateNativeAsset(this.chainId, this.marketParams.loanToken);
    }

    let repayAssets: bigint;
    let repayShares: bigint;
    let erc20Amount: bigint;

    // Forward-accrue (2h) before deriving `maxSharePrice` (both modes): on-chain `morphoRepay` accrues `lastUpdate → execution`, so an un-accrued bound reverts on quiet markets.
    const accrualTimestamp =
      MathLib.max(Time.timestamp(), positionData.market.lastUpdate) +
      Time.s.from.h(2n);
    const marketForRepay = positionData.market.accrueInterest(accrualTimestamp);

    if ("shares" in params) {
      validateRepayShares({
        positionData,
        repayShares: shares,
        marketId: this.marketParams.id,
      });
      repayAssets = 0n;
      repayShares = shares;
      const borrowAssets = marketForRepay.toBorrowAssets(shares, "Up");
      // Native funds the transfer first; the ERC-20 pulled is the remainder.
      // When native covers the full (2h-forward-accrued, rounded-up) borrow
      // assets, nothing is pulled as ERC-20 — the bundle wraps the native and
      // skims any residual wNative back to the receiver. So a fully-native
      // shares repay pulls no ERC-20 and emits no loan-token approval requirement.
      erc20Amount = MathLib.zeroFloorSub(borrowAssets, nativeAmount);
    } else {
      // Assets mode is additive, like supply: repaid = amount + nativeAmount.
      repayAssets = amount + nativeAmount;
      validateRepayAmount({
        positionData,
        repayAssets,
        marketId: this.marketParams.id,
      });
      repayShares = 0n;
      erc20Amount = amount;
    }

    const maxSharePrice = computeMaxRepaySharePrice({
      repayAssets,
      repayShares,
      market: marketForRepay,
      slippageTolerance,
    });
    return {
      getRequirements: (reqParams?: { useSimplePermit?: boolean }) => {
        // Fully native repay pulls no ERC-20, so it needs no approval/permit.
        if (erc20Amount === 0n) return Promise.resolve([]);
        return getGeneralAdapterRequirements(this.client.viemClient, {
          address: this.marketParams.loanToken,
          chainId: this.chainId,
          supportSignature: this.client.options.supportSignature,
          supportDeployless: this.client.options.supportDeployless,
          useSimplePermit: reqParams?.useSimplePermit,
          args: { amount: erc20Amount, from: userAddress },
        });
      },

      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { permit } = selectRequirementSignatures(signatures, {
          permit: true,
        });

        return blueRepay({
          market: {
            chainId: this.chainId,
            marketParams: this.marketParams,
          },
          // Shares mode: repay `shares`, ERC-20 to pull = `erc20Amount`.
          // Assets mode: repay `repayAssets` (= amount + native), pull `erc20Amount`.
          args:
            repayShares > 0n
              ? {
                  shares: repayShares,
                  transferAmount: erc20Amount,
                  nativeAmount,
                  onBehalf: userAddress,
                  receiver: userAddress,
                  maxSharePrice,
                  requirementSignature: permit,
                }
              : {
                  amount: erc20Amount,
                  transferAmount: repayAssets,
                  nativeAmount,
                  onBehalf: userAddress,
                  receiver: userAddress,
                  maxSharePrice,
                  requirementSignature: permit,
                },
          metadata: this.client.options.metadata,
        });
      },
    };
  }

  withdrawCollateral({
    userAddress,
    amount,
    positionData,
  }: {
    userAddress: Address;
    amount: bigint;
    positionData: AccrualPosition;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    if (amount <= 0n) {
      throw new NonPositiveInputError("amount", amount);
    }

    if (!positionData) {
      throw new MissingAccrualPositionError(this.marketParams.id);
    }

    validateAccrualPosition({
      positionData,
      expectedMarketId: this.marketParams.id,
      expectedUser: userAddress,
    });

    if (amount > positionData.collateral) {
      throw new WithdrawExceedsCollateralError({
        withdrawAmount: amount,
        available: positionData.collateral,
        market: positionData.marketId,
      });
    }

    validatePositionHealthAfterWithdraw({
      positionData,
      withdrawAmount: amount,
      lltv: this.marketParams.lltv,
      marketId: this.marketParams.id,
    });

    return {
      buildTx: () =>
        blueWithdrawCollateral({
          market: {
            chainId: this.chainId,
            marketParams: this.marketParams,
          },
          args: {
            amount,
            onBehalf: userAddress,
            receiver: userAddress,
          },
          metadata: this.client.options.metadata,
        }),
    };
  }

  repayWithdrawCollateral(
    params: {
      userAddress: Address;
      withdrawAmount: bigint;
      positionData: AccrualPosition;
      slippageTolerance?: bigint;
    } & RepayAmountArgs,
  ) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    const {
      userAddress,
      withdrawAmount,
      positionData,
      slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
    } = params;

    const nativeAmount = params.nativeAmount ?? 0n;
    if (nativeAmount < 0n) {
      throw new NegativeInputError("nativeAmount", nativeAmount);
    }

    const amount = ("amount" in params ? params.amount : undefined) ?? 0n;
    const shares = ("shares" in params ? params.shares : undefined) ?? 0n;
    if (amount < 0n) {
      throw new NegativeInputError("amount", amount);
    }
    if (shares < 0n) {
      throw new NegativeInputError("shares", shares);
    }
    if (amount > 0n && shares > 0n) {
      throw new MutuallyExclusiveRepayAmountsError(this.marketParams.id);
    }

    if ("shares" in params) {
      if (shares === 0n) {
        throw new NonPositiveInputError("shares", shares);
      }
    } else {
      if (amount + nativeAmount <= 0n) {
        throw new NonPositiveInputError(
          "amount + nativeAmount",
          amount + nativeAmount,
        );
      }
    }

    if (withdrawAmount <= 0n) {
      throw new NonPositiveInputError("withdrawAmount", withdrawAmount);
    }

    validateSlippageTolerance(slippageTolerance);

    if (!positionData) {
      throw new MissingAccrualPositionError(this.marketParams.id);
    }

    validateAccrualPosition({
      positionData,
      expectedMarketId: this.marketParams.id,
      expectedUser: userAddress,
    });

    if (nativeAmount > 0n) {
      validateNativeAsset(this.chainId, this.marketParams.loanToken);
    }

    let repayAssets: bigint;
    let repayShares: bigint;
    let erc20Amount: bigint;

    // Forward-accrue (2h) for `maxSharePrice` (both modes) and the post-repay health check: on-chain `morphoRepay` accrues `lastUpdate → execution`, so an un-accrued bound reverts on quiet markets.
    const accrualTimestamp =
      MathLib.max(Time.timestamp(), positionData.market.lastUpdate) +
      Time.s.from.h(2n);
    const marketForRepay = positionData.market.accrueInterest(accrualTimestamp);

    if ("shares" in params) {
      validateRepayShares({
        positionData,
        repayShares: shares,
        marketId: this.marketParams.id,
      });
      repayAssets = 0n;
      repayShares = shares;
      const borrowAssets = marketForRepay.toBorrowAssets(shares, "Up");
      // Native funds the transfer first; the ERC-20 pulled is the remainder.
      // When native covers the full (2h-forward-accrued, rounded-up) borrow
      // assets, nothing is pulled as ERC-20 — the bundle wraps the native and
      // skims any residual wNative back to the receiver. So a fully-native
      // shares repay pulls no ERC-20 and emits no loan-token approval requirement.
      erc20Amount = MathLib.zeroFloorSub(borrowAssets, nativeAmount);
    } else {
      // Assets mode is additive, like supply: repaid = amount + nativeAmount.
      repayAssets = amount + nativeAmount;
      validateRepayAmount({
        positionData,
        repayAssets,
        marketId: this.marketParams.id,
      });
      repayShares = 0n;
      erc20Amount = amount;
    }

    if (withdrawAmount > positionData.collateral) {
      throw new WithdrawExceedsCollateralError({
        withdrawAmount,
        available: positionData.collateral,
        market: positionData.marketId,
      });
    }

    const { position: positionAfterRepay } = positionData.repay(
      repayAssets,
      repayShares,
      accrualTimestamp,
    );
    validatePositionHealthAfterWithdraw({
      positionData: positionAfterRepay,
      withdrawAmount,
      lltv: this.marketParams.lltv,
      marketId: this.marketParams.id,
    });

    const maxSharePrice = computeMaxRepaySharePrice({
      repayAssets,
      repayShares,
      market: marketForRepay,
      slippageTolerance,
    });
    return {
      getRequirements: async (reqParams?: { useSimplePermit?: boolean }) => {
        const [erc20Requirements, authTx] = await Promise.all([
          // Fully native repay pulls no ERC-20, so it needs no approval/permit.
          erc20Amount === 0n
            ? Promise.resolve([])
            : getGeneralAdapterRequirements(this.client.viemClient, {
                address: this.marketParams.loanToken,
                chainId: this.chainId,
                supportSignature: this.client.options.supportSignature,
                supportDeployless: this.client.options.supportDeployless,
                useSimplePermit: reqParams?.useSimplePermit,
                args: { amount: erc20Amount, from: userAddress },
              }),
          getBlueAuthorizationRequirement({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            userAddress,
            supportSignature: this.client.options.supportSignature,
          }),
        ]);

        return [...erc20Requirements, ...(authTx ? [authTx] : [])];
      },

      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { permit, authorization } = selectRequirementSignatures(
          signatures,
          { permit: true, authorization: true },
        );

        return blueRepayWithdrawCollateral({
          market: {
            chainId: this.chainId,
            marketParams: this.marketParams,
          },
          // Shares mode: repay `shares`, ERC-20 to pull = `erc20Amount`.
          // Assets mode: repay `repayAssets` (= amount + native), pull `erc20Amount`.
          args:
            repayShares > 0n
              ? {
                  shares: repayShares,
                  transferAmount: erc20Amount,
                  nativeAmount,
                  withdrawAmount,
                  onBehalf: userAddress,
                  receiver: userAddress,
                  maxSharePrice,
                  requirementSignature: permit,
                  authorizationSignature: authorization,
                }
              : {
                  amount: erc20Amount,
                  transferAmount: repayAssets,
                  nativeAmount,
                  withdrawAmount,
                  onBehalf: userAddress,
                  receiver: userAddress,
                  maxSharePrice,
                  requirementSignature: permit,
                  authorizationSignature: authorization,
                },
          metadata: this.client.options.metadata,
        });
      },
    };
  }

  supplyCollateralBorrow({
    amount = 0n,
    userAddress,
    positionData,
    borrowAmount,
    nativeAmount,
    slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
    reallocations,
  }: {
    userAddress: Address;
    positionData: AccrualPosition;
    borrowAmount: bigint;
    slippageTolerance?: bigint;
    reallocations?: Iterable<VaultV2BlueReallocation>;
  } & DepositAmountArgs) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    const reallocationList = validateAndNormalizeVaultV2BlueReallocations({
      reallocations,
      targetMarketId: this.marketParams.id,
      chainId: this.chainId,
    });

    if (amount < 0n) {
      throw new NegativeInputError("amount", amount);
    }

    if (nativeAmount !== undefined && nativeAmount < 0n) {
      throw new NegativeInputError("nativeAmount", nativeAmount);
    }

    if (borrowAmount <= 0n) {
      throw new NonPositiveInputError("borrowAmount", borrowAmount);
    }

    const totalCollateral = amount + (nativeAmount ?? 0n);
    if (totalCollateral === 0n) {
      throw new NonPositiveInputError("totalCollateral", totalCollateral);
    }

    validateSlippageTolerance(slippageTolerance);
    if (!positionData) {
      throw new MissingAccrualPositionError(this.marketParams.id);
    }

    validateAccrualPosition({
      positionData,
      expectedMarketId: this.marketParams.id,
      expectedUser: userAddress,
    });

    if (nativeAmount !== undefined && nativeAmount > 0n) {
      validateNativeAsset(this.chainId, this.marketParams.collateralToken);
    }

    validatePositionHealth({
      positionData,
      additionalCollateral: totalCollateral,
      borrowAmount,
      marketId: this.marketParams.id,
      lltv: this.marketParams.lltv,
    });

    const minSharePrice = computeMinBorrowSharePrice({
      borrowAmount,
      market: positionData.market,
      slippageTolerance,
    });
    return {
      getRequirements: async (params?: { useSimplePermit?: boolean }) => {
        const penaltyAssets = reallocationList.reduce(
          (total, reallocation) =>
            total +
            VaultV2BluePublicAllocatorConfigUtils.getPenaltyAssets(
              reallocation,
              reallocation.assets,
            ),
          0n,
        );
        const usesSharedFundingToken = isAddressEqual(
          this.marketParams.collateralToken,
          this.marketParams.loanToken,
        );
        const [erc20Requirements, penaltyRequirements, authTx] =
          await Promise.all([
            getGeneralAdapterRequirements(this.client.viemClient, {
              address: this.marketParams.collateralToken,
              chainId: this.chainId,
              supportSignature: this.client.options.supportSignature,
              supportDeployless: this.client.options.supportDeployless,
              useSimplePermit: params?.useSimplePermit,
              args: {
                amount: amount + (usesSharedFundingToken ? penaltyAssets : 0n),
                from: userAddress,
              },
            }),
            usesSharedFundingToken
              ? []
              : this.getReallocationPenaltyRequirements(
                  userAddress,
                  reallocationList,
                ),
            getBlueAuthorizationRequirement({
              viemClient: this.client.viemClient,
              chainId: this.chainId,
              userAddress,
              supportSignature: this.client.options.supportSignature,
            }),
          ]);

        return [
          ...erc20Requirements,
          ...penaltyRequirements,
          ...(authTx ? [authTx] : []),
        ];
      },

      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { permit, authorization } = selectRequirementSignatures(
          signatures,
          { permit: true, authorization: true },
        );

        return blueSupplyCollateralBorrow({
          market: {
            chainId: this.chainId,
            marketParams: this.marketParams,
          },
          args: {
            amount,
            nativeAmount,
            borrowAmount,
            onBehalf: userAddress,
            receiver: userAddress,
            minSharePrice,
            requirementSignature: permit,
            authorizationSignature: authorization,
            reallocations: reallocationList,
          },
          metadata: this.client.options.metadata,
        });
      },
    };
  }

  refinance({
    userAddress,
    positionData,
    target,
    collateralAmount,
    borrowAssets,
    borrowShares,
    slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
    targetReallocations,
  }: {
    userAddress: Address;
    positionData: AccrualPosition;
    target: {
      marketParams: MarketParams;
      positionData: AccrualPosition;
    };
    collateralAmount: bigint;
    borrowAssets?: bigint;
    borrowShares?: bigint;
    slippageTolerance?: bigint;
    targetReallocations?: Iterable<VaultV2BlueReallocation>;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateSlippageTolerance(slippageTolerance);
    const targetReallocationList = validateAndNormalizeVaultV2BlueReallocations(
      {
        reallocations: targetReallocations,
        targetMarketId: target.marketParams.id,
        chainId: this.chainId,
      },
    );

    if (collateralAmount <= 0n) {
      throw new NonPositiveInputError("collateralAmount", collateralAmount);
    }

    const requestedAssets = borrowAssets ?? 0n;
    const requestedShares = borrowShares ?? 0n;
    if (requestedAssets < 0n) {
      throw new NegativeInputError("borrowAssets", requestedAssets);
    }
    if (requestedShares < 0n) {
      throw new NegativeInputError("borrowShares", requestedShares);
    }
    if (requestedAssets > 0n && requestedShares > 0n) {
      throw new BorrowAmountAndSharesExclusiveError(this.marketParams.id);
    }
    if (!positionData) {
      throw new MissingAccrualPositionError(this.marketParams.id);
    }

    validateAccrualPosition({
      positionData,
      expectedMarketId: this.marketParams.id,
      expectedUser: userAddress,
    });

    if (this.marketParams.id === target.marketParams.id) {
      throw new RefinanceSameMarketError(this.marketParams.id);
    }

    if (
      !isAddressEqual(
        this.marketParams.collateralToken,
        target.marketParams.collateralToken,
      ) ||
      !isAddressEqual(
        this.marketParams.loanToken,
        target.marketParams.loanToken,
      )
    ) {
      throw new RefinanceTokenMismatchError(
        this.marketParams.id,
        target.marketParams.id,
      );
    }

    validateAccrualPosition({
      positionData: target.positionData,
      expectedMarketId: target.marketParams.id,
      expectedUser: userAddress,
    });

    const sharesMode = requestedShares > 0n;
    const shouldMigrateBorrow = requestedAssets > 0n || sharesMode;

    if (collateralAmount > positionData.collateral) {
      throw new RefinanceExceedsCollateralError({
        market: this.marketParams.id,
        requested: collateralAmount,
        available: positionData.collateral,
      });
    }

    if (requestedShares > positionData.borrowShares) {
      throw new RefinanceExceedsBorrowSharesError({
        market: this.marketParams.id,
        requested: requestedShares,
        available: positionData.borrowShares,
      });
    }

    if (requestedAssets > positionData.borrowAssets) {
      throw new RefinanceExceedsBorrowAssetsError({
        market: this.marketParams.id,
        requested: requestedAssets,
        available: positionData.borrowAssets,
      });
    }

    // Forward-accrue both markets to now (clamped to lastUpdate). Source gets a 2h buffer in
    // shares mode (as in repay()) for repay headroom; target accrues without buffer to avoid
    // tightening minBorrowSharePrice past on-chain reality.
    const sourceAccrualTimestamp =
      MathLib.max(Time.timestamp(), positionData.market.lastUpdate) +
      (sharesMode ? Time.s.from.h(2n) : 0n);
    const targetAccrualTimestamp = MathLib.max(
      Time.timestamp(),
      target.positionData.market.lastUpdate,
    );
    const accruedSource = positionData.market.accrueInterest(
      sourceAccrualTimestamp,
    );
    const accruedTarget = target.positionData.market.accrueInterest(
      targetAccrualTimestamp,
    );

    // Shares burned by the source repay: exact in shares mode, else mirror Morpho's toSharesDown.
    const repaidShares = sharesMode
      ? requestedShares
      : accruedSource.toBorrowShares(requestedAssets, "Down");

    // Post-state source health: any remaining debt must stay healthy (accrued market).
    const remainingCollateral = positionData.collateral - collateralAmount;
    const remainingShares = positionData.borrowShares - repaidShares;
    if (remainingShares > 0n) {
      const residualPosition = new AccrualPosition(
        {
          user: positionData.user,
          supplyShares: positionData.supplyShares,
          borrowShares: remainingShares,
          collateral: remainingCollateral,
        },
        accruedSource,
      );
      validatePositionHealth({
        positionData: residualPosition,
        additionalCollateral: 0n,
        borrowAmount: 0n,
        marketId: this.marketParams.id,
        lltv: this.marketParams.lltv,
      });
    }

    const projectedBorrowAssets = sharesMode
      ? accruedSource.toBorrowAssets(requestedShares, "Up")
      : requestedAssets;

    // Shares-mode overshoot covers target drift + accrual on the borrow leg. Computed before the
    // LLTV check so health validates the actual on-chain borrow, not the smaller projected value.
    const borrowAssetsAdjusted = sharesMode
      ? MathLib.wMulUp(projectedBorrowAssets, MathLib.WAD + slippageTolerance)
      : projectedBorrowAssets;

    // Post-state target health: aggregate must respect LLTV − buffer. Skipped for collat-only
    // refinances, which can't degrade target health and would fail on missing-oracle markets.
    if (shouldMigrateBorrow) {
      const accruedTargetPosition = target.positionData.accrueInterest(
        targetAccrualTimestamp,
      );
      validatePositionHealth({
        positionData: accruedTargetPosition,
        additionalCollateral: collateralAmount,
        borrowAmount: borrowAssetsAdjusted,
        marketId: target.marketParams.id,
        lltv: target.marketParams.lltv,
      });
    }

    // Share-price bounds only when a debt leg exists (helpers throw on zero inputs); else 0n.
    // Derived from borrowAssetsAdjusted (the encoded value) so rounding can't push the on-chain
    // ratio below a guard computed from the smaller projected amount.
    const minBorrowSharePrice = shouldMigrateBorrow
      ? computeMinBorrowSharePrice({
          borrowAmount: borrowAssetsAdjusted,
          market: accruedTarget,
          slippageTolerance,
        })
      : 0n;

    const maxRepaySharePrice = shouldMigrateBorrow
      ? computeMaxRepaySharePrice({
          repayAssets: requestedAssets,
          repayShares: requestedShares,
          market: accruedSource,
          slippageTolerance,
        })
      : 0n;

    return {
      getRequirements: async () => {
        const [penaltyRequirements, authTx] = await Promise.all([
          this.getReallocationPenaltyRequirements(
            userAddress,
            targetReallocationList,
          ),
          getBlueAuthorizationRequirement({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            userAddress,
            supportSignature: this.client.options.supportSignature,
          }),
        ]);
        return [...penaltyRequirements, ...(authTx ? [authTx] : [])];
      },

      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { authorization } = selectRequirementSignatures(signatures, {
          authorization: true,
        });

        return blueRefinance({
          source: {
            chainId: this.chainId,
            marketParams: this.marketParams,
          },
          target: { marketParams: target.marketParams },
          args: {
            user: userAddress,
            collateralAmount,
            borrowAssets: borrowAssetsAdjusted,
            borrowShares: requestedShares,
            minBorrowSharePrice,
            maxRepaySharePrice,
            targetReallocations: targetReallocationList,
            authorizationSignature: authorization,
          },
          metadata: this.client.options.metadata,
        });
      },
    };
  }

  /**
   * Fetches all on-chain inputs needed to compute public allocator reallocations.
   *
   * @param params.vaultAddresses - Vaults to inspect for source-market liquidity.
   * @param params.block.number - Block number used for every RPC read.
   * @param params.block.timestamp - Timestamp corresponding to the fetched block.
   * @returns Reallocation data ready for {@link getVaultV1Reallocations}.
   * @throws {ChainIdMismatchError} when the client chain does not match this market.
   * @deprecated Prefer {@link getVaultV2BlueReallocationData} for high-level Blue writes. This V1
   * snapshot remains available for low-level Bundler3 composition.
   * @example
   * ```ts
   * import { markets, vaults } from "@morpho-org/morpho-test";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   * import type { VaultV1ReallocationData } from "@morpho-org/morpho-sdk/entities";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const market = client.morpho.blue(markets[mainnet.id].usdc_wbtc, mainnet.id);
   * const block = await client.getBlock();
   * const data: VaultV1ReallocationData = await market.getVaultV1ReallocationData({
   *   vaultAddresses: [vaults[mainnet.id].steakUsdc.address],
   *   block,
   * });
   * ```
   */
  async getVaultV1ReallocationData({
    vaultAddresses,
    block,
  }: {
    vaultAddresses: readonly Address[];
    block: {
      readonly number: bigint;
      readonly timestamp: bigint;
    };
  }): Promise<VaultV1ReallocationData> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    const client = this.client.viemClient;
    const fetchParams = {
      blockNumber: block.number,
      chainId: this.chainId,
      deployless: this.client.options.supportDeployless,
    };

    const targetMarketId = this.marketParams.id;

    // Phase 1: Fetch the target market and all vaults at `block.number` in
    // parallel so every row of the resulting state comes from the same epoch
    // and the planner never trusts a caller-owned target-market snapshot.
    const [targetMarket, vaults] = await Promise.all([
      fetchMarket(targetMarketId, client, fetchParams),
      Promise.all(
        vaultAddresses.map((addr) => fetchVault(addr, client, fetchParams)),
      ),
    ]);

    const allMarketIds = new Set<MarketId>([targetMarketId]);
    const vaultMarketPairs: { vault: Address; marketId: MarketId }[] = [];

    for (const vault of vaults) {
      // Always include target market pair so its config/position is fetched
      // even when the target market is only in the vault's supplyQueue.
      vaultMarketPairs.push({ vault: vault.address, marketId: targetMarketId });
      for (const mid of vault.withdrawQueue) {
        allMarketIds.add(mid);
        if (mid !== targetMarketId) {
          vaultMarketPairs.push({ vault: vault.address, marketId: mid });
        }
      }
    }

    // Phase 2: Fetch all source markets, vault configs, and positions in parallel.
    const sourceMarketIds = [...allMarketIds].filter(
      (mid) => mid !== targetMarketId,
    );

    const [markets, configs, positions] = await Promise.all([
      Promise.all(
        sourceMarketIds.map((mid) => fetchMarket(mid, client, fetchParams)),
      ),
      Promise.all(
        vaultMarketPairs.map(({ vault, marketId: mid }) =>
          fetchVaultMarketConfig(vault, mid, client, fetchParams).then(
            (config) => ({ vault, mid, config }),
          ),
        ),
      ),
      Promise.all(
        vaultMarketPairs.map(({ vault, marketId: mid }) =>
          fetchPosition(vault, mid, client, fetchParams).then((position) => ({
            vault,
            mid,
            position,
          })),
        ),
      ),
    ]);

    // Assemble records for VaultV1ReallocationData.
    const marketsRecord: Record<MarketId, Market | undefined> = {
      [targetMarketId]: targetMarket,
    };
    for (const m of markets) {
      marketsRecord[m.id] = m;
    }

    const vaultsRecord: Record<Address, Vault | undefined> = {};
    for (const v of vaults) {
      vaultsRecord[v.address] = v;
    }

    const vaultMarketConfigsRecord: Record<
      Address,
      Record<MarketId, VaultMarketConfig | undefined>
    > = {};
    for (const { vault, mid, config } of configs) {
      (vaultMarketConfigsRecord[vault] ??= {})[mid] = config;
    }

    const positionsRecord: Record<
      Address,
      Record<MarketId, Position | undefined>
    > = {};
    for (const { vault, mid, position } of positions) {
      (positionsRecord[vault] ??= {})[mid] = position;
    }

    return new VaultV1ReallocationData({
      chainId: this.chainId,
      markets: marketsRecord,
      vaults: vaultsRecord,
      vaultMarketConfigs: vaultMarketConfigsRecord,
      positions: positionsRecord,
    });
  }

  /**
   * Fetches Vault V1 PublicAllocator state using the deprecated unversioned name.
   *
   * @param params.vaultAddresses - Addresses of MetaMorpho vaults that allocate to this market.
   * @param params.block.number - Block number used for every RPC read.
   * @param params.block.timestamp - Timestamp corresponding to the fetched block.
   * @returns A `VaultV1ReallocationData` snapshot populated from one block.
   * @throws {ChainIdMismatchError} when the client chain does not match this market.
   * @deprecated Use {@link getVaultV1ReallocationData} instead.
   * @example
   * ```ts
   * const data = await market.getReallocationData({ vaultAddresses, block });
   * // Equivalent to market.getVaultV1ReallocationData({ vaultAddresses, block }).
   * ```
   */
  getReallocationData(params: {
    vaultAddresses: readonly Address[];
    block: {
      readonly number: bigint;
      readonly timestamp: bigint;
    };
  }): Promise<VaultV1ReallocationData> {
    return this.getVaultV1ReallocationData(params);
  }

  /**
   * Fetches Vault V2 BluePublicAllocator state for this target market.
   *
   * Reads the target Morpho Blue market, each Vault V2 accrual tree, and each
   * vault's BluePublicAllocator permissions and allocation caps at one block.
   *
   * @param params.vaultAddresses - Vault V2 addresses to inspect for market or idle liquidity.
   * @param params.block.number - Block number used for every RPC read.
   * @param params.block.timestamp - Timestamp corresponding to the fetched block.
   * @returns A `VaultV2BlueReallocationData` snapshot ready for {@link getVaultV2BlueReallocations}.
   * @throws {ChainIdMismatchError} when the client chain does not match this market.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when the chain has no BluePublicAllocator deployment.
   * @throws {UnknownBlueFactory} when the chain has no Vault V2 factory.
   * @throws {UnknownBlueOfFactory} when a requested address is not a Vault V2 from that factory.
   * @throws {UnsupportedBlueVaultV2AdapterError} when a vault contains an unsupported adapter.
   * @throws {viem.BaseError} when an RPC or contract read fails with no fallback left.
   * @example
   * ```ts
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   * import type { VaultV2BlueReallocationData } from "@morpho-org/morpho-sdk/entities";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const market = client.morpho.blue(markets[mainnet.id].usdc_wbtc, mainnet.id);
   * const block = await client.getBlock();
   * const keyrockUsdcVaultV2 = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
   * const data: VaultV2BlueReallocationData =
   *   await market.getVaultV2BlueReallocationData({
   *     vaultAddresses: [keyrockUsdcVaultV2],
   *     block,
   *   });
   * ```
   */
  async getVaultV2BlueReallocationData({
    vaultAddresses,
    block,
  }: {
    vaultAddresses: readonly Address[];
    block: {
      readonly number: bigint;
      readonly timestamp: bigint;
    };
  }): Promise<VaultV2BlueReallocationData> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    const client = this.client.viemClient;
    const fetchParams = {
      blockNumber: block.number,
      chainId: this.chainId,
      deployless: this.client.options.supportDeployless,
    };
    const [targetMarket, vaultEntries] = await Promise.all([
      fetchMarket(this.marketParams.id, client, fetchParams),
      Promise.all(
        vaultAddresses.map(async (address) => {
          const vault = await fetchAccrualVaultV2(address, client, fetchParams);
          const publicAllocatorData = await fetchVaultV2BluePublicAllocatorData(
            vault,
            client,
            {
              ...fetchParams,
              targetMarketParams: this.marketParams,
            },
          );
          return { publicAllocatorData, vault };
        }),
      ),
    ]);

    return new VaultV2BlueReallocationData({
      chainId: this.chainId,
      markets: { [targetMarket.id]: targetMarket },
      vaults: Object.fromEntries(
        vaultEntries.map(({ vault }) => [vault.address, vault]),
      ),
      allocations: Object.fromEntries(
        vaultEntries.map(({ publicAllocatorData, vault }) => [
          vault.address,
          publicAllocatorData.allocations,
        ]),
      ),
      publicAllocatorConfigs: Object.fromEntries(
        vaultEntries.map(({ publicAllocatorData, vault }) => [
          vault.address,
          publicAllocatorData.publicAllocatorConfig,
        ]),
      ),
      activeAdapters: Object.fromEntries(
        vaultEntries.map(({ publicAllocatorData, vault }) => [
          vault.address,
          publicAllocatorData.activeAdapters,
        ]),
      ),
      marketPublicAllocatorConfigs: Object.fromEntries(
        vaultEntries.map(({ publicAllocatorData, vault }) => [
          vault.address,
          publicAllocatorData.marketPublicAllocatorConfigs,
        ]),
      ),
    });
  }

  /**
   * Computes Vault V1 PublicAllocator reallocations for this market.
   *
   * Pass `{ borrowAmount }` for a borrow (legacy alias, equivalent to `{ operation: "borrow", amount }`)
   * or `{ operation, amount }` for a borrow or loan-asset withdraw.
   *
   * @param params - Reallocation computation parameters.
   * @param params.reallocationData - State returned by {@link getVaultV1ReallocationData}.
   * @param params.operation - The operation driving the reallocation (`"borrow"` or `"withdraw"`).
   * @param params.amount - The borrow or withdraw amount used to compute the post-state utilization.
   * @param params.borrowAmount - {@deprecated Pass `{ operation: "borrow", amount }` instead.}
   * @param params.options - Optional allocator and utilization options.
   * @returns Vault V1 reallocations for explicit low-level Bundler3 composition.
   * @throws {ChainIdMismatchError} when `reallocationData` belongs to a different chain than this market.
   * @throws {InsufficientSharedLiquidityError} when shared liquidity cannot cover the operation's absolute shortfall on the target market.
   * @throws {ReallocationWithdrawExceedsMarketSupplyError} when `operation === "withdraw"` and `amount` exceeds the target market's `totalSupplyAssets`.
   * @throws {MissingPublicAllocatorConfigError} when a selected vault is missing its public allocator config.
   * @throws {UnknownReallocationMarketError} when the target market is absent from the reallocation data.
   * @deprecated Prefer {@link getVaultV2BlueReallocations} for high-level Blue writes. This V1
   * planner remains available for low-level Bundler3 composition.
   * @example
   * ```ts
   * const reallocations = market.getVaultV1Reallocations({
   *   reallocationData,
   *   operation: "borrow",
   *   amount: 1_000_000n,
   * });
   * ```
   */
  getVaultV1Reallocations(
    params: VaultV1ReallocationsParams,
  ): readonly VaultV1Reallocation[] {
    validateChainId(params.reallocationData.chainId, this.chainId);

    const marketId = this.marketParams.id;
    const options = { enabled: true, ...params.options };

    if (params.borrowAmount !== undefined) {
      return computeVaultV1Reallocations({
        reallocationData: params.reallocationData,
        marketId,
        operation: "borrow",
        amount: params.borrowAmount,
        options,
      });
    }

    return computeVaultV1Reallocations({
      reallocationData: params.reallocationData,
      marketId,
      operation: params.operation,
      amount: params.amount,
      options,
    });
  }

  /**
   * Computes Vault V1 PublicAllocator reallocations using the deprecated unversioned name.
   *
   * @param params.reallocationData - State returned by {@link getVaultV1ReallocationData}.
   * @param params.operation - The operation driving the reallocation (`"borrow"` or `"withdraw"`).
   * @param params.amount - The borrow or withdraw amount used to compute post-state utilization.
   * @param params.borrowAmount - Deprecated borrow amount alias.
   * @param params.options - Optional allocator and utilization options.
   * @returns Vault V1 reallocations for explicit low-level Bundler3 composition.
   * @throws {ChainIdMismatchError} when `reallocationData` belongs to another chain.
   * @throws {InsufficientSharedLiquidityError} when shared liquidity cannot cover the operation.
   * @throws {ReallocationWithdrawExceedsMarketSupplyError} when a withdrawal exceeds market supply.
   * @throws {MissingPublicAllocatorConfigError} when a selected vault lacks allocator state.
   * @throws {UnknownReallocationMarketError} when the target market is absent.
   * @deprecated Use {@link getVaultV1Reallocations} instead.
   * @example
   * ```ts
   * const reallocations = market.getReallocations({
   *   reallocationData,
   *   operation: "borrow",
   *   amount: 1_000_000n,
   * });
   * ```
   */
  getReallocations(
    params: VaultV1ReallocationsParams,
  ): readonly VaultV1Reallocation[] {
    return this.getVaultV1Reallocations(params);
  }

  /**
   * Computes Vault V2 BluePublicAllocator reallocations for this market.
   *
   * @param params.reallocationData - State returned by {@link getVaultV2BlueReallocationData}.
   * @param params.options - Optional allocator discovery controls and operation to support.
   * @returns Action-ready reallocations and their post-simulation state.
   * @throws {ChainIdMismatchError} when `reallocationData` belongs to another chain.
   * @throws {NegativeInputError} when a utilization or penalty limit is negative.
   * @throws {InputExceedsMaxError} when a utilization or penalty limit exceeds WAD.
   * @throws {NonPositiveInputError} when an enabled operation amount is not positive.
   * @throws {UnknownReallocationMarketError} when a required market is absent.
   * @throws {UnknownReallocationVaultError} when configured vault state is absent.
   * @throws {UnknownReallocationPublicAllocatorConfigError} when allocator authorization state is absent.
   * @throws {UnknownReallocationActiveAdaptersError} when active-adapter state is absent.
   * @throws {UnknownReallocationMarketPublicAllocatorConfigError} when an adapter-market allocator configuration is absent.
   * @throws {UnknownReallocationAllocationError} when required allocation state is absent.
   * @throws {ReallocationAdapterSupplySharesUnderflowError} when an inconsistent adapter snapshot underflows during the final transition.
   * @throws {ReallocationAllocationUnderflowError} when an inconsistent allocation snapshot underflows during the final transition.
   * @throws {InsufficientSharedLiquidityError} when selected liquidity cannot cover the shortfall.
   * @throws {ReallocationWithdrawExceedsMarketSupplyError} when a withdrawal exceeds market supply.
   * @example
   * ```ts
   * const result = market.getVaultV2BlueReallocations({
   *   reallocationData,
   *   options: { operation: { type: "borrow", amount: 1_000_000n } },
   * });
   * ```
   */
  getVaultV2BlueReallocations({
    reallocationData,
    options,
  }: VaultV2BlueReallocationsParams): {
    readonly reallocations: readonly VaultV2BlueReallocation[];
    readonly data: VaultV2BlueReallocationData;
  } {
    validateChainId(reallocationData.chainId, this.chainId);

    return reallocationData.computeVaultV2BlueReallocations(
      this.marketParams.id,
      options,
    );
  }
}
