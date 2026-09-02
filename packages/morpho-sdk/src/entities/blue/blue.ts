import {
  type AccrualPosition,
  type Market,
  type MarketId,
  type MarketParams,
  MathLib,
  type Position,
  type Vault,
  type VaultMarketConfig,
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
import { type Address, getAddress, isAddressEqual, maxUint256 } from "viem";
import {
  getBlueBundlesV1PenaltyAssets,
  getBlueBundlesV1PublicAllocations,
  getBlueBundlesV1ReferralFeeAssets,
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
} from "../../actions/index.js";
import {
  computeVaultV1Reallocations,
  DEFAULT_LLTV_BUFFER,
  MAX_TOKEN_APPROVALS,
  validateAccrualPosition,
  validateChainId,
  validatePositionHealth,
  validatePositionHealthAfterWithdraw,
  validateRepayAmount,
  validateRepayShares,
  validateWithdrawAmount,
  validateWithdrawShares,
} from "../../helpers/index.js";
import type { FetchParameters } from "../../types/data.js";
import {
  type ActionOutput,
  type ActionRequirement,
  type AssetsOrSharesArgs,
  type BlueBorrowAction,
  type BlueRefinanceAction,
  type BlueRepayAction,
  type BlueRepayWithdrawCollateralAction,
  type BlueSupplyAction,
  type BlueSupplyCollateralAction,
  type BlueSupplyCollateralBorrowAction,
  type BlueWithdrawAction,
  type BlueWithdrawCollateralAction,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  MaxRepayAssetsBelowRepayAssetsError,
  MissingAccrualPositionError,
  type MorphoClientType,
  MutuallyExclusiveRepayAmountsError,
  MutuallyExclusiveWithdrawAmountsError,
  NegativeInputError,
  NonPositiveInputError,
  type ReallocationComputeOptions,
  ReallocationsRequireBorrowError,
  RefinanceSameMarketError,
  RefinanceTokenMismatchError,
  type RequirementSignature,
  type VaultV1Reallocation,
  type VaultV2BluePublicAllocatorOptions,
  type VaultV2BlueReallocation,
} from "../../types/index.js";
import { getBlueBundlesV1TokenRequirements } from "../requirements/index.js";
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
  readonly useSimplePermit?: boolean;
  /** Explicit unused Permit2 SignatureTransfer unordered nonce. */
  readonly permit2Nonce?: bigint;
  /**
   * Classic ERC-20 allowance to set when an approval is needed, enabling a reusable approval (for
   * example `maxUint256`). Defaults to the exact pulled amount. Ignored by signature paths.
   */
  readonly approvalAmount?: bigint;
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
   * Prepares a direct BlueBundlesV1 collateral supply.
   *
   * This is the single-operation form of {@link BlueActions.supplyCollateralBorrow}; it supplies
   * `collateralAssets` and fixes the inactive borrow leg to zero. Token requirements target
   * BlueBundlesV1 unless the collateral is funded exclusively with the chain's native asset.
   *
   * @param params.userAddress - User funding and receiving the collateral position.
   * @param params.collateralAssets - Gross collateral assets supplied.
   * @param params.nativeAmount - Optional full native funding equal to `collateralAssets`.
   * @param params.deadline - Final call deadline in Unix seconds.
   * @param params.referralFeePct - Optional WAD-scaled referral fee below 100%.
   * @param params.referralFeeRecipient - Recipient required for a positive fee.
   * @returns Lazy token prerequisite resolution and a synchronous deep-frozen transaction.
   * @throws {ChainIdMismatchError} when the client targets another chain.
   * @throws {ExpiredDeadlineError} when the deadline is stale.
   * @throws {NonPositiveInputError} when `collateralAssets` is not positive.
   * @throws {NegativeInputError} when collateral, native funding, or the referral fee is negative.
   * @throws {NativeFundingAmountMismatchError} when native funding is partial or mixed.
   * @throws {ChainWNativeMissingError} when native funding is requested without registered wNative.
   * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets another token.
   * @throws {InputExceedsMaxError} when the referral fee is at least WAD.
   * @throws {MissingReferralFeeRecipientError} when a positive fee has no recipient.
   * @throws {MissingPermit2TransferFromNonceError} from `getRequirements()` when Permit2 is selected without a nonce.
   * @throws {Permit2TransferFromNonceAlreadyUsedError} from `getRequirements()` when the explicit Permit2 nonce is consumed.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple token signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when an unsupported signature is supplied.
   * @throws {DepositOwnerMismatchError} from `buildTx()` when the signed owner differs from `userAddress`.
   * @throws {DepositAssetMismatchError} from `buildTx()` when the signed asset differs from the collateral token.
   * @throws {DepositAmountMismatchError} from `buildTx()` when the signed amount differs from `collateralAssets`.
   * @throws {DepositSpenderMismatchError} from `buildTx()` when the signed spender is not BlueBundlesV1.
   * @throws {BlueBundlesV1RequirementSignatureMismatchError} from `buildTx()` when a signature cannot be encoded safely.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
   * @throws {viem.BaseError} from `getRequirements()` when an allowance, nonce, or token metadata read fails.
   * @example
   * ```ts
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http, zeroAddress } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const market = client.morpho.blue(markets[mainnet.id].usdc_wbtc, mainnet.id);
   * const action = market.supplyCollateral({
   *   userAddress: zeroAddress,
   *   collateralAssets: 10n ** 18n,
   *   deadline: 1_900_000_000n,
   * });
   * const requirements = await action.getRequirements();
   * const tx = action.buildTx();
   * ```
   */
  supplyCollateral: (params: {
    readonly userAddress: Address;
    readonly collateralAssets: bigint;
    readonly nativeAmount?: bigint;
    readonly deadline: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
  }) => ActionOutput<
    BlueSupplyCollateralAction,
    readonly RequirementSignature[],
    BlueTokenRequirementsParams
  >;

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
    readonly userAddress: Address;
    readonly assets: bigint;
    readonly nativeAmount?: bigint;
    readonly deadline: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
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
      readonly userAddress: Address;
      readonly positionData: AccrualPosition;
      readonly reallocations?: Iterable<VaultV2BlueReallocation>;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & AssetsOrSharesArgs,
  ) => ActionOutput<
    BlueWithdrawAction,
    readonly RequirementSignature[],
    undefined
  >;

  /**
   * Prepares a direct BlueBundlesV1 loan-asset borrow.
   *
   * This is the single-operation form of {@link BlueActions.supplyCollateralBorrow}; it borrows
   * `borrowAssets` and fixes the inactive collateral-supply leg to zero. The pre-fetched position
   * is forward-accrued for the buffered LLTV check.
   *
   * @param params.userAddress - User whose debt position changes.
   * @param params.borrowAssets - Gross loan assets borrowed before penalties and referral fees.
   * @param params.positionData - Pre-fetched position used for the health check.
   * @param params.reallocations - Optional Vault V2 reallocations before borrowing.
   * @param params.deadline - Final call deadline in Unix seconds.
   * @param params.referralFeePct - Optional WAD-scaled referral fee below 100%.
   * @param params.referralFeeRecipient - Recipient required for a positive fee.
   * @returns Lazy Blue authorization resolution and a synchronous deep-frozen transaction.
   * @throws {ChainIdMismatchError} when the client targets another chain.
   * @throws {ExpiredDeadlineError} when the deadline is stale.
   * @throws {MissingAccrualPositionError} when no position snapshot is provided.
   * @throws {MarketIdMismatchError} when `positionData` belongs to another market.
   * @throws {AccrualPositionUserMismatchError} when `positionData` belongs to another user.
   * @throws {MissingMarketPriceError} when the health check has no oracle price.
   * @throws {BorrowExceedsSafeLtvError} when the resulting position exceeds buffered LLTV.
   * @throws {NonPositiveInputError} when `borrowAssets` is not positive.
   * @throws {NegativeInputError} when the borrow, fee, or a reallocation value is negative.
   * @throws {InputExceedsMaxError} when a fee, penalty, or reallocation exceeds its bound.
   * @throws {MissingReferralFeeRecipientError} when a positive fee has no recipient.
   * @throws {InvalidReallocationAddressError} when a vault or adapter address is malformed.
   * @throws {InvalidReallocationShapeError} when a reallocation entry is not a valid Vault V2 reallocation.
   * @throws {InvalidReallocationSourceTypeError} when a reallocation source is malformed.
   * @throws {InconsistentReallocationPenaltyError} when one vault uses different penalties.
   * @throws {ReallocationWithdrawalOnTargetMarketError} when a source is the target market.
   * @throws {ReallocationLoanTokenMismatchError} when a source uses another loan token.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple authorization signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a token signature is supplied.
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
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const market = client.morpho.blue(markets[mainnet.id].usdc_wbtc, mainnet.id);
   * const userAddress = zeroAddress;
   * const positionData = new AccrualPosition(
   *   { user: userAddress, supplyShares: 0n, borrowShares: 0n, collateral: 10n ** 18n },
   *   await market.getMarketData(),
   * );
   * const action = market.borrow({
   *   userAddress,
   *   borrowAssets: 1_000_000n,
   *   positionData,
   *   deadline: 1_900_000_000n,
   * });
   * const requirements = await action.getRequirements();
   * const tx = action.buildTx();
   * ```
   */
  borrow: (params: {
    readonly userAddress: Address;
    readonly borrowAssets: bigint;
    readonly positionData: AccrualPosition;
    readonly reallocations?: Iterable<VaultV2BlueReallocation>;
    readonly deadline: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
  }) => ActionOutput<
    BlueBorrowAction,
    readonly RequirementSignature[],
    undefined
  >;

  /**
   * Prepares a direct BlueBundlesV1 loan-asset repayment.
   *
   * This is the single-operation form of {@link BlueActions.repayWithdrawCollateral}; it repays
   * exact assets or shares and fixes the inactive collateral-withdrawal leg to zero. A saturated
   * `repayShares = maxUint256` closes the live debt using a bounded, refundable funding cap.
   *
   * @param params.userAddress - User whose debt position changes.
   * @param params.positionData - Pre-fetched position used to validate and quote repayment.
   * @param params.repayAssets - Exact assets repaid, exclusive with `repayShares`.
   * @param params.repayShares - Exact shares, or `maxUint256` for a full repay.
   * @param params.nativeAmount - Optional full native funding equal to the derived repayment cap.
   * @param params.deadline - Final call deadline in Unix seconds.
   * @param params.referralFeePct - Optional WAD-scaled referral fee below 100%.
   * @param params.referralFeeRecipient - Recipient required for a positive fee.
   * @returns Lazy token prerequisite resolution and a synchronous deep-frozen transaction.
   * @throws {ChainIdMismatchError} when the client targets another chain.
   * @throws {ExpiredDeadlineError} when the deadline is stale.
   * @throws {MissingAccrualPositionError} when no position snapshot is provided.
   * @throws {MarketIdMismatchError} when `positionData` belongs to another market.
   * @throws {AccrualPositionUserMismatchError} when `positionData` belongs to another user.
   * @throws {NegativeInputError} when an amount, native funding, or referral fee is negative.
   * @throws {NonPositiveInputError} when no positive repayment is provided.
   * @throws {MutuallyExclusiveRepayAmountsError} when assets and shares are both nonzero.
   * @throws {RepayExceedsDebtError} when an exact asset repay exceeds current debt.
   * @throws {RepaySharesExceedDebtError} when non-saturated shares exceed current debt shares.
   * @throws {InputExceedsMaxError} when a fee is out of bounds or a share quote deadline is too far away.
   * @throws {MaxRepayAssetsBelowRepayAssetsError} when a signed share cap no longer covers the fresh quote.
   * @throws {MissingReferralFeeRecipientError} when a positive fee has no recipient.
   * @throws {NativeFundingAmountMismatchError} when native funding is partial or mixed.
   * @throws {ChainWNativeMissingError} when native funding is requested on a chain without wNative.
   * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets another token.
   * @throws {MissingPermit2TransferFromNonceError} from `getRequirements()` when Permit2 is selected without a nonce.
   * @throws {Permit2TransferFromNonceAlreadyUsedError} from `getRequirements()` when the explicit Permit2 nonce is consumed.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple token signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when an authorization signature is supplied.
   * @throws {DepositOwnerMismatchError} from `buildTx()` when the signed owner differs from `userAddress`.
   * @throws {DepositAssetMismatchError} from `buildTx()` when the signed asset differs from the loan token.
   * @throws {DepositAmountMismatchError} from `buildTx()` when the signed amount differs from the derived funding cap.
   * @throws {DepositSpenderMismatchError} from `buildTx()` when the signed spender is not BlueBundlesV1.
   * @throws {BlueBundlesV1RequirementSignatureMismatchError} from `buildTx()` when a signature cannot be encoded safely.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
   * @throws {viem.BaseError} from `getRequirements()` when an allowance, nonce, or token metadata read fails.
   * @example
   * ```ts
   * import { AccrualPosition } from "@morpho-org/blue-sdk";
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http, maxUint256, zeroAddress } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const market = client.morpho.blue(markets[mainnet.id].usdc_wbtc, mainnet.id);
   * const userAddress = zeroAddress;
   * const positionData = new AccrualPosition(
   *   { user: userAddress, supplyShares: 0n, borrowShares: 1n, collateral: 10n ** 18n },
   *   await market.getMarketData(),
   * );
   * const action = market.repay({
   *   userAddress,
   *   positionData,
   *   repayShares: maxUint256,
   *   deadline: 1_900_000_000n,
   * });
   * const requirements = await action.getRequirements();
   * const tx = action.buildTx();
   * ```
   */
  repay: (
    params: {
      readonly userAddress: Address;
      readonly positionData: AccrualPosition;
      readonly nativeAmount?: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & (
      | { readonly repayAssets: bigint; readonly repayShares?: never }
      | { readonly repayShares: bigint; readonly repayAssets?: never }
    ),
  ) => ActionOutput<
    BlueRepayAction,
    readonly RequirementSignature[],
    BlueTokenRequirementsParams
  >;

  /**
   * Prepares a direct BlueBundlesV1 collateral withdrawal.
   *
   * This is the single-operation form of {@link BlueActions.repayWithdrawCollateral}; it withdraws
   * `collateralAssets` and fixes both inactive repayment fields to zero. The pre-fetched position
   * is forward-accrued before applying the buffered LLTV health check.
   *
   * @param params.userAddress - User whose collateral position changes.
   * @param params.positionData - Pre-fetched position used for balance and health validation.
   * @param params.collateralAssets - Collateral assets withdrawn.
   * @param params.deadline - Final call deadline in Unix seconds.
   * @param params.referralFeePct - Optional WAD-scaled referral fee below 100%.
   * @param params.referralFeeRecipient - Recipient required for a positive fee.
   * @returns Lazy Blue authorization resolution and a synchronous deep-frozen transaction.
   * @throws {ChainIdMismatchError} when the client targets another chain.
   * @throws {ExpiredDeadlineError} when the deadline is stale.
   * @throws {MissingAccrualPositionError} when no position snapshot is provided.
   * @throws {MarketIdMismatchError} when `positionData` belongs to another market.
   * @throws {AccrualPositionUserMismatchError} when `positionData` belongs to another user.
   * @throws {WithdrawExceedsCollateralError} when the withdrawal exceeds the position collateral.
   * @throws {MissingMarketPriceError} when the health check has no oracle price.
   * @throws {WithdrawMakesPositionUnhealthyError} when the result exceeds buffered LLTV.
   * @throws {NonPositiveInputError} when `collateralAssets` is not positive.
   * @throws {NegativeInputError} when collateral or the referral fee is negative.
   * @throws {InputExceedsMaxError} when the referral fee is at least WAD.
   * @throws {MissingReferralFeeRecipientError} when a positive fee has no recipient.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple authorization signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a token signature is supplied.
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
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const market = client.morpho.blue(markets[mainnet.id].usdc_wbtc, mainnet.id);
   * const userAddress = zeroAddress;
   * const positionData = new AccrualPosition(
   *   { user: userAddress, supplyShares: 0n, borrowShares: 0n, collateral: 10n ** 18n },
   *   await market.getMarketData(),
   * );
   * const action = market.withdrawCollateral({
   *   userAddress,
   *   positionData,
   *   collateralAssets: 10n ** 17n,
   *   deadline: 1_900_000_000n,
   * });
   * const requirements = await action.getRequirements();
   * const tx = action.buildTx();
   * ```
   */
  withdrawCollateral: (params: {
    readonly userAddress: Address;
    readonly positionData: AccrualPosition;
    readonly collateralAssets: bigint;
    readonly deadline: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
  }) => ActionOutput<
    BlueWithdrawCollateralAction,
    readonly RequirementSignature[],
    undefined
  >;

  /**
   * Prepares a direct BlueBundlesV1 repay, collateral withdrawal, or atomic combination.
   *
   * Repayment accepts exact assets or shares. `repayShares = maxUint256` requests the contract's
   * saturated full close; the entity derives `maxRepayAssets` from debt projected through the
   * requested deadline plus the referral fee, and the contract refunds unused funding. A
   * previously signed share-mode cap remains valid when it still covers the fresh derived minimum.
   * Saturated full-repay requirements use the token's reusable maximum allowance when signatures
   * are disabled, while the transaction itself remains bounded by the derived cap.
   * Share-mode deadlines cannot exceed the two-hour quote horizon. Blue authorization is required
   * only for collateral withdrawal. Pure repay uses `maxLtv = maxUint256`; withdrawals use buffered
   * LLTV. No Bundler3 share-price or `slippageTolerance` input exists.
   *
   * @param params.userAddress - User whose debt and collateral position changes.
   * @param params.positionData - Pre-fetched position used for repayment and health validation.
   * @param params.repayAssets - Exact assets repaid, exclusive with `repayShares`.
   * @param params.repayShares - Exact shares, or `maxUint256` for full repay.
   * @param params.collateralAssets - Collateral withdrawn, or zero for pure repay.
   * @param params.nativeAmount - Optional full native funding; must equal derived `maxRepayAssets`.
   * @param params.deadline - Final call deadline in Unix seconds; share mode is limited to the two-hour funding quote horizon.
   * @param params.referralFeePct - Optional WAD-scaled referral fee below 100%.
   * @param params.referralFeeRecipient - Recipient required for a positive fee.
   * @returns Lazy funding/authorization resolution and a synchronous deep-frozen transaction builder.
   * @throws {ChainIdMismatchError} when the client targets another chain.
   * @throws {MissingAccrualPositionError} when no position snapshot is provided at runtime.
   * @throws {MarketIdMismatchError} when `positionData` belongs to another market.
   * @throws {AccrualPositionUserMismatchError} when `positionData` belongs to another user.
   * @throws {NegativeInputError} when an amount, native funding, or referral fee is negative.
   * @throws {NonPositiveInputError} when no operation leg is provided.
   * @throws {MutuallyExclusiveRepayAmountsError} when assets and shares are both nonzero.
   * @throws {RepayExceedsDebtError} when an exact asset repay exceeds current debt.
   * @throws {RepaySharesExceedDebtError} when non-saturated shares exceed current debt shares.
   * @throws {WithdrawExceedsCollateralError} when collateral withdrawal exceeds the position.
   * @throws {MissingMarketPriceError} when withdrawal health cannot be validated without an oracle price.
   * @throws {WithdrawMakesPositionUnhealthyError} when the post-repay withdrawal exceeds buffered LLTV.
   * @throws {ExpiredDeadlineError} when the deadline is stale.
   * @throws {InputExceedsMaxError} when the referral fee is at least WAD or a share-mode deadline exceeds the funding quote horizon.
   * @throws {MaxRepayAssetsBelowRepayAssetsError} from `buildTx()` when a previously signed share-mode cap no longer covers the fresh derived minimum.
   * @throws {MissingReferralFeeRecipientError} when a positive fee has no recipient.
   * @throws {NativeFundingAmountMismatchError} when native funding is partial or mixed.
   * @throws {ChainWNativeMissingError} when native funding is requested on a chain without wNative.
   * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets another token.
   * @throws {MissingPermit2TransferFromNonceError} from `getRequirements()` when Permit2 is selected without an explicit nonce.
   * @throws {Permit2TransferFromNonceAlreadyUsedError} from `getRequirements()` when the explicit Permit2 nonce is consumed.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple signatures of one kind are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when an inactive leg cannot consume a supplied signature.
   * @throws {DepositOwnerMismatchError} from `buildTx()` when a signed owner differs from `userAddress`.
   * @throws {DepositAssetMismatchError} from `buildTx()` when the signed asset differs from the loan token.
   * @throws {DepositAmountMismatchError} from `buildTx()` when the signed amount differs from the derived funding cap.
   * @throws {DepositSpenderMismatchError} from `buildTx()` when the signed spender is not BlueBundlesV1.
   * @throws {BlueBundlesV1RequirementSignatureMismatchError} from `buildTx()` when a signature cannot be encoded safely.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
   * @throws {viem.BaseError} from `getRequirements()` when a required allowance, nonce, token metadata, or authorization read fails.
   * @example
   * ```ts
   * import { AccrualPosition } from "@morpho-org/blue-sdk";
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http, maxUint256, zeroAddress } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   *
   * const userAddress = zeroAddress;
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const market = client.morpho.blue(markets[mainnet.id].usdc_wbtc, mainnet.id);
   * const positionData = new AccrualPosition(
   *   { user: userAddress, supplyShares: 0n, borrowShares: 1n, collateral: 100_000_000n },
   *   await market.getMarketData(),
   * );
   * const action = market.repayWithdrawCollateral({
   *   userAddress,
   *   positionData,
   *   repayShares: maxUint256,
   *   collateralAssets: 1n,
   *   deadline: BigInt(Math.floor(Date.now() / 1_000) + 3_600),
   * });
   * const requirements = await action.getRequirements(); // Satisfy these first.
   * const tx = action.buildTx(); // For a client configured with supportSignature: false.
   * // tx satisfies Readonly<Transaction<BlueRepayWithdrawCollateralAction>>
   * ```
   */
  repayWithdrawCollateral: (
    params: {
      readonly userAddress: Address;
      readonly positionData: AccrualPosition;
      readonly collateralAssets: bigint;
      readonly nativeAmount?: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & (
      | { readonly repayAssets: bigint; readonly repayShares?: never }
      | { readonly repayShares: bigint; readonly repayAssets?: never }
      | { readonly repayAssets?: undefined; readonly repayShares?: undefined }
    ),
  ) => ActionOutput<
    BlueRepayWithdrawCollateralAction,
    readonly RequirementSignature[],
    BlueTokenRequirementsParams
  >;

  /**
   * Prepares a direct BlueBundlesV1 collateral supply, borrow, or atomic combination.
   *
   * At least one leg must be positive. A borrow requires `positionData` and Blue authorization;
   * collateral funding requires token approval/signature unless it is exclusively native. Vault V2
   * reallocations are accepted only with a borrow. Penalties and referral fees reduce borrow
   * proceeds. The entity uses `maxUint256` for a pure collateral supply and buffered LLTV otherwise.
   * No Bundler3 share-price or `slippageTolerance` input exists.
   *
   * @param params.userAddress - User whose collateral and debt position changes.
   * @param params.collateralAssets - Gross collateral supplied, or zero for pure borrow.
   * @param params.borrowAssets - Loan assets borrowed, or zero for pure collateral supply.
   * @param params.positionData - Pre-fetched position; required when `borrowAssets` is positive.
   * @param params.nativeAmount - Optional full native collateral funding; must equal `collateralAssets`.
   * @param params.reallocations - Optional Vault V2 reallocations; valid only for a borrow.
   * @param params.deadline - Final call deadline in Unix seconds.
   * @param params.referralFeePct - Optional WAD-scaled referral fee below 100%.
   * @param params.referralFeeRecipient - Recipient required for a positive fee.
   * @returns Lazy funding/authorization resolution and a synchronous deep-frozen transaction builder.
   * @throws {ChainIdMismatchError} when the client targets another chain.
   * @throws {MissingAccrualPositionError} when a borrow has no position snapshot.
   * @throws {MarketIdMismatchError} when `positionData` belongs to another market.
   * @throws {AccrualPositionUserMismatchError} when `positionData` belongs to another user.
   * @throws {MissingMarketPriceError} when a borrow cannot be validated without an oracle price.
   * @throws {BorrowExceedsSafeLtvError} when the resulting debt exceeds buffered LLTV.
   * @throws {ReallocationsRequireBorrowError} when reallocations accompany no borrow.
   * @throws {ExpiredDeadlineError} when the deadline is stale.
   * @throws {NegativeInputError} when an amount, native funding, referral fee, or reallocation penalty is negative.
   * @throws {NonPositiveInputError} when both legs or a reallocation amount is not positive.
   * @throws {NativeFundingAmountMismatchError} when native funding is partial or mixed.
   * @throws {ChainWNativeMissingError} when native funding is requested on a chain without wNative.
   * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets another token.
   * @throws {InputExceedsMaxError} when a fee or reallocation exceeds its ABI bound.
   * @throws {MissingReferralFeeRecipientError} when a positive fee has no recipient.
   * @throws {InvalidReallocationAddressError} when a vault or adapter address is malformed.
   * @throws {InvalidReallocationShapeError} when a reallocation entry is not a valid Vault V2 reallocation.
   * @throws {InvalidReallocationSourceTypeError} when a reallocation source is malformed.
   * @throws {InconsistentReallocationPenaltyError} when one vault uses different penalties.
   * @throws {ReallocationWithdrawalOnTargetMarketError} when a source is the target market.
   * @throws {ReallocationLoanTokenMismatchError} when a source uses another loan token.
   * @throws {MissingPermit2TransferFromNonceError} from `getRequirements()` when Permit2 is selected without an explicit nonce.
   * @throws {Permit2TransferFromNonceAlreadyUsedError} from `getRequirements()` when the explicit Permit2 nonce is consumed.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple signatures of one kind are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when an inactive leg cannot consume a supplied signature.
   * @throws {DepositOwnerMismatchError} from `buildTx()` when a signed owner differs from `userAddress`.
   * @throws {DepositAssetMismatchError} from `buildTx()` when the signed asset differs from the collateral token.
   * @throws {DepositAmountMismatchError} from `buildTx()` when the signed amount differs from `collateralAssets`.
   * @throws {DepositSpenderMismatchError} from `buildTx()` when the signed spender is not BlueBundlesV1.
   * @throws {BlueBundlesV1RequirementSignatureMismatchError} from `buildTx()` when a signature cannot be encoded safely.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
   * @throws {viem.BaseError} from `getRequirements()` when a required allowance, nonce, token metadata, or authorization read fails.
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
   * const positionData = await market.getPositionData(userAddress);
   * const action = market.supplyCollateralBorrow({
   *   userAddress,
   *   positionData,
   *   collateralAssets: 100_000_000n,
   *   borrowAssets: 1_000_000n,
   *   deadline: BigInt(Math.floor(Date.now() / 1_000) + 3_600),
   * });
   * const requirements = await action.getRequirements(); // Satisfy these first.
   * const tx = action.buildTx(); // For a client configured with supportSignature: false.
   * // tx satisfies Readonly<Transaction<BlueSupplyCollateralBorrowAction>>
   * ```
   */
  supplyCollateralBorrow: (params: {
    readonly userAddress: Address;
    readonly collateralAssets: bigint;
    readonly borrowAssets: bigint;
    readonly positionData?: AccrualPosition;
    readonly nativeAmount?: bigint;
    readonly reallocations?: Iterable<VaultV2BlueReallocation>;
    readonly deadline: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
  }) => ActionOutput<
    BlueSupplyCollateralBorrowAction,
    readonly RequirementSignature[],
    BlueTokenRequirementsParams
  >;

  /**
   * Prepares a direct BlueBundlesV1 full borrow-position migration.
   *
   * The scoped market is the source. BlueBundlesV1 reads the live source debt/collateral at
   * execution and extends the destination position; zero live debt reverts. The markets must share
   * both tokens. Referral fees and Vault V2 reallocation penalties increase destination debt, whose
   * complete position is checked against buffered LLTV. Partial and collateral-only migration are
   * unsupported.
   *
   * @param params.userAddress - Owner of both source and destination positions. It must also sign the
   *   Morpho authorization and send the transaction: BlueBundlesV1 migrates the signer's position
   *   (bound to `msg.sender`), so on-behalf refinance by a relayer is not supported and a mismatched
   *   sender reverts on-chain.
   * @param params.positionData - Pre-fetched source position with nonzero debt.
   * @param params.destination.marketParams - Distinct destination market with matching tokens.
   * @param params.destination.positionData - User's pre-fetched destination position.
   * @param params.reallocations - Optional Vault V2 reallocations into the destination.
   * @param params.deadline - Final call deadline in Unix seconds.
   * @param params.referralFeePct - Optional WAD-scaled referral fee below 100%.
   * @param params.referralFeeRecipient - Recipient required for a positive fee.
   * @returns Lazy Blue authorization resolution and a synchronous deep-frozen transaction builder.
   * @throws {ChainIdMismatchError} when the client targets another chain.
   * @throws {MissingAccrualPositionError} when either position snapshot is absent at runtime.
   * @throws {MarketIdMismatchError} when a position snapshot belongs to another market.
   * @throws {AccrualPositionUserMismatchError} when a position snapshot belongs to another user.
   * @throws {RefinanceSameMarketError} when source and destination IDs match.
   * @throws {RefinanceTokenMismatchError} when their loan or collateral tokens differ.
   * @throws {NegativeInputError} when a referral fee or reallocation penalty is negative.
   * @throws {NonPositiveInputError} when the source has no borrow shares or a reallocation amount is not positive.
   * @throws {MissingMarketPriceError} when destination health cannot be validated without an oracle price.
   * @throws {BorrowExceedsSafeLtvError} when the complete destination exceeds buffered LLTV.
   * @throws {ExpiredDeadlineError} when the deadline is stale.
   * @throws {InputExceedsMaxError} when a fee or reallocation exceeds its ABI bound, or the rounded
   *   aggregate reallocation penalty exceeds the migrated source debt.
   * @throws {MissingReferralFeeRecipientError} when a positive fee has no recipient.
   * @throws {InvalidReallocationAddressError} when a vault or adapter address is malformed.
   * @throws {InvalidReallocationShapeError} when a reallocation entry is not a valid Vault V2 reallocation.
   * @throws {InvalidReallocationSourceTypeError} when a reallocation source is malformed.
   * @throws {InconsistentReallocationPenaltyError} when one vault uses different penalties.
   * @throws {ReallocationWithdrawalOnTargetMarketError} when a source is the destination market.
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
   * const sourceParams = markets[mainnet.id].eth_wstEth_2;
   * const destinationParams = markets[mainnet.id].eth_wstEth;
   * const market = client.morpho.blue(sourceParams, mainnet.id);
   * const destinationMarket = client.morpho.blue(destinationParams, mainnet.id);
   * const source = new AccrualPosition(
   *   { user: userAddress, supplyShares: 0n, borrowShares: 1n, collateral: 10n ** 18n },
   *   await market.getMarketData(),
   * );
   * const destination = new AccrualPosition(
   *   { user: userAddress, supplyShares: 0n, borrowShares: 0n, collateral: 0n },
   *   await destinationMarket.getMarketData(),
   * );
   * const action = market.refinance({
   *   userAddress,
   *   positionData: source,
   *   destination: { marketParams: destinationParams, positionData: destination },
   *   deadline: BigInt(Math.floor(Date.now() / 1_000) + 3_600),
   * });
   * const requirements = await action.getRequirements(); // Satisfy these first.
   * const tx = action.buildTx(); // For a client configured with supportSignature: false.
   * // tx satisfies Readonly<Transaction<BlueRefinanceAction>>
   * ```
   */
  refinance: (params: {
    readonly userAddress: Address;
    readonly positionData: AccrualPosition;
    readonly destination: {
      readonly marketParams: MarketParams;
      readonly positionData: AccrualPosition;
    };
    readonly reallocations?: Iterable<VaultV2BlueReallocation>;
    readonly deadline: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
  }) => ActionOutput<
    BlueRefinanceAction,
    readonly RequirementSignature[],
    undefined
  >;

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
   * @deprecated Vault V1 shared-liquidity planning will be removed in the next major. Use
   * {@link getVaultV2BlueReallocationData}.
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
   * @deprecated Use {@link getVaultV1ReallocationData} for deprecated low-level Bundler3
   * planning. Vault V1 shared-liquidity planning will be removed in the next major; use
   * {@link getVaultV2BlueReallocationData} for high-level Blue writes.
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
   * @deprecated Vault V1 shared-liquidity planning will be removed in the next major. Use
   * {@link getVaultV2BlueReallocations}.
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
   * @deprecated Vault V1 shared-liquidity planning will be removed in the next major. Use
   * {@link getVaultV2BlueReallocations}.
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
  }): void {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    this.validateDeadline(params.deadline);
    // Resolve at handle creation so unsupported deployments fail before any RPC prerequisite work.
    getChainAddress(this.chainId, "bundles.blueBundlesV1");
    // Validate the referral inputs eagerly; the normalized result is intentionally discarded here
    // because the pure action re-normalizes it at encode time.
    normalizeBlueBundlesV1CommonParams({
      chainId: this.chainId,
      userAddress: params.userAddress,
      deadline: params.deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
    });
  }

  private getMaxLtv(marketParams: MarketParams = this.marketParams): bigint {
    return MathLib.zeroFloorSub(marketParams.lltv, DEFAULT_LLTV_BUFFER);
  }

  private getBlueBundlesV1QuoteTimestamp(lastUpdate: bigint): bigint {
    return MathLib.max(Time.timestamp(), lastUpdate) + Time.s.from.h(2n);
  }

  private async getTokenRequirements(params: {
    token: Address;
    amount: bigint;
    userAddress: Address;
    deadline: bigint;
    useSimplePermit?: boolean;
    permit2Nonce?: bigint;
    approvalAmount?: bigint;
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
      approvalAmount: params.approvalAmount,
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
    readonly userAddress: Address;
    readonly assets: bigint;
    readonly nativeAmount?: bigint;
    readonly deadline: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
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
          approvalAmount: requirementsParams?.approvalAmount,
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
      readonly userAddress: Address;
      readonly positionData: AccrualPosition;
      readonly reallocations?: Iterable<VaultV2BlueReallocation>;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
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

  /** {@inheritDoc BlueActions.supplyCollateral} */
  supplyCollateral(params: {
    readonly userAddress: Address;
    readonly collateralAssets: bigint;
    readonly nativeAmount?: bigint;
    readonly deadline: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
  }): ActionOutput<
    BlueSupplyCollateralAction,
    readonly RequirementSignature[],
    BlueTokenRequirementsParams
  > {
    const {
      userAddress,
      collateralAssets,
      nativeAmount,
      deadline,
      referralFeePct,
      referralFeeRecipient,
    } = params;
    const combinedAction = this.supplyCollateralBorrow({
      userAddress,
      collateralAssets,
      borrowAssets: 0n,
      nativeAmount,
      deadline,
      referralFeePct,
      referralFeeRecipient,
    });
    return {
      getRequirements: combinedAction.getRequirements,
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { token } = selectBlueBundlesV1RequirementSignatures(signatures, {
          token: (nativeAmount ?? 0n) === 0n,
        });
        return blueSupplyCollateral({
          market: { chainId: this.chainId, marketParams: this.marketParams },
          args: {
            userAddress,
            collateralAssets,
            nativeAmount,
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

  /** {@inheritDoc BlueActions.borrow} */
  borrow(params: {
    readonly userAddress: Address;
    readonly borrowAssets: bigint;
    readonly positionData: AccrualPosition;
    readonly reallocations?: Iterable<VaultV2BlueReallocation>;
    readonly deadline: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
  }): ActionOutput<
    BlueBorrowAction,
    readonly RequirementSignature[],
    undefined
  > {
    const {
      userAddress,
      borrowAssets,
      positionData,
      reallocations,
      deadline,
      referralFeePct,
      referralFeeRecipient,
    } = params;
    const normalizedReallocations = [...(reallocations ?? [])];
    const combinedAction = this.supplyCollateralBorrow({
      userAddress,
      collateralAssets: 0n,
      borrowAssets,
      positionData,
      reallocations: normalizedReallocations,
      deadline,
      referralFeePct,
      referralFeeRecipient,
    });
    return {
      getRequirements: () => combinedAction.getRequirements(),
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { authorization } = selectBlueBundlesV1RequirementSignatures(
          signatures,
          { authorization: true },
        );
        return blueBorrow({
          market: { chainId: this.chainId, marketParams: this.marketParams },
          args: {
            userAddress,
            borrowAssets,
            maxLtv: this.getMaxLtv(),
            reallocations: normalizedReallocations,
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

  /** {@inheritDoc BlueActions.repay} */
  repay(
    params: {
      readonly userAddress: Address;
      readonly positionData: AccrualPosition;
      readonly nativeAmount?: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & (
      | { readonly repayAssets: bigint; readonly repayShares?: never }
      | { readonly repayShares: bigint; readonly repayAssets?: never }
    ),
  ): ActionOutput<
    BlueRepayAction,
    readonly RequirementSignature[],
    BlueTokenRequirementsParams
  > {
    const combinedAction = this.repayWithdrawCollateral({
      ...params,
      collateralAssets: 0n,
    });
    return {
      getRequirements: combinedAction.getRequirements,
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const combinedTransaction = combinedAction.buildTx(signatures);
        const { token } = selectBlueBundlesV1RequirementSignatures(signatures, {
          token: combinedTransaction.value === 0n,
        });
        const {
          repayAssets,
          repayShares,
          maxRepayAssets,
          nativeAmount,
          referralFeePct,
          referralFeeRecipient,
          deadline,
        } = combinedTransaction.action.args;
        return blueRepay({
          market: { chainId: this.chainId, marketParams: this.marketParams },
          args: {
            userAddress: params.userAddress,
            repayAssets,
            repayShares,
            maxRepayAssets,
            nativeAmount,
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

  /** {@inheritDoc BlueActions.withdrawCollateral} */
  withdrawCollateral(params: {
    readonly userAddress: Address;
    readonly positionData: AccrualPosition;
    readonly collateralAssets: bigint;
    readonly deadline: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
  }): ActionOutput<
    BlueWithdrawCollateralAction,
    readonly RequirementSignature[],
    undefined
  > {
    const {
      userAddress,
      positionData,
      collateralAssets,
      deadline,
      referralFeePct,
      referralFeeRecipient,
    } = params;
    const combinedAction = this.repayWithdrawCollateral({
      userAddress,
      positionData,
      repayAssets: 0n,
      collateralAssets,
      deadline,
      referralFeePct,
      referralFeeRecipient,
    });
    return {
      getRequirements: () => combinedAction.getRequirements(),
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const combinedTransaction = combinedAction.buildTx(signatures);
        const { authorization } = selectBlueBundlesV1RequirementSignatures(
          signatures,
          { authorization: true },
        );
        const combinedArgs = combinedTransaction.action.args;
        return blueWithdrawCollateral({
          market: { chainId: this.chainId, marketParams: this.marketParams },
          args: {
            userAddress,
            collateralAssets: combinedArgs.collateralAssets,
            maxLtv: combinedArgs.maxLtv,
            deadline: combinedArgs.deadline,
            referralFeePct: combinedArgs.referralFeePct,
            referralFeeRecipient: combinedArgs.referralFeeRecipient,
            authorizationSignature: authorization,
          },
          metadata: this.client.options.metadata,
        });
      },
    };
  }

  /** {@inheritDoc BlueActions.repayWithdrawCollateral} */
  repayWithdrawCollateral(
    params: {
      readonly userAddress: Address;
      readonly positionData: AccrualPosition;
      readonly collateralAssets: bigint;
      readonly nativeAmount?: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & (
      | { readonly repayAssets: bigint; readonly repayShares?: never }
      | { readonly repayShares: bigint; readonly repayAssets?: never }
      | { readonly repayAssets?: undefined; readonly repayShares?: undefined }
    ),
  ) {
    const {
      userAddress,
      positionData,
      collateralAssets,
      nativeAmount,
      deadline,
      referralFeeRecipient,
    } = params;
    this.validateWriteCommon(params);
    // `validateWriteCommon` returns void, so default an omitted `referralFeePct` to `0n`
    // here, matching the pure action's normalization.
    const referralFeePct = params.referralFeePct ?? 0n;
    const repayAssets = params.repayAssets ?? 0n;
    const repayShares = params.repayShares ?? 0n;
    if (repayAssets < 0n) {
      throw new NegativeInputError("repayAssets", repayAssets);
    }
    if (repayShares < 0n) {
      throw new NegativeInputError("repayShares", repayShares);
    }
    if (collateralAssets < 0n) {
      throw new NegativeInputError("collateralAssets", collateralAssets);
    }
    if (repayAssets > 0n && repayShares > 0n) {
      throw new MutuallyExclusiveRepayAmountsError(this.marketParams.id);
    }
    const hasRepay = repayAssets > 0n || repayShares > 0n;
    if (!hasRepay && collateralAssets === 0n) {
      throw new NonPositiveInputError(
        "repayAssets, repayShares, or collateralAssets",
        0n,
      );
    }
    if (positionData == null) {
      throw new MissingAccrualPositionError(this.marketParams.id);
    }
    validateAccrualPosition({
      positionData,
      expectedMarketId: this.marketParams.id,
      expectedUser: userAddress,
    });

    const saturatedRepay = repayShares === maxUint256;
    const simulatedRepayShares = saturatedRepay
      ? positionData.borrowShares
      : repayShares;
    if (repayAssets > 0n) {
      validateRepayAmount({
        positionData,
        repayAssets,
        marketId: this.marketParams.id,
      });
    } else if (repayShares > 0n && !saturatedRepay) {
      validateRepayShares({
        positionData,
        repayShares,
        marketId: this.marketParams.id,
      });
    }

    const quoteHorizon = this.getBlueBundlesV1QuoteTimestamp(
      positionData.market.lastUpdate,
    );
    if (repayShares > 0n && deadline > quoteHorizon) {
      throw new InputExceedsMaxError({
        field: "deadline",
        value: deadline,
        max: quoteHorizon,
      });
    }
    const accrualTimestamp = repayShares > 0n ? deadline : quoteHorizon;
    const accruedPosition = positionData.accrueInterest(accrualTimestamp);
    const expectedRepayAssets =
      repayAssets > 0n
        ? repayAssets
        : hasRepay
          ? accruedPosition.market.toBorrowAssets(simulatedRepayShares, "Up")
          : 0n;
    const referralFeeAssets = getBlueBundlesV1ReferralFeeAssets(
      expectedRepayAssets,
      referralFeePct,
    );
    const maxRepayAssets = expectedRepayAssets + referralFeeAssets;
    const nativeValue = validateBlueBundlesV1NativeFunding({
      chainId: this.chainId,
      token: this.marketParams.loanToken,
      fundedAmount: maxRepayAssets,
      nativeAmount,
    });

    if (collateralAssets > 0n) {
      const postRepayPosition = hasRepay
        ? accruedPosition.repay(repayAssets, simulatedRepayShares).position
        : accruedPosition;
      validatePositionHealthAfterWithdraw({
        positionData: postRepayPosition,
        withdrawAmount: collateralAssets,
        lltv: this.marketParams.lltv,
        marketId: this.marketParams.id,
      });
    }

    return {
      getRequirements: async (
        requirementsParams?: BlueTokenRequirementsParams,
      ): Promise<readonly ActionRequirement[]> => {
        this.validateDeadline(deadline);
        const [tokenRequirements, authorizationRequirements] =
          await Promise.all([
            hasRepay && nativeValue === 0n
              ? this.getTokenRequirements({
                  token: this.marketParams.loanToken,
                  amount: maxRepayAssets,
                  // A caller-requested reusable approval wins; a full repay otherwise defaults to
                  // the token's reusable cap. Checksum the key so a differently-cased loan token
                  // (common from subgraphs/APIs) resolves that cap instead of falling back to
                  // maxUint256, which UNI/ONDO/COMP/FLUID reject.
                  approvalAmount:
                    requirementsParams?.approvalAmount ??
                    (saturatedRepay
                      ? (MAX_TOKEN_APPROVALS[this.chainId]?.[
                          getAddress(this.marketParams.loanToken)
                        ] ?? maxUint256)
                      : undefined),
                  userAddress,
                  deadline,
                  useSimplePermit: requirementsParams?.useSimplePermit,
                  permit2Nonce: requirementsParams?.permit2Nonce,
                })
              : Promise.resolve([]),
            collateralAssets > 0n
              ? this.getAuthorizationRequirements({ userAddress, deadline })
              : Promise.resolve([]),
          ]);
        return [...tokenRequirements, ...authorizationRequirements];
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { token, authorization } =
          selectBlueBundlesV1RequirementSignatures(signatures, {
            token: hasRepay && nativeValue === 0n,
            authorization: collateralAssets > 0n,
          });
        const selectedMaxRepayAssets =
          repayShares > 0n && token != null
            ? token.args.amount
            : maxRepayAssets;
        if (selectedMaxRepayAssets < maxRepayAssets) {
          throw new MaxRepayAssetsBelowRepayAssetsError(
            selectedMaxRepayAssets,
            maxRepayAssets,
          );
        }
        return blueRepayWithdrawCollateral({
          market: { chainId: this.chainId, marketParams: this.marketParams },
          args: {
            userAddress,
            repayAssets,
            repayShares,
            maxRepayAssets: selectedMaxRepayAssets,
            collateralAssets,
            maxLtv: collateralAssets > 0n ? this.getMaxLtv() : maxUint256,
            nativeAmount: nativeValue > 0n ? nativeValue : undefined,
            deadline,
            referralFeePct,
            referralFeeRecipient,
            requirementSignature: token,
            authorizationSignature: authorization,
          },
          metadata: this.client.options.metadata,
        });
      },
    };
  }

  /** {@inheritDoc BlueActions.supplyCollateralBorrow} */
  supplyCollateralBorrow(params: {
    readonly userAddress: Address;
    readonly collateralAssets: bigint;
    readonly borrowAssets: bigint;
    readonly positionData?: AccrualPosition;
    readonly nativeAmount?: bigint;
    readonly reallocations?: Iterable<VaultV2BlueReallocation>;
    readonly deadline: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
  }) {
    const {
      userAddress,
      collateralAssets,
      borrowAssets,
      positionData,
      nativeAmount,
      deadline,
      referralFeePct,
      referralFeeRecipient,
    } = params;
    this.validateWriteCommon(params);
    if (collateralAssets < 0n) {
      throw new NegativeInputError("collateralAssets", collateralAssets);
    }
    if (borrowAssets < 0n) {
      throw new NegativeInputError("borrowAssets", borrowAssets);
    }
    if (collateralAssets === 0n && borrowAssets === 0n) {
      throw new NonPositiveInputError("collateralAssets or borrowAssets", 0n);
    }
    const reallocations = [...(params.reallocations ?? [])];
    if (borrowAssets === 0n && reallocations.length > 0) {
      throw new ReallocationsRequireBorrowError();
    }
    // Validate the exact PublicAllocations mapping before requirement reads.
    const publicAllocations = getBlueBundlesV1PublicAllocations(
      reallocations,
      this.marketParams,
    );
    const reallocationPenaltyAssets =
      getBlueBundlesV1PenaltyAssets(publicAllocations);
    if (reallocationPenaltyAssets > borrowAssets) {
      throw new InputExceedsMaxError({
        field: "reallocationPenaltyAssets",
        value: reallocationPenaltyAssets,
        max: borrowAssets,
      });
    }
    if (borrowAssets > 0n) {
      if (positionData == null) {
        throw new MissingAccrualPositionError(this.marketParams.id);
      }
      validateAccrualPosition({
        positionData,
        expectedMarketId: this.marketParams.id,
        expectedUser: userAddress,
      });
      validatePositionHealth({
        positionData: positionData.accrueInterest(
          this.getBlueBundlesV1QuoteTimestamp(positionData.market.lastUpdate),
        ),
        additionalCollateral: collateralAssets,
        borrowAmount: borrowAssets,
        marketId: this.marketParams.id,
        lltv: this.marketParams.lltv,
      });
    }
    const nativeValue = validateBlueBundlesV1NativeFunding({
      chainId: this.chainId,
      token: this.marketParams.collateralToken,
      fundedAmount: collateralAssets,
      nativeAmount,
    });

    return {
      getRequirements: async (
        requirementsParams?: BlueTokenRequirementsParams,
      ): Promise<readonly ActionRequirement[]> => {
        this.validateDeadline(deadline);
        const [tokenRequirements, authorizationRequirements] =
          await Promise.all([
            collateralAssets > 0n && nativeValue === 0n
              ? this.getTokenRequirements({
                  token: this.marketParams.collateralToken,
                  amount: collateralAssets,
                  approvalAmount: requirementsParams?.approvalAmount,
                  userAddress,
                  deadline,
                  useSimplePermit: requirementsParams?.useSimplePermit,
                  permit2Nonce: requirementsParams?.permit2Nonce,
                })
              : Promise.resolve([]),
            borrowAssets > 0n
              ? this.getAuthorizationRequirements({ userAddress, deadline })
              : Promise.resolve([]),
          ]);
        return [...tokenRequirements, ...authorizationRequirements];
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { token, authorization } =
          selectBlueBundlesV1RequirementSignatures(signatures, {
            token: collateralAssets > 0n && nativeValue === 0n,
            authorization: borrowAssets > 0n,
          });
        return blueSupplyCollateralBorrow({
          market: { chainId: this.chainId, marketParams: this.marketParams },
          args: {
            userAddress,
            collateralAssets,
            borrowAssets,
            maxLtv: borrowAssets > 0n ? this.getMaxLtv() : maxUint256,
            nativeAmount: nativeValue > 0n ? nativeValue : undefined,
            reallocations,
            deadline,
            referralFeePct,
            referralFeeRecipient,
            requirementSignature: token,
            authorizationSignature: authorization,
          },
          metadata: this.client.options.metadata,
        });
      },
    };
  }

  /** {@inheritDoc BlueActions.refinance} */
  refinance(params: {
    readonly userAddress: Address;
    readonly positionData: AccrualPosition;
    readonly destination: {
      readonly marketParams: MarketParams;
      readonly positionData: AccrualPosition;
    };
    readonly reallocations?: Iterable<VaultV2BlueReallocation>;
    readonly deadline: bigint;
    readonly referralFeePct?: bigint;
    readonly referralFeeRecipient?: Address;
  }) {
    const {
      userAddress,
      positionData,
      destination,
      deadline,
      referralFeeRecipient,
    } = params;
    this.validateWriteCommon(params);
    // `validateWriteCommon` returns void, so default an omitted `referralFeePct` to `0n`
    // here, matching the pure action's normalization.
    const referralFeePct = params.referralFeePct ?? 0n;
    if (positionData == null) {
      throw new MissingAccrualPositionError(this.marketParams.id);
    }
    validateAccrualPosition({
      positionData,
      expectedMarketId: this.marketParams.id,
      expectedUser: userAddress,
    });
    if (positionData.borrowShares === 0n) {
      throw new NonPositiveInputError(
        "positionData.borrowShares",
        positionData.borrowShares,
      );
    }
    if (this.marketParams.id === destination.marketParams.id) {
      throw new RefinanceSameMarketError(this.marketParams.id);
    }
    if (
      !isAddressEqual(
        this.marketParams.loanToken,
        destination.marketParams.loanToken,
      ) ||
      !isAddressEqual(
        this.marketParams.collateralToken,
        destination.marketParams.collateralToken,
      )
    ) {
      throw new RefinanceTokenMismatchError(
        this.marketParams.id,
        destination.marketParams.id,
      );
    }
    if (destination.positionData == null) {
      throw new MissingAccrualPositionError(destination.marketParams.id);
    }
    validateAccrualPosition({
      positionData: destination.positionData,
      expectedMarketId: destination.marketParams.id,
      expectedUser: userAddress,
    });

    const reallocations = [...(params.reallocations ?? [])];
    const publicAllocations = getBlueBundlesV1PublicAllocations(
      reallocations,
      destination.marketParams,
    );
    const penaltyAssets = getBlueBundlesV1PenaltyAssets(publicAllocations);
    // Reject a reallocation plan whose rounded aggregate penalty exceeds the current source debt,
    // matching the `blueBorrow`/`blueWithdraw` BlueBundlesV1 caps. Bound against the current quoted
    // debt, not the conservative `now + 2h` health projection below: the on-chain call migrates the
    // debt live at execution (>= the current quote), so the current quote is the safe floor. Using
    // the forward projection would let a penalty between the current and forecast debt pass while
    // still exceeding the debt actually moved, and the health check only adds the penalty to
    // destination debt, so a collateralized position would silently accept it or encode a reverting
    // call.
    if (penaltyAssets > positionData.borrowAssets) {
      throw new InputExceedsMaxError({
        field: "reallocationPenaltyAssets",
        value: penaltyAssets,
        max: positionData.borrowAssets,
      });
    }
    const accrualTimestamp = this.getBlueBundlesV1QuoteTimestamp(
      MathLib.max(
        positionData.market.lastUpdate,
        destination.positionData.market.lastUpdate,
      ),
    );
    const accruedSourcePosition = positionData.accrueInterest(accrualTimestamp);
    const accruedDestinationPosition =
      destination.positionData.accrueInterest(accrualTimestamp);
    const referralFeeAssets = getBlueBundlesV1ReferralFeeAssets(
      accruedSourcePosition.borrowAssets,
      referralFeePct,
    );
    validatePositionHealth({
      positionData: accruedDestinationPosition,
      additionalCollateral: accruedSourcePosition.collateral,
      borrowAmount:
        accruedSourcePosition.borrowAssets + penaltyAssets + referralFeeAssets,
      marketId: destination.marketParams.id,
      lltv: destination.marketParams.lltv,
    });

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
        return blueRefinance({
          market: {
            chainId: this.chainId,
            sourceMarketParams: this.marketParams,
            destinationMarketParams: destination.marketParams,
          },
          args: {
            userAddress,
            maxLtv: this.getMaxLtv(destination.marketParams),
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

  /**
   * Fetches all on-chain inputs needed to compute public allocator reallocations.
   *
   * @param params.vaultAddresses - Vaults to inspect for source-market liquidity.
   * @param params.block.number - Block number used for every RPC read.
   * @param params.block.timestamp - Timestamp corresponding to the fetched block.
   * @returns Reallocation data ready for {@link getVaultV1Reallocations}.
   * @throws {ChainIdMismatchError} when the client chain does not match this market.
   * @deprecated Vault V1 shared-liquidity planning will be removed in the next major. Use
   * {@link getVaultV2BlueReallocationData}.
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
   * @deprecated Vault V1 shared-liquidity planning will be removed in the next major. Use
   * {@link getVaultV2BlueReallocationData}.
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
   * @deprecated Vault V1 shared-liquidity planning will be removed in the next major. Use
   * {@link getVaultV2BlueReallocations}.
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
   * @deprecated Vault V1 shared-liquidity planning will be removed in the next major. Use
   * {@link getVaultV2BlueReallocations}.
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
