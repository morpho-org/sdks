import {
  type AccrualPosition,
  type Market,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import {
  fetchAccrualPosition,
  fetchAccrualVaultV2,
  fetchMarket,
  fetchVaultV2BluePublicAllocatorData,
} from "@morpho-org/blue-sdk-viem";
import {
  type AddressLabel,
  deepFreeze,
  getChainAddress,
  getChainAddresses,
  Time,
} from "@morpho-org/morpho-ts";
import { type Address, erc20Abi, isAddressEqual, maxUint256 } from "viem";
import { readContract } from "viem/actions";
import {
  blueAbi,
  midnightBlueBuyCallbackAbi,
  midnightBlueBuyCallbackFactoryAbi,
} from "../../abis.js";
import type { BlueBorrowInput } from "../../actions/blue/borrow.internal.js";
import {
  getBlueBundlesV1ReferralFeeAssets,
  parseBlueAllocations,
  parseBlueBundlesV1Common,
  selectBlueBundlesV1RequirementSignatures,
} from "../../actions/blue/common.js";

import {
  type BlueRefinanceInput,
  buildBlueRefinance,
  parseBlueRefinanceMarkets,
} from "../../actions/blue/refinance.internal.js";
import { validateBlueRefinanceQuote } from "../../actions/blue/refinanceValidation.js";
import type { BlueRepayOnlyInput } from "../../actions/blue/repay.internal.js";
import {
  type BlueRepayInput,
  buildBlueRepayWithdrawCollateral,
  parseBlueRepayCap,
  parseBlueRepayCoverage,
  parseBlueRepayMode,
} from "../../actions/blue/repayWithdrawCollateral.internal.js";
import {
  type BlueSupplyInput,
  buildBlueSupply,
} from "../../actions/blue/supply.internal.js";
import type { BlueSupplyCollateralInput } from "../../actions/blue/supplyCollateral.internal.js";
import {
  type BlueSupplyCollateralBorrowInput,
  buildBlueSupplyCollateralBorrow,
  parseBlueSupplyCollateralBorrowAllocations,
  parseBlueSupplyCollateralBorrowMode,
} from "../../actions/blue/supplyCollateralBorrow.internal.js";
import {
  type BlueWithdrawInput,
  buildBlueWithdraw,
  parseBlueWithdrawMode,
  parseBlueWithdrawPenalty,
} from "../../actions/blue/withdraw.internal.js";
import {
  type BlueWithdrawBuyCallbackInput,
  buildBlueWithdrawBuyCallback,
} from "../../actions/blue/withdrawBuyCallback.internal.js";
import type { BlueWithdrawCollateralInput } from "../../actions/blue/withdrawCollateral.internal.js";
import {
  getParsedBlueAuthorizationRequirement,
  parseBlueAuthorizationRequirement,
} from "../../actions/requirements/blue/getBlueAuthorizationRequirement.js";
import {
  type ChainCheck,
  createChainCheck,
} from "../../actions/requirements/chainCheck.js";
import { getBlueBundlesV1QuoteTimestamp } from "../../helpers/getBlueBundlesV1QuoteTimestamp.js";
import {
  DEFAULT_LLTV_BUFFER,
  validateAccrualPosition,
  validateChainId,
  validatePositionHealth,
  validatePositionHealthAfterWithdraw,
  validateWithdrawAmount,
  validateWithdrawShares,
} from "../../helpers/index.js";
import { resolveTransactionMetadata } from "../../helpers/metadata.js";
import {
  parseBlueMarket,
  parseNativeFunding,
  parseNonnegative,
  parseUint256,
  parseUint256Max,
} from "../../helpers/parse.js";
import { quoteBlueRepay } from "../../helpers/quoteBlueRepay.js";
import type { FetchParameters } from "../../types/data.js";
import {
  type ActionOutput,
  type ActionRequirement,
  type AssetsOrSharesArgs,
  type BlueBorrowAction,
  BlueBuyCallbackOwnerMismatchError,
  BlueBuyCallbackUnauthorizedError,
  type BlueRefinanceAction,
  type BlueRepayAction,
  type BlueRepayWithdrawCollateralAction,
  type BlueSupplyAction,
  type BlueSupplyCollateralAction,
  type BlueSupplyCollateralBorrowAction,
  type BlueWithdrawAction,
  type BlueWithdrawBuyCallbackAction,
  type BlueWithdrawCollateralAction,
  EmptyBlueSupplyPositionError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  InsufficientBlueLiquidityError,
  MarketIdMismatchError,
  MissingAccrualPositionError,
  type MorphoClientType,
  NonPositiveInputError,
  NotBlueBuyCallbackError,
  type ReferenceTimestampParams,
  type RequirementSignature,
  type VaultV2BluePublicAllocatorOptions,
  type VaultV2BlueReallocation,
} from "../../types/index.js";
import { assertRegistryTargetsHaveCode } from "../requirements/assertContractCode.js";
import {
  getParsedBundlesTokenRequirements,
  parseGetBundlesTokenRequirements,
} from "../requirements/getBundlesTokenRequirements.js";
import { validateNativeRequirements } from "../requirements/validateNativeRequirements.js";
import { VaultV2BlueReallocationData } from "../vaultV2BlueReallocationData.js";

type VaultV2BlueReallocationsParams = {
  readonly reallocationData: VaultV2BlueReallocationData;
  readonly options?: VaultV2BluePublicAllocatorOptions & {
    readonly operation?:
      | {
          readonly type: "borrow" | "withdraw";
          readonly amount: bigint;
        }
      | {
          readonly type: "refinance";
          readonly amount: bigint;
          readonly referralFeePct?: bigint;
        };
  };
};

/** Options for resolving token-backed BlueBundlesV1 approval or signature prerequisites. */
export interface BlueTokenRequirementsParams {
  /** Prefer ERC-2612 when the funded token exposes a compatible nonce; defaults to true when signatures are supported. */
  readonly useSimplePermit?: boolean;
  /** @deprecated Ignored. The SDK no longer requests Permit2 funding; use ERC-2612 permits or ERC-20 approvals. */
  readonly permit2Nonce?: bigint;
}

/**
 * Action surface for Morpho Blue reads and writes; writes route through BlueBundlesV1, except
 * `withdrawBuyCallback`, which calls Morpho Blue directly.
 */
export interface BlueActions {
  /**
   * Fetches the latest market data with accrued interest.
   *
   * @param parameters - Optional fetch parameters (block number, state overrides).
   * @returns Market state including total supply/borrow assets and shares.
   * @throws {ChainIdMismatchError} when the connected client declares another chain or none, or its RPC reports another chain via `eth_chainId`.
   * @throws {viem.BaseError} when the `eth_chainId` request or a state read fails.
   * @example
   * ```ts
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   *
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const market = client.morpho.blue(markets[mainnet.id].usdc_wbtc, mainnet.id);
   * const marketData = await market.getMarketData();
   * ```
   */
  getMarketData: (parameters?: FetchParameters) => Promise<Market>;

  /**
   * Fetches the user's position in this market with accrued interest.
   *
   * @param userAddress - The user whose position to fetch.
   * @param parameters - Optional fetch parameters (block number, state overrides).
   * @returns Accrual position with health metrics (maxBorrowAssets, ltv, isHealthy).
   * @throws {ChainIdMismatchError} when the connected client declares another chain or none, or its RPC reports another chain via `eth_chainId`.
   * @throws {viem.BaseError} when the `eth_chainId` request or a state read fails.
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
   * const position = await market.getPositionData(zeroAddress);
   * ```
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
   * @param params.referralFeePct - Optional WAD-scaled referral fee at most 10%.
   * @param params.referralFeeRecipient - Recipient required for a positive fee.
   * @returns Lazy token prerequisite resolution and a synchronous deep-frozen transaction.
   * @throws {ChainIdMismatchError} when the client targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {ExpiredDeadlineError} when the deadline is stale.
   * @throws {NonPositiveInputError} when `collateralAssets` is not positive.
   * @throws {NegativeInputError} when collateral, native funding, or the referral fee is negative.
   * @throws {NativeFundingAmountMismatchError} when native funding is partial or mixed.
   * @throws {ChainWNativeMissingError} when native funding is requested without registered wNative.
   * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets another token.
   * @throws {ReferralFeeRecipientMissingError} when a positive fee has no recipient.
   * @throws {ReferralFeePctExceededError} when the referral fee is at least WAD.
   * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple token signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when an unsupported signature is supplied.
   * @throws {DepositOwnerMismatchError} from `buildTx()` when the signed owner differs from `userAddress`.
   * @throws {DepositAssetMismatchError} from `buildTx()` when the signed asset differs from the collateral token.
   * @throws {DepositAmountMismatchError} from `buildTx()` when the signed amount differs from `collateralAssets`.
   * @throws {DepositSpenderMismatchError} from `buildTx()` when the signed spender is not BlueBundlesV1.
   * @throws {BundlesRequirementSignatureMismatchError} from `buildTx()` when a signature cannot be encoded safely.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
   * @throws {UnknownTokenError} from `getRequirements()` when the funded token's `decimals()` is unusable.
   * @throws {MalformedTokenMetadataError} when the token's `eip712Domain()` or
   *   `bytes32` `name`/`symbol` retry returns non-empty data that does not decode, or when the
   *   deployless query reports malformed `name()`/`symbol()`/`eip712Domain()` returndata (no fallback).
   * @throws {MissingContractCodeError} from `getRequirements()` when a fixed bundles or protocol
   *   contract has no code at its registered address.
   * @throws {viem.BaseError} from `getRequirements()` when an allowance, nonce, or token metadata
   *   read or `eth_chainId` request fails.
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
  supplyCollateral: (
    params: {
      readonly userAddress: Address;
      readonly collateralAssets: bigint;
      readonly nativeAmount?: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & ReferenceTimestampParams,
  ) => ActionOutput<
    BlueSupplyCollateralAction,
    readonly RequirementSignature[],
    BlueTokenRequirementsParams
  >;

  /**
   * Prepares a direct BlueBundlesV1 loan-asset supply.
   *
   * `getRequirements()` first checks that BlueBundlesV1 and Blue hold code, then
   * reads the loan-token allowance and selected ERC-2612 nonce state. Direct approvals and
   * ERC-2612 name BlueBundlesV1 as spender. Native
   * funding is exclusive and skips token requirements (the code check still runs).
   * The referral fee is deducted from the gross `assets` supplied. This route exposes no
   * share-price bound or `slippageTolerance`.
   *
   * @param params.userAddress - User funding and receiving the supply position.
   * @param params.marketData - Snapshot of this market from `getMarketData()` (or `fetchMarket` in
   *   `@morpho-org/blue-sdk-viem`), checked only for `MarketIdMismatchError`. To check the dead-deposit
   *   rule, call `validateBlueMarketDeadShares` on the snapshot yourself before building.
   * @param params.assets - Gross loan-token assets funded before the referral fee.
   * @param params.nativeAmount - Optional full native funding; must equal `assets` and requires wNative.
   * @param params.deadline - Final call deadline in Unix seconds.
   * @param params.referralFeePct - Optional WAD-scaled referral fee at most 10%.
   * @param params.referralFeeRecipient - Recipient required for a positive fee.
   * @returns Lazy prerequisite resolution and a synchronous deep-frozen transaction builder.
   * @throws {ChainIdMismatchError} when the client targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {ExpiredDeadlineError} when the deadline is not in the future at creation or requirement resolution.
   * @throws {NonPositiveInputError} when `assets` is not positive.
   * @throws {NegativeInputError} when native funding or the referral fee is negative.
   * @throws {NativeFundingAmountMismatchError} when native funding is partial or mixed.
   * @throws {ChainWNativeMissingError} when native funding is requested on a chain without wNative.
   * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets another token.
   * @throws {InputExceedsMaxError} when `assets` or `deadline` exceeds `uint256`.
   * @throws {ReferralFeeRecipientMissingError} when a positive fee has no recipient.
   * @throws {ReferralFeePctExceededError} when the referral fee is at least WAD.
   * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple token signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when the route cannot consume a supplied signature.
   * @throws {DepositOwnerMismatchError} from `buildTx()` when the signed owner differs from `userAddress`.
   * @throws {DepositAssetMismatchError} from `buildTx()` when the signed asset differs from the loan token.
   * @throws {DepositAmountMismatchError} from `buildTx()` when the signed amount differs from `assets`.
   * @throws {DepositSpenderMismatchError} from `buildTx()` when the signed spender is not BlueBundlesV1.
   * @throws {BundlesRequirementSignatureMismatchError} from `buildTx()` when a signature cannot be encoded safely.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
   * @throws {MarketIdMismatchError} when `marketData` belongs to another market.
   * @throws {UnknownTokenError} from `getRequirements()` when the funded token's `decimals()` is unusable.
   * @throws {MalformedTokenMetadataError} when the token's `eip712Domain()` or
   *   `bytes32` `name`/`symbol` retry returns non-empty data that does not decode, or when the
   *   deployless query reports malformed `name()`/`symbol()`/`eip712Domain()` returndata (no fallback).
   * @throws {MissingContractCodeError} from `getRequirements()` when a fixed bundles or protocol
   *   contract has no code at its registered address.
   * @throws {viem.BaseError} from `getRequirements()` when a required allowance, nonce, or token
   *   metadata read or `eth_chainId` request fails.
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
   *   marketData: await market.getMarketData(),
   *   assets: 1_000_000n,
   *   now: (await client.getBlock()).timestamp,
   *   deadline: (await client.getBlock()).timestamp + 3_600n,
   * });
   * const requirements = await action.getRequirements();
   * const tx = action.buildTx();
   * // tx satisfies Readonly<Transaction<BlueSupplyAction>>
   * ```
   */
  supply: {
    (
      params: {
        readonly userAddress: Address;
        readonly marketData: Market;
        readonly assets: bigint;
        readonly nativeAmount?: bigint;
        readonly deadline: bigint;
        readonly referralFeePct?: bigint;
        readonly referralFeeRecipient?: Address;
      } & ReferenceTimestampParams,
    ): ActionOutput<
      BlueSupplyAction,
      readonly RequirementSignature[],
      BlueTokenRequirementsParams
    >;
    /**
     * @deprecated Pass `marketData` from `getMarketData()`; the snapshot-free overload is removed in the next major.
     */
    (
      params: {
        readonly userAddress: Address;
        readonly assets: bigint;
        readonly nativeAmount?: bigint;
        readonly deadline: bigint;
        readonly referralFeePct?: bigint;
        readonly referralFeeRecipient?: Address;
      } & ReferenceTimestampParams,
    ): ActionOutput<
      BlueSupplyAction,
      readonly RequirementSignature[],
      BlueTokenRequirementsParams
    >;
  };

  /**
   * Prepares a direct BlueBundlesV1 loan-asset withdrawal by assets or shares.
   *
   * `getRequirements()` reads Morpho authorization state for BlueBundlesV1. Optional reallocations
   * are Vault V2-only; their penalties and the referral fee reduce withdrawal proceeds. Shares
   * mode has neither a saturated full-close sentinel nor an onchain minimum-assets guarantee.
   * This route exposes no share-price bound or `slippageTolerance`.
   *
   * @param params.userAddress - User whose supply position is withdrawn.
   * @param params.positionData - Pre-fetched position used for ownership and balance validation.
   * @param params.assets - Exact assets withdrawn, exclusive with `shares`.
   * @param params.shares - Exact shares burned, exclusive with `assets`.
   * @param params.reallocations - Optional Vault V2 reallocations executed before withdrawal.
   * @param params.maxPenalty - Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound total proceeds lost.
   * @param params.deadline - Final call deadline in Unix seconds.
   * @param params.referralFeePct - Optional WAD-scaled referral fee at most 10%.
   * @param params.referralFeeRecipient - Recipient required for a positive fee.
   * @returns Lazy authorization resolution and a synchronous deep-frozen transaction builder.
   * @throws {InvalidBigIntInputError} when a supplied maxPenalty is not a bigint.
   * @throws {ChainIdMismatchError} when the client targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {ExpiredDeadlineError} when the deadline is stale.
   * @throws {MissingAccrualPositionError} when no position snapshot is provided at runtime.
   * @throws {MarketIdMismatchError} when `positionData` belongs to another market, or a
   *   reallocation source market's `id` does not hash from its tuple fields.
   * @throws {AccrualPositionUserMismatchError} when `positionData` belongs to another user.
   * @throws {NegativeInputError} when an amount, referral fee, or reallocation penalty is negative.
   *   Also thrown when maxPenalty is negative.
   * @throws {NonPositiveInputError} when no withdrawal mode or positive reallocation amount is provided.
   * @throws {MutuallyExclusiveWithdrawAmountsError} when assets and shares are both nonzero.
   * @throws {WithdrawExceedsSupplyError} when assets exceed the supplied balance.
   * @throws {WithdrawSharesExceedSupplyError} when shares exceed the owned balance.
   * @throws {InputExceedsMaxError} when a fee or reallocation exceeds its ABI bound.
   *   Also thrown when maxPenalty exceeds WAD or a reallocation penalty exceeds maxPenalty.
   * @throws {ReferralFeeRecipientMissingError} when a positive fee has no recipient.
   * @throws {ReferralFeePctExceededError} when the referral fee is at least WAD.
   * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
   * @throws {InvalidReallocationAddressError} when a vault or adapter address is malformed.
   * @throws {InvalidVaultV2BlueReallocationShapeError} when a reallocation entry is not a valid Vault V2 reallocation.
   * @throws {InvalidReallocationSourceTypeError} when a reallocation source is malformed.
   * @throws {InconsistentReallocationPenaltyError} when one vault uses different penalties.
   * @throws {ReallocationWithdrawalOnTargetMarketError} when a source is the target market.
   * @throws {ReallocationLoanTokenMismatchError} when a source uses another loan token.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple authorization signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a non-authorization signature is supplied.
   * @throws {DepositOwnerMismatchError} from `buildTx()` when the signed owner differs from `userAddress`.
   * @throws {BundlesRequirementSignatureMismatchError} from `buildTx()` when authorization cannot be encoded safely.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
   * @throws {MissingContractCodeError} from `getRequirements()` when a fixed bundles or protocol
   *   contract has no code at its registered address.
   * @throws {viem.BaseError} from `getRequirements()` when an authorization read or
   *   `eth_chainId` request fails.
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
   *   now: (await client.getBlock()).timestamp,
   *   deadline: (await client.getBlock()).timestamp + 3_600n,
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
      /** Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound total proceeds lost. */
      readonly maxPenalty?: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & ReferenceTimestampParams &
      AssetsOrSharesArgs,
  ) => ActionOutput<
    BlueWithdrawAction,
    readonly RequirementSignature[],
    undefined
  >;

  /**
   * Prepares a direct Morpho Blue withdrawal of a BlueBuyCallback's whole supply position to its
   * owner.
   *
   * A BlueBuyCallback parks a maker's Midnight buy-offer funds as Blue supply owned by the
   * callback. After the offer is cancelled or expires, its owner recovers them with
   * `withdraw(marketParams, 0, supplyShares, callbackAddress, userAddress)` sent straight to Morpho
   * Blue: BlueBundlesV1 cannot act for the callback. The callback's constructor authorizes its
   * owner on Blue, so no requirement is returned.
   *
   * The handle checks the snapshot synchronously: it must be the callback's position on this
   * market, hold supply shares, and the market's liquidity must cover their assets.
   * `getRequirements()` then reads the chain and throws unless the registered
   * `midnightBlueBuyCallbackFactory` created the callback, its `OWNER()` is `userAddress`, and Blue
   * still authorizes `userAddress` for the callback. Await it before submitting the transaction.
   *
   * @param params.userAddress - Callback owner, who sends the transaction and receives the assets.
   * @param params.callbackAddress - BlueBuyCallback whose supply position is withdrawn.
   * @param params.positionData - Fresh snapshot of the callback's position on this market, for
   *   example from `getPositionData(callbackAddress)`. Every supply share in it is withdrawn.
   * @returns Lazy owner and authorization checks with no requirements, and a synchronous
   *   deep-frozen transaction targeting Morpho Blue.
   * @throws {ChainIdMismatchError} when the client targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {viem.InvalidAddressError} when `callbackAddress` is malformed.
   * @throws {MissingAccrualPositionError} when no position snapshot is provided.
   * @throws {MarketIdMismatchError} when `positionData` belongs to another market.
   * @throws {AccrualPositionUserMismatchError} when `positionData` belongs to another account than
   *   `callbackAddress`.
   * @throws {EmptyBlueSupplyPositionError} when the callback holds no supply shares.
   * @throws {InsufficientBlueLiquidityError} when the position's assets exceed market liquidity.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when Morpho Blue or `midnightBlueBuyCallbackFactory` is not
   *   registered.
   * @throws {MissingContractCodeError} from `getRequirements()` when Morpho Blue or the factory has
   *   no code at its registered address.
   * @throws {NotBlueBuyCallbackError} from `getRequirements()` when the factory did not create
   *   `callbackAddress`.
   * @throws {BlueBuyCallbackOwnerMismatchError} from `getRequirements()` when the callback's
   *   `OWNER()` is not `userAddress`.
   * @throws {BlueBuyCallbackUnauthorizedError} from `getRequirements()` when Blue does not
   *   authorize `userAddress` for the callback.
   * @throws {viem.BaseError} from `getRequirements()` when a read fails.
   * @example
   * ```ts
   * import { markets } from "@morpho-org/morpho-test";
   * import { createPublicClient, http, zeroAddress } from "viem";
   * import { mainnet } from "viem/chains";
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   *
   * const userAddress = zeroAddress;
   * const callbackAddress = zeroAddress;
   * const client = createPublicClient({ chain: mainnet, transport: http() })
   *   .extend(morphoViemExtension());
   * const market = client.morpho.blue(markets[mainnet.id].usdc_wbtc, mainnet.id);
   * const action = market.withdrawBuyCallback({
   *   userAddress,
   *   callbackAddress,
   *   positionData: await market.getPositionData(callbackAddress),
   * });
   * await action.getRequirements(); // throws unless userAddress owns the callback
   * const tx = action.buildTx();
   * // tx satisfies Readonly<Transaction<BlueWithdrawBuyCallbackAction>>
   * ```
   */
  withdrawBuyCallback: (
    params: {
      readonly userAddress: Address;
      readonly callbackAddress: Address;
      readonly positionData: AccrualPosition;
    } & ReferenceTimestampParams,
  ) => ActionOutput<BlueWithdrawBuyCallbackAction, undefined, undefined>;

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
   * @param params.maxPenalty - Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound total proceeds lost.
   * @param params.deadline - Final call deadline in Unix seconds.
   * @param params.referralFeePct - Optional WAD-scaled referral fee at most 10%.
   * @param params.referralFeeRecipient - Recipient required for a positive fee.
   * @returns Lazy Blue authorization resolution and a synchronous deep-frozen transaction.
   * @throws {InvalidBigIntInputError} when a supplied maxPenalty is not a bigint.
   * @throws {ChainIdMismatchError} when the client targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {UnsupportedBlueMarketIrmError} when positive debt requires an unsupported IRM projection.
   * @throws {ExpiredDeadlineError} when the deadline is stale.
   * @throws {MissingAccrualPositionError} when no position snapshot is provided.
   * @throws {MarketIdMismatchError} when `positionData` belongs to another market, or a
   *   reallocation source market's `id` does not hash from its tuple fields.
   * @throws {AccrualPositionUserMismatchError} when `positionData` belongs to another user.
   * @throws {MissingMarketPriceError} when the health check has no oracle price.
   * @throws {BorrowExceedsSafeLtvError} when the resulting position exceeds buffered LLTV.
   * @throws {NonPositiveInputError} when `borrowAssets` is not positive.
   * @throws {NegativeInputError} when the borrow, fee, or a reallocation value is negative.
   *   Also thrown when maxPenalty is negative.
   * @throws {InputExceedsMaxError} when a fee, penalty, or reallocation exceeds its bound.
   *   Also thrown when maxPenalty exceeds WAD or a reallocation penalty exceeds maxPenalty.
   * @throws {ReferralFeeRecipientMissingError} when a positive fee has no recipient.
   * @throws {ReferralFeePctExceededError} when the referral fee is at least WAD.
   * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
   * @throws {InvalidReallocationAddressError} when a vault or adapter address is malformed.
   * @throws {InvalidVaultV2BlueReallocationShapeError} when a reallocation entry is not a valid Vault V2 reallocation.
   * @throws {InvalidReallocationSourceTypeError} when a reallocation source is malformed.
   * @throws {InconsistentReallocationPenaltyError} when one vault uses different penalties.
   * @throws {ReallocationWithdrawalOnTargetMarketError} when a source is the target market.
   * @throws {ReallocationLoanTokenMismatchError} when a source uses another loan token.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple authorization signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a token signature is supplied.
   * @throws {DepositOwnerMismatchError} from `buildTx()` when the signed owner differs from `userAddress`.
   * @throws {BundlesRequirementSignatureMismatchError} from `buildTx()` when authorization cannot be encoded safely.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
   * @throws {MissingContractCodeError} from `getRequirements()` when a fixed bundles or protocol
   *   contract has no code at its registered address.
   * @throws {viem.BaseError} from `getRequirements()` when an authorization read or
   *   `eth_chainId` request fails.
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
  borrow: (
    params: {
      readonly userAddress: Address;
      readonly borrowAssets: bigint;
      readonly positionData: AccrualPosition;
      readonly reallocations?: Iterable<VaultV2BlueReallocation>;
      /** Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound total proceeds lost. */
      readonly maxPenalty?: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & ReferenceTimestampParams,
  ) => ActionOutput<
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
   * @param params.referralFeePct - Optional WAD-scaled referral fee at most 10%.
   * @param params.referralFeeRecipient - Recipient required for a positive fee.
   * @returns Lazy token prerequisite resolution and a synchronous deep-frozen transaction.
   * @throws {ChainIdMismatchError} when the client targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {UnsupportedBlueMarketIrmError} when positive debt requires an unsupported IRM projection.
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
   * @throws {ReferralFeeRecipientMissingError} when a positive fee has no recipient.
   * @throws {ReferralFeePctExceededError} when the referral fee is at least WAD.
   * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
   * @throws {NativeFundingAmountMismatchError} when native funding is partial or mixed.
   * @throws {ChainWNativeMissingError} when native funding is requested on a chain without wNative.
   * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets another token.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple token signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when an authorization signature is supplied.
   * @throws {DepositOwnerMismatchError} from `buildTx()` when the signed owner differs from `userAddress`.
   * @throws {DepositAssetMismatchError} from `buildTx()` when the signed asset differs from the loan token.
   * @throws {DepositAmountMismatchError} from `buildTx()` when the signed amount differs from the derived funding cap.
   * @throws {DepositSpenderMismatchError} from `buildTx()` when the signed spender is not BlueBundlesV1.
   * @throws {BundlesRequirementSignatureMismatchError} from `buildTx()` when a signature cannot be encoded safely.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
   * @throws {UnknownTokenError} from `getRequirements()` when the funded token's `decimals()` is unusable.
   * @throws {MalformedTokenMetadataError} when the token's `eip712Domain()` or
   *   `bytes32` `name`/`symbol` retry returns non-empty data that does not decode, or when the
   *   deployless query reports malformed `name()`/`symbol()`/`eip712Domain()` returndata (no fallback).
   * @throws {MissingContractCodeError} from `getRequirements()` when a fixed bundles or protocol
   *   contract has no code at its registered address.
   * @throws {viem.BaseError} from `getRequirements()` when an allowance, nonce, token metadata,
   *   or `eth_chainId` read fails.
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
    } & ReferenceTimestampParams &
      (
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
   * @param params.referralFeePct - Optional WAD-scaled referral fee at most 10%.
   * @param params.referralFeeRecipient - Recipient required for a positive fee.
   * @returns Lazy Blue authorization resolution and a synchronous deep-frozen transaction.
   * @throws {ChainIdMismatchError} when the client targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {UnsupportedBlueMarketIrmError} when positive debt requires an unsupported IRM projection.
   * @throws {ExpiredDeadlineError} when the deadline is stale.
   * @throws {MissingAccrualPositionError} when no position snapshot is provided.
   * @throws {MarketIdMismatchError} when `positionData` belongs to another market.
   * @throws {AccrualPositionUserMismatchError} when `positionData` belongs to another user.
   * @throws {WithdrawExceedsCollateralError} when the withdrawal exceeds the position collateral.
   * @throws {MissingMarketPriceError} when the health check has no oracle price.
   * @throws {WithdrawMakesPositionUnhealthyError} when the result exceeds buffered LLTV.
   * @throws {NonPositiveInputError} when `collateralAssets` is not positive.
   * @throws {NegativeInputError} when collateral or the referral fee is negative.
   * @throws {ReferralFeeRecipientMissingError} when a positive fee has no recipient.
   * @throws {ReferralFeePctExceededError} when the referral fee is at least WAD.
   * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple authorization signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a token signature is supplied.
   * @throws {DepositOwnerMismatchError} from `buildTx()` when the signed owner differs from `userAddress`.
   * @throws {BundlesRequirementSignatureMismatchError} from `buildTx()` when authorization cannot be encoded safely.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
   * @throws {MissingContractCodeError} from `getRequirements()` when a fixed bundles or protocol
   *   contract has no code at its registered address.
   * @throws {viem.BaseError} from `getRequirements()` when an authorization read or
   *   `eth_chainId` request fails.
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
  withdrawCollateral: (
    params: {
      readonly userAddress: Address;
      readonly positionData: AccrualPosition;
      readonly collateralAssets: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & ReferenceTimestampParams,
  ) => ActionOutput<
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
   * Full-repay requirements use unlimited classic approvals while the transaction remains bounded
   * by the derived `maxRepayAssets` cap.
   * Share-mode deadlines cannot exceed the two-hour quote horizon. Blue authorization is required
   * only for collateral withdrawal. Pure repay uses `maxLtv = maxUint256`; withdrawals use buffered
   * LLTV. No share-price or `slippageTolerance` input exists.
   *
   * @param params.userAddress - User whose debt and collateral position changes.
   * @param params.positionData - Pre-fetched position used for repayment and health validation.
   * @param params.repayAssets - Exact assets repaid, exclusive with `repayShares`.
   * @param params.repayShares - Exact shares, or `maxUint256` for full repay.
   * @param params.collateralAssets - Collateral withdrawn, or zero for pure repay.
   * @param params.nativeAmount - Optional full native funding; must equal derived `maxRepayAssets`.
   * @param params.deadline - Final call deadline in Unix seconds; share mode is limited to the two-hour funding quote horizon.
   * @param params.referralFeePct - Optional WAD-scaled referral fee at most 10%.
   * @param params.referralFeeRecipient - Recipient required for a positive fee.
   * @returns Lazy funding/authorization resolution and a synchronous deep-frozen transaction builder.
   * @throws {ChainIdMismatchError} when the client targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {UnsupportedBlueMarketIrmError} when positive debt requires an unsupported IRM projection.
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
   * @throws {InputExceedsMaxError} when a share-mode deadline exceeds the funding quote horizon.
   * @throws {MaxRepayAssetsBelowRepayAssetsError} from `buildTx()` when a previously signed share-mode cap no longer covers the fresh derived minimum.
   * @throws {ReferralFeeRecipientMissingError} when a positive fee has no recipient.
   * @throws {ReferralFeePctExceededError} when the referral fee is at least WAD.
   * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
   * @throws {NativeFundingAmountMismatchError} when native funding is partial or mixed.
   * @throws {ChainWNativeMissingError} when native funding is requested on a chain without wNative.
   * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets another token.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple signatures of one kind are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when an inactive leg cannot consume a supplied signature.
   * @throws {DepositOwnerMismatchError} from `buildTx()` when a signed owner differs from `userAddress`.
   * @throws {DepositAssetMismatchError} from `buildTx()` when the signed asset differs from the loan token.
   * @throws {DepositAmountMismatchError} from `buildTx()` when the signed amount differs from the derived funding cap.
   * @throws {DepositSpenderMismatchError} from `buildTx()` when the signed spender is not BlueBundlesV1.
   * @throws {BundlesRequirementSignatureMismatchError} from `buildTx()` when a signature cannot be encoded safely.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
   * @throws {UnknownTokenError} from `getRequirements()` when the funded token's `decimals()` is unusable.
   * @throws {MalformedTokenMetadataError} when the token's `eip712Domain()` or
   *   `bytes32` `name`/`symbol` retry returns non-empty data that does not decode, or when the
   *   deployless query reports malformed `name()`/`symbol()`/`eip712Domain()` returndata (no fallback).
   * @throws {MissingContractCodeError} from `getRequirements()` when a fixed bundles or protocol
   *   contract has no code at its registered address.
   * @throws {viem.BaseError} from `getRequirements()` when a required allowance, nonce, token
   *   metadata, authorization, or `eth_chainId` read fails.
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
   *   now: (await client.getBlock()).timestamp,
   *   deadline: (await client.getBlock()).timestamp + 3_600n,
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
    } & ReferenceTimestampParams &
      (
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
   * No share-price or `slippageTolerance` input exists.
   *
   * @param params.userAddress - User whose collateral and debt position changes.
   * @param params.collateralAssets - Gross collateral supplied, or zero for pure borrow.
   * @param params.borrowAssets - Loan assets borrowed, or zero for pure collateral supply.
   * @param params.positionData - Pre-fetched position; required when `borrowAssets` is positive.
   * @param params.nativeAmount - Optional full native collateral funding; must equal `collateralAssets`.
   * @param params.reallocations - Optional Vault V2 reallocations; valid only for a borrow.
   * @param params.maxPenalty - Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound total proceeds lost.
   * @param params.deadline - Final call deadline in Unix seconds.
   * @param params.referralFeePct - Optional WAD-scaled referral fee at most 10%.
   * @param params.referralFeeRecipient - Recipient required for a positive fee.
   * @returns Lazy funding/authorization resolution and a synchronous deep-frozen transaction builder.
   * @throws {InvalidBigIntInputError} when a supplied maxPenalty is not a bigint.
   * @throws {ChainIdMismatchError} when the client targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {UnsupportedBlueMarketIrmError} when positive debt requires an unsupported IRM projection.
   * @throws {MissingAccrualPositionError} when a borrow has no position snapshot.
   * @throws {MarketIdMismatchError} when `positionData` belongs to another market, or a
   *   reallocation source market's `id` does not hash from its tuple fields.
   * @throws {AccrualPositionUserMismatchError} when `positionData` belongs to another user.
   * @throws {MissingMarketPriceError} when a borrow cannot be validated without an oracle price.
   * @throws {BorrowExceedsSafeLtvError} when the resulting debt exceeds buffered LLTV.
   * @throws {ReallocationsRequireBorrowError} when reallocations accompany no borrow.
   * @throws {ExpiredDeadlineError} when the deadline is stale.
   * @throws {NegativeInputError} when an amount, native funding, referral fee, or reallocation penalty is negative.
   *   Also thrown when maxPenalty is negative.
   * @throws {NonPositiveInputError} when both legs or a reallocation amount is not positive.
   * @throws {NativeFundingAmountMismatchError} when native funding is partial or mixed.
   * @throws {ChainWNativeMissingError} when native funding is requested on a chain without wNative.
   * @throws {NativeAmountOnNonWNativeAssetError} when native funding targets another token.
   * @throws {InputExceedsMaxError} when a fee or reallocation exceeds its ABI bound.
   *   Also thrown when maxPenalty exceeds WAD or a reallocation penalty exceeds maxPenalty.
   * @throws {ReferralFeeRecipientMissingError} when a positive fee has no recipient.
   * @throws {ReferralFeePctExceededError} when the referral fee is at least WAD.
   * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
   * @throws {InvalidReallocationAddressError} when a vault or adapter address is malformed.
   * @throws {InvalidVaultV2BlueReallocationShapeError} when a reallocation entry is not a valid Vault V2 reallocation.
   * @throws {InvalidReallocationSourceTypeError} when a reallocation source is malformed.
   * @throws {InconsistentReallocationPenaltyError} when one vault uses different penalties.
   * @throws {ReallocationWithdrawalOnTargetMarketError} when a source is the target market.
   * @throws {ReallocationLoanTokenMismatchError} when a source uses another loan token.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple signatures of one kind are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when an inactive leg cannot consume a supplied signature.
   * @throws {DepositOwnerMismatchError} from `buildTx()` when a signed owner differs from `userAddress`.
   * @throws {DepositAssetMismatchError} from `buildTx()` when the signed asset differs from the collateral token.
   * @throws {DepositAmountMismatchError} from `buildTx()` when the signed amount differs from `collateralAssets`.
   * @throws {DepositSpenderMismatchError} from `buildTx()` when the signed spender is not BlueBundlesV1.
   * @throws {BundlesRequirementSignatureMismatchError} from `buildTx()` when a signature cannot be encoded safely.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
   * @throws {UnknownTokenError} from `getRequirements()` when the funded token's `decimals()` is unusable.
   * @throws {MalformedTokenMetadataError} when the token's `eip712Domain()` or
   *   `bytes32` `name`/`symbol` retry returns non-empty data that does not decode, or when the
   *   deployless query reports malformed `name()`/`symbol()`/`eip712Domain()` returndata (no fallback).
   * @throws {MissingContractCodeError} from `getRequirements()` when a fixed bundles or protocol
   *   contract has no code at its registered address.
   * @throws {viem.BaseError} from `getRequirements()` when a required allowance, nonce, token
   *   metadata, authorization, or `eth_chainId` read fails.
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
   *   now: (await client.getBlock()).timestamp,
   *   deadline: (await client.getBlock()).timestamp + 3_600n,
   * });
   * const requirements = await action.getRequirements(); // Satisfy these first.
   * const tx = action.buildTx(); // For a client configured with supportSignature: false.
   * // tx satisfies Readonly<Transaction<BlueSupplyCollateralBorrowAction>>
   * ```
   */
  supplyCollateralBorrow: (
    params: {
      readonly userAddress: Address;
      readonly collateralAssets: bigint;
      readonly borrowAssets: bigint;
      readonly positionData?: AccrualPosition;
      readonly nativeAmount?: bigint;
      readonly reallocations?: Iterable<VaultV2BlueReallocation>;
      /** Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound total proceeds lost. */
      readonly maxPenalty?: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & ReferenceTimestampParams,
  ) => ActionOutput<
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
   * @param params.userAddress - Intended owner used to validate both snapshots and resolve Morpho
   *   authorization. It must also send the transaction: the builder cannot enforce this alignment
   *   because this field is not encoded and BlueBundlesV1 always migrates `msg.sender`.
   * @param params.positionData - Pre-fetched source position with nonzero debt.
   * @param params.destination.marketParams - Distinct destination market with matching tokens.
   * @param params.destination.positionData - User's pre-fetched destination position.
   * @param params.reallocations - Optional Vault V2 reallocations into the destination.
   * @param params.maxPenalty - Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound the total penalty added to destination debt.
   * @param params.deadline - Final call deadline in Unix seconds.
   * @param params.referralFeePct - Optional WAD-scaled referral fee at most 10%.
   * @param params.referralFeeRecipient - Recipient required for a positive fee.
   * @returns Lazy Blue authorization resolution and a synchronous deep-frozen transaction builder.
   * @throws {InvalidBigIntInputError} when a supplied maxPenalty is not a bigint.
   * @throws {ChainIdMismatchError} when the client targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {UnsupportedBlueMarketIrmError} when positive source or destination debt requires an unsupported IRM projection.
   * @throws {MissingAccrualPositionError} when either position snapshot is absent at runtime.
   * @throws {MarketIdMismatchError} when a destination or reallocation source market's `id`
   *   does not hash from its tuple fields, or a position snapshot belongs to another market.
   * @throws {AccrualPositionUserMismatchError} when a position snapshot belongs to another user.
   * @throws {RefinanceSameMarketError} when source and destination IDs match.
   * @throws {RefinanceTokenMismatchError} when their loan or collateral tokens differ.
   * @throws {NegativeInputError} when a referral fee or reallocation penalty is negative.
   *   Also thrown when maxPenalty is negative.
   * @throws {NonPositiveInputError} when the source has no borrow shares or a reallocation amount is not positive.
   * @throws {MissingMarketPriceError} when destination health cannot be validated without an oracle price.
   * @throws {BorrowExceedsSafeLtvError} when the complete destination exceeds buffered LLTV.
   * @throws {ExpiredDeadlineError} when the deadline is stale.
   * @throws {InputExceedsMaxError} when a fee or reallocation exceeds its ABI bound.
   *   Also thrown when maxPenalty exceeds WAD or a reallocation penalty exceeds maxPenalty.
   * @throws {ReferralFeeRecipientMissingError} when a positive fee has no recipient.
   * @throws {ReferralFeePctExceededError} when the referral fee is at least WAD.
   * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
   * @throws {InvalidReallocationAddressError} when a vault or adapter address is malformed.
   * @throws {InvalidVaultV2BlueReallocationShapeError} when a reallocation entry is not a valid Vault V2 reallocation.
   * @throws {InvalidReallocationSourceTypeError} when a reallocation source is malformed.
   * @throws {InconsistentReallocationPenaltyError} when one vault uses different penalties.
   * @throws {ReallocationWithdrawalOnTargetMarketError} when a source is the destination market.
   * @throws {ReallocationLoanTokenMismatchError} when a source uses another loan token.
   * @throws {AmbiguousRequirementSignaturesError} from `buildTx()` when multiple authorization signatures are supplied.
   * @throws {UnexpectedRequirementSignatureError} from `buildTx()` when a non-authorization signature is supplied.
   * @throws {DepositOwnerMismatchError} from `buildTx()` when the signed owner differs from `userAddress`.
   * @throws {BundlesRequirementSignatureMismatchError} from `buildTx()` when authorization cannot be encoded safely.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when BlueBundlesV1 is not registered.
   * @throws {MissingContractCodeError} from `getRequirements()` when a fixed bundles or protocol
   *   contract has no code at its registered address.
   * @throws {viem.BaseError} from `getRequirements()` when an authorization read or
   *   `eth_chainId` request fails.
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
   *   now: (await client.getBlock()).timestamp,
   *   deadline: (await client.getBlock()).timestamp + 3_600n,
   * });
   * const requirements = await action.getRequirements(); // Satisfy these first.
   * const tx = action.buildTx(); // For a client configured with supportSignature: false.
   * // tx satisfies Readonly<Transaction<BlueRefinanceAction>>
   * ```
   */
  refinance: (
    params: {
      readonly userAddress: Address;
      readonly positionData: AccrualPosition;
      readonly destination: {
        readonly marketParams: MarketParams;
        readonly positionData: AccrualPosition;
      };
      readonly reallocations?: Iterable<VaultV2BlueReallocation>;
      /** Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound the total penalty added to destination debt. */
      readonly maxPenalty?: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & ReferenceTimestampParams,
  ) => ActionOutput<
    BlueRefinanceAction,
    readonly RequirementSignature[],
    undefined
  >;

  /**
   * Fetches Vault V2 BluePublicAllocator state for this target market.
   *
   * Reads the target Morpho Blue market, each Vault V2 accrual tree, and each
   * vault's BluePublicAllocator permissions and allocation caps at one block.
   * The snapshot keeps the fetched block's timestamp as its default planning time.
   * It always records Blue's loan-token balance in `blueBalances` at that
   * block, so balance-based rejection applies to plans from this fetcher.
   * Sizing has zero margin over that snapshot balance; activity on other Blue
   * markets with the same loan token can make a plan revert. Refetch close to
   * submission; there is no balance-buffer option.
   * Hand-built data without a balance uses summed snapshot-market liquidity
   * only to size plans and may add about the penalty in extra paid assets.
   *
   * @param params.vaultAddresses - Vault V2 addresses to inspect for market or idle liquidity.
   * @param params.block.number - Block number used for every RPC read.
   * @param params.block.timestamp - Timestamp of the fetched block. Stored on the snapshot and used as the
   *   planning timestamp when `options.timestamp` is omitted, never earlier than the latest market/vault
   *   `lastUpdate`. An explicit `options.timestamp` is used as given.
   * @returns A `VaultV2BlueReallocationData` snapshot ready for {@link getVaultV2BlueReallocations}.
   * @throws {ChainIdMismatchError} when the client declares another chain or its RPC reports another
   *   chain via `eth_chainId`.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when the chain has no BluePublicAllocator deployment.
   * @throws {UnknownBlueFactory} when the chain has no Vault V2 factory.
   * @throws {UnknownBlueOfFactory} when a requested address is not a Vault V2 from that factory.
   * @throws {UnsupportedBlueVaultV2AdapterError} when a vault contains an unsupported adapter.
   * @throws {UnknownTokenError} when a vault's share token has unusable decimals.
   * @throws {MalformedTokenMetadataError} when the share token's `eip712Domain()` or
   *   `bytes32` `name`/`symbol` retry returns non-empty data that does not decode, or when the
   *   deployless query reports malformed `name()`/`symbol()`/`eip712Domain()` returndata (no fallback).
   * @throws {viem.BaseError} when the `eth_chainId` request fails or a later RPC or contract read
   *   fails with no fallback left.
   */
  getVaultV2BlueReallocationData: (params: {
    vaultAddresses: readonly Address[];
    block: {
      readonly number: bigint;
      readonly timestamp: bigint;
    };
  }) => Promise<VaultV2BlueReallocationData>;

  /**
   * Computes Vault V2 BluePublicAllocator reallocations for this market.
   * Market/vault state and returned post-state stay at `options.timestamp`;
   * only target-market cap checks reserve interest on the vault's existing
   * allocation through `timestamp + capAccrualBuffer` (two hours by default;
   * `0n` disables it). For market-source reallocations the source position's
   * interest is also reserved on cap ids shared with the target, and reserves
   * persist across every leg of a plan. Operation plans keep
   * `allocatorCapHeadroom` (1% of the cap by default) free under each target
   * BluePublicAllocator cap unless the operation shortfall needs it.
   * With an explicit `blueBalances` value, plans are rejected when Blue cannot
   * fund the penalty flash loan, an earlier market-sourced withdrawal, or the
   * final transfer. A missing balance uses summed snapshot-market liquidity
   * only to size plans and may make them larger; it cannot cause a balance-based
   * rejection.
   * For `refinance`, compute the plan on the destination-market handle (for
   * example, `client.morpho.blue(destination.marketParams, chainId)`), not the
   * source-market handle. Pass the source position's `borrowAssets` accrued to
   * the resolved plan expiry (or the required action deadline for entity
   * `refinance`) as `operation.amount`. With
   * `minTs = max(now, source.lastUpdate, destination.lastUpdate)`, the horizon is
   * `max(minTs, resolved expiry)`. For `prepareBlueRefinance`, omitted `expiresAt`
   * resolves to `now + 2h`, not `minTs + 2h`. Only when the resolved expiry exceeds
   * `minTs + 365 days`, use `minTs + 2h` for unlimited-deadline sentinel
   * compatibility. The optional `operation.referralFeePct` is WAD-scaled.
   * The planner includes the referral fee and its own planned allocator-leg
   * penalties in destination debt. Refinance never uses vaults with a 100%
   * penalty. When executing the returned reallocations, pass the same explicit
   * maxPenalty to borrow, supplyCollateralBorrow, withdraw, or refinance.
   *
   * @param params.reallocationData - State returned by {@link getVaultV2BlueReallocationData}.
   * @param params.options - Optional allocator discovery controls and operation to support.
   * @returns Action-ready reallocations and their post-simulation state.
   * @throws {InvalidBigIntInputError} when options.maxPenalty is supplied but is not a bigint.
   * @throws {ChainIdMismatchError} when `reallocationData` belongs to another chain.
   * @throws {UnsupportedBlueMarketIrmError} when a market with positive debt uses an unsupported IRM.
   * @throws {NegativeInputError} when the cap-accrual buffer, allocator cap headroom, utilization, penalty limit, or referral-fee percentage is negative.
   * @throws {InputExceedsMaxError} when the allocator cap headroom, a utilization, or a penalty limit exceeds WAD, or a selected borrow/withdraw plan otherwise covers its shortfall but its planned penalty exceeds the operation amount.
   * @throws {ReferralFeePctExceededError} when the referral-fee percentage is at least WAD.
   * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
   * @throws {NonPositiveInputError} when an enabled operation amount is not positive.
   * @throws {UnknownReallocationMarketError} when a required market is absent.
   * @throws {UnknownReallocationVaultError} when configured vault state is absent.
   * @throws {UnknownReallocationPublicAllocatorConfigError} when allocator authorization state is absent.
   * @throws {UnknownReallocationActiveAdaptersError} when active-adapter state is absent.
   * @throws {UnknownReallocationMarketPublicAllocatorConfigError} when an adapter-market allocator configuration is absent.
   * @throws {UnknownReallocationAllocationError} when required allocation state is absent.
   * @throws {ReallocationAdapterSupplySharesUnderflowError} when an inconsistent adapter snapshot underflows during the final transition.
   * @throws {ReallocationAllocationUnderflowError} when an inconsistent allocation snapshot underflows during the final transition.
   * @throws {InsufficientSharedLiquidityError} when selected liquidity cannot cover the operation shortfall or refinance penalties, or an explicit Blue balance cannot fund a required transfer.
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

/** Binds a viem client to a Morpho Blue market's action builders. */
export class MorphoBlue implements BlueActions {
  private readonly parsedMarket: ReturnType<typeof parseBlueMarket>;
  /**
   * Binds `client` to the market described by `marketParams` on `chainId`.
   *
   * @param client - Morpho client used for reads and requirement lookups.
   * @param marketParams - Market params whose `id` must hash from their five tuple fields.
   * @param chainId - Chain the market lives on.
   * @throws {MarketIdMismatchError} when `marketParams.id` does not hash from its tuple fields.
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  constructor(
    private readonly client: MorphoClientType,
    public readonly marketParams: MarketParams,
    private readonly chainId: number,
  ) {
    this.parsedMarket = parseBlueMarket(marketParams);
  }

  private validateDeadline(deadline: bigint, now = Time.timestamp()): void {
    if (deadline <= now) {
      throw new ExpiredDeadlineError(deadline, now);
    }
  }

  private validateWriteCommon(
    params: {
      userAddress: Address;
      deadline: bigint;
      referralFeePct?: bigint;
      referralFeeRecipient?: Address;
    },
    now: bigint,
  ) {
    // Reject cross-chain inputs before continuing.
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    // Reject expiry before continuing this call.
    this.validateDeadline(params.deadline, now);
    // Resolve at handle creation so unsupported deployments fail before any RPC prerequisite work.
    getChainAddress(this.chainId, "bundles.blueBundlesV1");
    return parseBlueBundlesV1Common({
      chainId: this.chainId,
      userAddress: params.userAddress,
      deadline: params.deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
    });
  }

  /**
   * Asserts that every registry contract this flow's transaction targets or names as
   * spender/authorized operator holds code, with one `eth_getCode` per distinct address
   * before any other requirement read. Native-only funding validates the served chain
   * concurrently; other flows probe it here only when a target has no code.
   *
   * @param chainCheck - Chain validation shared within this operation.
   * @param nativeFundingOnly - Whether no token or authorization resolver checks the chain.
   */
  private async assertWriteTargets(
    chainCheck: ChainCheck,
    nativeFundingOnly = false,
  ): Promise<void> {
    const targets: { role: AddressLabel; address: Address }[] = [
      {
        role: "bundles.blueBundlesV1",
        address: getChainAddress(this.chainId, "bundles.blueBundlesV1"),
      },
      { role: "blue", address: getChainAddress(this.chainId, "blue") },
    ];
    const assertTargets = () =>
      assertRegistryTargetsHaveCode(
        this.client.viemClient,
        this.chainId,
        targets,
        chainCheck,
      );
    if (nativeFundingOnly) {
      await validateNativeRequirements(this.client.viemClient, {
        chainId: this.chainId,
        chainCheck,
        assertWriteTargets: assertTargets,
      });
    } else {
      await assertTargets();
    }
  }

  private getMaxLtv(
    marketParams: Pick<MarketParams, "lltv"> = this.parsedMarket,
  ): bigint {
    return MathLib.zeroFloorSub(marketParams.lltv, DEFAULT_LLTV_BUFFER);
  }

  private async getTokenRequirements(
    chainCheck: ChainCheck,
    params: {
      token: Address;
      amount: bigint;
      userAddress: Address;
      deadline: bigint;
      useSimplePermit?: boolean;
      now?: bigint;
    },
  ): Promise<readonly ActionRequirement[]> {
    // Reject expiry before continuing this call.
    this.validateDeadline(params.deadline, params.now);
    return getParsedBundlesTokenRequirements(
      { viemClient: this.client.viemClient, chainCheck },
      parseGetBundlesTokenRequirements(this.client.viemClient, {
        token: params.token,
        spender: getChainAddress(this.chainId, "bundles.blueBundlesV1"),
        amount: params.amount,
        owner: params.userAddress,
        chainId: this.chainId,
        deadline: params.deadline,
        supportSignature: this.client.options.supportSignature,
        supportDeployless: this.client.options.supportDeployless,
        useSimplePermit: params.useSimplePermit,
        now: params.now,
      }),
    );
  }

  private async getAuthorizationRequirements(
    chainCheck: ChainCheck,
    params: {
      userAddress: Address;
      deadline: bigint;
      now?: bigint;
    },
  ): Promise<readonly ActionRequirement[]> {
    // Reject expiry before continuing this call.
    this.validateDeadline(params.deadline, params.now);
    const requirement = await getParsedBlueAuthorizationRequirement(
      parseBlueAuthorizationRequirement({
        viemClient: this.client.viemClient,
        chainId: this.chainId,
        userAddress: params.userAddress,
        supportSignature: this.client.options.supportSignature,
        authorized: getChainAddress(this.chainId, "bundles.blueBundlesV1"),
        deadline: params.deadline,
        now: params.now,
      }),
      chainCheck,
    );
    return requirement == null ? [] : [requirement];
  }

  async getMarketData(parameters?: FetchParameters): Promise<Market> {
    // Confirm the RPC chain before contract reads.
    await createChainCheck(this.client.viemClient, this.chainId)();

    return fetchMarket(this.parsedMarket.id, this.client.viemClient, {
      ...parameters,
      deployless: this.client.options.supportDeployless,
    });
  }

  async getPositionData(
    userAddress: Address,
    parameters?: FetchParameters,
  ): Promise<AccrualPosition> {
    // Confirm the RPC chain before contract reads.
    await createChainCheck(this.client.viemClient, this.chainId)();

    return fetchAccrualPosition(
      userAddress,
      this.parsedMarket.id,
      this.client.viemClient,
      {
        ...parameters,
        deployless: this.client.options.supportDeployless,
      },
    );
  }

  /** {@inheritDoc BlueActions.supply} */
  supply(
    params: {
      readonly userAddress: Address;
      readonly marketData: Market;
      readonly assets: bigint;
      readonly nativeAmount?: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & ReferenceTimestampParams,
  ): ActionOutput<
    BlueSupplyAction,
    readonly RequirementSignature[],
    BlueTokenRequirementsParams
  >;
  /**
   * @deprecated Pass `marketData` from `getMarketData()`; the snapshot-free overload is removed in the next major.
   */
  supply(
    params: {
      readonly userAddress: Address;
      readonly assets: bigint;
      readonly nativeAmount?: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & ReferenceTimestampParams,
  ): ActionOutput<
    BlueSupplyAction,
    readonly RequirementSignature[],
    BlueTokenRequirementsParams
  >;
  supply(
    params: {
      readonly userAddress: Address;
      readonly marketData?: Market;
      readonly assets: bigint;
      readonly nativeAmount?: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & ReferenceTimestampParams,
  ) {
    return this.supplyPrepared(this.parseSupplyParams(params));
  }

  private parseSupplyParams(
    params: Parameters<BlueActions["supply"]>[0] & {
      readonly marketData?: Market;
    },
  ): BlueSupplyInput & ReferenceTimestampParams {
    const { assets } = params;
    const metadata = resolveTransactionMetadata(
      this.client.options.metadata,
      params.now,
    );
    const createdAt = params.now ?? Time.timestamp();
    const normalized = this.validateWriteCommon(params, createdAt);
    if (assets <= 0n) {
      throw new NonPositiveInputError("assets", assets);
    }
    const nativeValue = parseNativeFunding({
      chainId: this.chainId,
      token: this.parsedMarket.loanToken,
      fundedAmount: assets,
      nativeAmount: params.nativeAmount,
    });
    if (
      params.marketData != null &&
      params.marketData.id !== this.parsedMarket.id
    ) {
      throw new MarketIdMismatchError(
        params.marketData.id,
        this.parsedMarket.id,
      );
    }

    const input: Omit<BlueSupplyInput & ReferenceTimestampParams, symbol> = {
      ...normalized,
      chainId: this.chainId,
      userAddress: params.userAddress,
      marketParams: this.parsedMarket,
      now: params.now,
      metadata,
      assets: parseUint256Max("assets", assets),
      value: nativeValue,
    };
    return input as BlueSupplyInput & ReferenceTimestampParams;
  }

  private supplyPrepared(parsed: BlueSupplyInput & ReferenceTimestampParams) {
    const {
      userAddress,
      assets,
      deadline,
      value: nativeValue,
      marketParams,
    } = parsed;
    return {
      getRequirements: (
        requirementsParams?: BlueTokenRequirementsParams,
      ): Promise<readonly ActionRequirement[]> => {
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        const now = parsed.now ?? Time.timestamp();
        // Reject expiry before continuing this call.
        this.validateDeadline(deadline, now);
        if (nativeValue > 0n) {
          // Neither token requirements nor authorization will validate the chain.
          return this.assertWriteTargets(chainCheck, true).then(() => []);
        }
        return this.assertWriteTargets(chainCheck).then(() =>
          this.getTokenRequirements(chainCheck, {
            token: marketParams.loanToken,
            amount: assets,
            userAddress,
            deadline,
            now,
            useSimplePermit: requirementsParams?.useSimplePermit,
          }),
        );
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { token } = selectBlueBundlesV1RequirementSignatures(signatures, {
          token: nativeValue === 0n,
        });
        return buildBlueSupply(parsed, { requirementSignature: token });
      },
    };
  }

  /** {@inheritDoc BlueActions.withdraw} */
  withdraw(
    params: {
      readonly userAddress: Address;
      readonly positionData: AccrualPosition;
      readonly reallocations?: Iterable<VaultV2BlueReallocation>;
      /** Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound total proceeds lost. */
      readonly maxPenalty?: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & ReferenceTimestampParams &
      AssetsOrSharesArgs,
  ) {
    return this.withdrawPrepared(this.parseWithdrawParams(params));
  }

  private parseWithdrawParams(
    params: Parameters<BlueActions["withdraw"]>[0],
  ): BlueWithdrawInput & ReferenceTimestampParams {
    const { userAddress, positionData } = params;
    const metadata = resolveTransactionMetadata(
      this.client.options.metadata,
      params.now,
    );
    const createdAt = params.now ?? Time.timestamp();
    const normalized = this.validateWriteCommon(params, createdAt);
    const assets = ("assets" in params ? params.assets : undefined) ?? 0n;
    const shares = ("shares" in params ? params.shares : undefined) ?? 0n;
    const lowerAssets = parseNonnegative("assets", assets);
    const lowerShares = parseNonnegative("shares", shares);
    const mode = parseBlueWithdrawMode(this.parsedMarket, {
      withdrawAssets: assets,
      withdrawShares: shares,
      field: "assets or shares",
    });
    if (positionData == null) {
      throw new MissingAccrualPositionError(this.parsedMarket.id);
    }
    // Reject a snapshot for another user or market.
    validateAccrualPosition({
      positionData,
      expectedMarketId: this.parsedMarket.id,
      expectedUser: userAddress,
    });
    if (shares > 0n) {
      // Reject a withdrawal larger than the supplied share balance.
      validateWithdrawShares({
        positionData,
        withdrawShares: shares,
        marketId: this.parsedMarket.id,
      });
    } else {
      // Reject a withdrawal larger than the supplied asset balance.
      validateWithdrawAmount({
        positionData,
        withdrawAssets: assets,
        marketId: this.parsedMarket.id,
      });
    }
    const allocations = parseBlueWithdrawPenalty(
      parseBlueAllocations([...(params.reallocations ?? [])], {
        marketParams: this.parsedMarket,
        maxPenalty: params.maxPenalty,
      }),
      mode,
    );
    const reallocationPenaltyAssets = allocations.penaltyAssets;
    const expectedWithdrawAssets =
      assets > 0n ? assets : positionData.market.toSupplyAssets(shares, "Down");
    if (shares > 0n && reallocationPenaltyAssets > expectedWithdrawAssets) {
      throw new InputExceedsMaxError({
        field: "reallocationPenaltyAssets",
        value: reallocationPenaltyAssets,
        max: expectedWithdrawAssets,
      });
    }

    const input: Omit<BlueWithdrawInput & ReferenceTimestampParams, symbol> = {
      ...normalized,
      chainId: this.chainId,
      userAddress,
      marketParams: this.parsedMarket,
      now: params.now,
      metadata,
      publicAllocations: allocations.publicAllocations,
      reallocationPenaltyAssets,
      withdrawAssets: parseUint256Max("withdrawAssets", lowerAssets),
      withdrawShares: parseUint256Max("withdrawShares", lowerShares),
    };
    return input as BlueWithdrawInput & ReferenceTimestampParams;
  }

  private withdrawPrepared(
    parsed: BlueWithdrawInput & ReferenceTimestampParams,
  ) {
    const { userAddress, deadline } = parsed;
    return {
      getRequirements: async () => {
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        const now = parsed.now ?? Time.timestamp();
        // Reject expiry before continuing this call.
        this.validateDeadline(deadline, now);
        // Reject missing write targets before resolving requirements.
        await this.assertWriteTargets(chainCheck);
        return this.getAuthorizationRequirements(chainCheck, {
          userAddress,
          deadline,
          now,
        });
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { authorization } = selectBlueBundlesV1RequirementSignatures(
          signatures,
          {
            authorization: true,
          },
        );
        return buildBlueWithdraw(parsed, {
          authorizationSignature: authorization,
        });
      },
    };
  }

  /** {@inheritDoc BlueActions.withdrawBuyCallback} */
  withdrawBuyCallback(
    params: {
      readonly userAddress: Address;
      readonly callbackAddress: Address;
      readonly positionData: AccrualPosition;
    } & ReferenceTimestampParams,
  ): ActionOutput<BlueWithdrawBuyCallbackAction, undefined, undefined> {
    return this.withdrawBuyCallbackPrepared(
      this.parseWithdrawBuyCallbackParams(params),
    );
  }

  private parseWithdrawBuyCallbackParams(
    params: Parameters<BlueActions["withdrawBuyCallback"]>[0],
  ): BlueWithdrawBuyCallbackInput & { readonly factory: Address } {
    const metadata = resolveTransactionMetadata(
      this.client.options.metadata,
      params.now,
    );
    const { userAddress, callbackAddress, positionData } = params;
    // Reject cross-chain inputs before continuing.
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    if (positionData == null) {
      throw new MissingAccrualPositionError(this.parsedMarket.id);
    }
    // Reject a snapshot for another user or market.
    validateAccrualPosition({
      positionData,
      expectedMarketId: this.parsedMarket.id,
      expectedUser: callbackAddress,
    });
    const shares = positionData.supplyShares;
    if (shares === 0n) {
      throw new EmptyBlueSupplyPositionError({
        market: this.parsedMarket.id,
        user: callbackAddress,
      });
    }

    const assets = positionData.supplyAssets;
    const liquidity = positionData.market.liquidity;
    if (assets > liquidity) {
      throw new InsufficientBlueLiquidityError({
        market: this.parsedMarket.id,
        assets,
        liquidity,
      });
    }

    const blue = getChainAddress(this.chainId, "blue");
    const factory = getChainAddress(
      this.chainId,
      "midnightBlueBuyCallbackFactory",
    );
    const boundedShares = parseUint256("shares", shares);
    if (boundedShares === 0n) {
      throw new NonPositiveInputError("shares", boundedShares);
    }
    return {
      marketParams: this.parsedMarket,
      callbackAddress,
      userAddress,
      shares: boundedShares,
      metadata,
      to: blue,
      factory,
    } as BlueWithdrawBuyCallbackInput & { readonly factory: Address };
  }

  private withdrawBuyCallbackPrepared(
    parsed: BlueWithdrawBuyCallbackInput & { readonly factory: Address },
  ) {
    const { userAddress, callbackAddress, factory, to: blue } = parsed;
    const tx = buildBlueWithdrawBuyCallback(parsed);
    return {
      getRequirements: async () => {
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        const viemClient = this.client.viemClient;
        // Confirm the RPC chain before prerequisite reads.
        await chainCheck();
        // Reject missing registry contracts before prerequisite reads.
        await assertRegistryTargetsHaveCode(
          viemClient,
          this.chainId,
          [
            { role: "blue", address: blue },
            { role: "midnightBlueBuyCallbackFactory", address: factory },
          ],
          chainCheck,
        );
        // Check the factory first: OWNER() on an arbitrary address can revert or lie.
        const isBlueBuyCallback = await readContract(viemClient, {
          address: factory,
          abi: midnightBlueBuyCallbackFactoryAbi,
          functionName: "isBlueBuyCallback",
          args: [callbackAddress],
        });
        if (!isBlueBuyCallback) {
          throw new NotBlueBuyCallbackError(callbackAddress);
        }
        const [owner, isAuthorized] = await Promise.all([
          readContract(viemClient, {
            address: callbackAddress,
            abi: midnightBlueBuyCallbackAbi,
            functionName: "OWNER",
          }),
          readContract(viemClient, {
            address: blue,
            abi: blueAbi,
            functionName: "isAuthorized",
            args: [callbackAddress, userAddress],
          }),
        ]);
        if (!isAddressEqual(owner, userAddress)) {
          throw new BlueBuyCallbackOwnerMismatchError({
            callback: callbackAddress,
            owner,
            userAddress,
          });
        }
        if (!isAuthorized) {
          throw new BlueBuyCallbackUnauthorizedError({
            callback: callbackAddress,
            userAddress,
          });
        }
        return [];
      },
      buildTx: () => tx,
    };
  }

  /** {@inheritDoc BlueActions.supplyCollateral} */
  supplyCollateral(
    params: {
      readonly userAddress: Address;
      readonly collateralAssets: bigint;
      readonly nativeAmount?: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & ReferenceTimestampParams,
  ): ActionOutput<
    BlueSupplyCollateralAction,
    readonly RequirementSignature[],
    BlueTokenRequirementsParams
  > {
    return this.supplyCollateralPrepared(
      this.parseSupplyCollateralParams(params),
    );
  }

  private parseSupplyCollateralParams(
    params: Parameters<BlueActions["supplyCollateral"]>[0],
  ): BlueSupplyCollateralInput & ReferenceTimestampParams {
    const {
      userAddress,
      collateralAssets,
      nativeAmount,
      deadline,
      referralFeePct,
      referralFeeRecipient,
    } = params;
    return {
      ...this.parseSupplyCollateralBorrowParams({
        now: params.now,
        userAddress,
        collateralAssets,
        borrowAssets: 0n,
        nativeAmount,
        deadline,
        referralFeePct,
        referralFeeRecipient,
      }),
      borrowAssets: 0n,
    };
  }

  private supplyCollateralPrepared(
    parsed: BlueSupplyCollateralInput & ReferenceTimestampParams,
  ) {
    const combinedAction = this.supplyCollateralBorrowPrepared(parsed);
    return {
      getRequirements: combinedAction.getRequirements,
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const transaction = combinedAction.buildTx(signatures);
        return deepFreeze({
          ...transaction,
          action: {
            ...transaction.action,
            type: "blueSupplyCollateral" as const,
          },
        });
      },
    };
  }

  /** {@inheritDoc BlueActions.borrow} */
  borrow(
    params: {
      readonly userAddress: Address;
      readonly borrowAssets: bigint;
      readonly positionData: AccrualPosition;
      readonly reallocations?: Iterable<VaultV2BlueReallocation>;
      /** Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound total proceeds lost. */
      readonly maxPenalty?: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & ReferenceTimestampParams,
  ): ActionOutput<
    BlueBorrowAction,
    readonly RequirementSignature[],
    undefined
  > {
    return this.borrowPrepared(this.parseBorrowParams(params));
  }

  private parseBorrowParams(
    params: Parameters<BlueActions["borrow"]>[0],
  ): BlueBorrowInput & ReferenceTimestampParams {
    const {
      userAddress,
      borrowAssets,
      positionData,
      reallocations,
      maxPenalty,
      deadline,
      referralFeePct,
      referralFeeRecipient,
    } = params;
    const normalizedReallocations = [...(reallocations ?? [])];
    return {
      ...this.parseSupplyCollateralBorrowParams({
        now: params.now,
        userAddress,
        collateralAssets: 0n,
        borrowAssets,
        positionData,
        reallocations: normalizedReallocations,
        maxPenalty,
        deadline,
        referralFeePct,
        referralFeeRecipient,
      }),
      collateralAssets: 0n,
    };
  }

  private borrowPrepared(parsed: BlueBorrowInput & ReferenceTimestampParams) {
    const combinedAction = this.supplyCollateralBorrowPrepared(parsed);
    return {
      getRequirements: () => combinedAction.getRequirements(),
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const transaction = combinedAction.buildTx(signatures);
        return deepFreeze({
          ...transaction,
          action: { ...transaction.action, type: "blueBorrow" as const },
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
    } & ReferenceTimestampParams &
      (
        | { readonly repayAssets: bigint; readonly repayShares?: never }
        | { readonly repayShares: bigint; readonly repayAssets?: never }
      ),
  ): ActionOutput<
    BlueRepayAction,
    readonly RequirementSignature[],
    BlueTokenRequirementsParams
  > {
    return this.repayPrepared(this.parseRepayParams(params));
  }

  private parseRepayParams(
    params: Parameters<BlueActions["repay"]>[0],
  ): BlueRepayOnlyInput & ReferenceTimestampParams {
    return {
      ...this.parseRepayWithdrawCollateralParams({
        now: params.now,
        ...params,
        collateralAssets: 0n,
      }),
      collateralAssets: 0n,
    };
  }

  private repayPrepared(parsed: BlueRepayOnlyInput & ReferenceTimestampParams) {
    const combinedAction = this.repayWithdrawCollateralPrepared(parsed);
    return {
      getRequirements: combinedAction.getRequirements,
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const transaction = combinedAction.buildTx(signatures);
        return deepFreeze({
          ...transaction,
          action: { ...transaction.action, type: "blueRepay" as const },
        });
      },
    };
  }

  /** {@inheritDoc BlueActions.withdrawCollateral} */
  withdrawCollateral(
    params: {
      readonly userAddress: Address;
      readonly positionData: AccrualPosition;
      readonly collateralAssets: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & ReferenceTimestampParams,
  ): ActionOutput<
    BlueWithdrawCollateralAction,
    readonly RequirementSignature[],
    undefined
  > {
    return this.withdrawCollateralPrepared(
      this.parseWithdrawCollateralParams(params),
    );
  }

  private parseWithdrawCollateralParams(
    params: Parameters<BlueActions["withdrawCollateral"]>[0],
  ): BlueWithdrawCollateralInput & ReferenceTimestampParams {
    const {
      userAddress,
      positionData,
      collateralAssets,
      deadline,
      referralFeePct,
      referralFeeRecipient,
    } = params;
    return {
      ...this.parseRepayWithdrawCollateralParams({
        now: params.now,
        userAddress,
        positionData,
        repayAssets: 0n,
        collateralAssets,
        deadline,
        referralFeePct,
        referralFeeRecipient,
      }),
      repayAssets: 0n,
      repayShares: 0n,
      maxRepayAssets: 0n,
      hasRepay: false,
    };
  }

  private withdrawCollateralPrepared(
    parsed: BlueWithdrawCollateralInput & ReferenceTimestampParams,
  ) {
    const combinedAction = this.repayWithdrawCollateralPrepared(parsed);
    return {
      getRequirements: () => combinedAction.getRequirements(),
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const transaction = combinedAction.buildTx(signatures);
        return deepFreeze({
          ...transaction,
          action: {
            ...transaction.action,
            type: "blueWithdrawCollateral" as const,
          },
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
    } & ReferenceTimestampParams &
      (
        | { readonly repayAssets: bigint; readonly repayShares?: never }
        | { readonly repayShares: bigint; readonly repayAssets?: never }
        | { readonly repayAssets?: undefined; readonly repayShares?: undefined }
      ),
  ) {
    return this.repayWithdrawCollateralPrepared(
      this.parseRepayWithdrawCollateralParams(params),
    );
  }

  private parseRepayWithdrawCollateralParams(
    params: Parameters<BlueActions["repayWithdrawCollateral"]>[0],
  ): BlueRepayInput & ReferenceTimestampParams {
    const {
      userAddress,
      positionData,
      collateralAssets,
      nativeAmount,
      deadline,
    } = params;
    const metadata = resolveTransactionMetadata(
      this.client.options.metadata,
      params.now,
    );
    const createdAt = params.now ?? Time.timestamp();
    const normalized = this.validateWriteCommon(params, createdAt);
    const repayAssets = params.repayAssets ?? 0n;
    const repayShares = params.repayShares ?? 0n;
    const lowerRepayAssets = parseNonnegative("repayAssets", repayAssets);
    const lowerRepayShares = parseNonnegative("repayShares", repayShares);
    const lowerCollateralAssets = parseNonnegative(
      "collateralAssets",
      collateralAssets,
    );
    const mode = parseBlueRepayMode(this.parsedMarket, {
      repayAssets,
      repayShares,
      collateralAssets,
    });
    const referralFeePct = normalized.referralFeePct;
    const hasRepay = repayAssets > 0n || repayShares > 0n;
    if (positionData == null) {
      throw new MissingAccrualPositionError(this.parsedMarket.id);
    }
    // Reject a snapshot for another user or market.
    validateAccrualPosition({
      positionData,
      expectedMarketId: this.parsedMarket.id,
      expectedUser: userAddress,
    });

    const { simulatedRepayShares, accruedPosition, expectedRepayAssets } =
      quoteBlueRepay({
        marketId: this.parsedMarket.id,
        positionData,
        repayAssets,
        repayShares,
        deadline,
        now: createdAt,
        healthTimestamp:
          collateralAssets > 0n
            ? getBlueBundlesV1QuoteTimestamp({
                lastUpdate: positionData.market.lastUpdate,
                now: createdAt,
                deadline,
              })
            : undefined,
      });
    const maxRepayAssets =
      expectedRepayAssets +
      getBlueBundlesV1ReferralFeeAssets(expectedRepayAssets, referralFeePct);
    const nativeValue = parseNativeFunding({
      chainId: this.chainId,
      token: this.parsedMarket.loanToken,
      fundedAmount: maxRepayAssets,
      nativeAmount,
    });

    if (collateralAssets > 0n) {
      const postRepayPosition = hasRepay
        ? accruedPosition.repay(repayAssets, simulatedRepayShares).position
        : accruedPosition;
      // Reject collateral withdrawal that would leave unsafe debt.
      validatePositionHealthAfterWithdraw({
        positionData: postRepayPosition,
        withdrawAmount: collateralAssets,
        lltv: this.parsedMarket.lltv,
        marketId: this.parsedMarket.id,
      });
    }

    const legs = {
      ...normalized,
      chainId: this.chainId,
      userAddress,
      marketParams: this.parsedMarket,
      now: params.now,
      metadata,
      repayAssets: parseUint256Max("repayAssets", lowerRepayAssets),
      repayShares: parseUint256Max("repayShares", lowerRepayShares),
      collateralAssets: parseUint256Max(
        "collateralAssets",
        lowerCollateralAssets,
      ),
      maxLtv: parseUint256(
        "maxLtv",
        collateralAssets > 0n ? this.getMaxLtv() : maxUint256,
      ),
      hasRepay,
      minimumRepayAssets:
        repayAssets +
        getBlueBundlesV1ReferralFeeAssets(repayAssets, referralFeePct),
    };
    const cap = parseBlueRepayCap(
      mode,
      parseUint256("maxRepayAssets", maxRepayAssets),
    );
    const coveredCap = parseBlueRepayCoverage(legs, cap);
    const input: Omit<BlueRepayInput & ReferenceTimestampParams, symbol> = {
      ...legs,
      maxRepayAssets: coveredCap,
      value: nativeValue,
    };
    return input as BlueRepayInput & ReferenceTimestampParams;
  }

  private repayWithdrawCollateralPrepared(
    parsed: BlueRepayInput & ReferenceTimestampParams,
  ) {
    const {
      userAddress,
      collateralAssets,
      deadline,
      hasRepay,
      maxRepayAssets,
      value: nativeValue,
      marketParams,
    } = parsed;
    return {
      getRequirements: async (
        requirementsParams?: BlueTokenRequirementsParams,
      ): Promise<readonly ActionRequirement[]> => {
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        const now = parsed.now ?? Time.timestamp();
        // Reject expiry before continuing this call.
        this.validateDeadline(deadline, now);
        const nativeOnly = nativeValue > 0n && collateralAssets === 0n;
        await this.assertWriteTargets(chainCheck, nativeOnly);
        const [tokenRequirements, authorizationRequirements] =
          await Promise.all([
            hasRepay && nativeValue === 0n
              ? this.getTokenRequirements(chainCheck, {
                  token: marketParams.loanToken,
                  amount: maxRepayAssets,
                  userAddress,
                  deadline,
                  now,
                  useSimplePermit: requirementsParams?.useSimplePermit,
                })
              : Promise.resolve([]),
            collateralAssets > 0n
              ? this.getAuthorizationRequirements(chainCheck, {
                  userAddress,
                  deadline,
                  now,
                })
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
        return buildBlueRepayWithdrawCollateral(parsed, {
          requirementSignature: token,
          authorizationSignature: authorization,
          signatureFunding: true,
        });
      },
    };
  }

  /** {@inheritDoc BlueActions.supplyCollateralBorrow} */
  supplyCollateralBorrow(
    params: {
      readonly userAddress: Address;
      readonly collateralAssets: bigint;
      readonly borrowAssets: bigint;
      readonly positionData?: AccrualPosition;
      readonly nativeAmount?: bigint;
      readonly reallocations?: Iterable<VaultV2BlueReallocation>;
      /** Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound total proceeds lost. */
      readonly maxPenalty?: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & ReferenceTimestampParams,
  ) {
    return this.supplyCollateralBorrowPrepared(
      this.parseSupplyCollateralBorrowParams(params),
    );
  }

  private parseSupplyCollateralBorrowParams(
    params: Parameters<BlueActions["supplyCollateralBorrow"]>[0],
  ): BlueSupplyCollateralBorrowInput & ReferenceTimestampParams {
    const { userAddress, collateralAssets, borrowAssets, positionData } =
      params;
    const metadata = resolveTransactionMetadata(
      this.client.options.metadata,
      params.now,
    );
    const createdAt = params.now ?? Time.timestamp();
    const normalized = this.validateWriteCommon(params, createdAt);
    const lowerCollateralAssets = parseNonnegative(
      "collateralAssets",
      collateralAssets,
    );
    const lowerBorrowAssets = parseNonnegative("borrowAssets", borrowAssets);
    if (collateralAssets === 0n && borrowAssets === 0n) {
      throw new NonPositiveInputError("collateralAssets or borrowAssets", 0n);
    }
    const mode = parseBlueSupplyCollateralBorrowMode({
      collateralAssets,
      borrowAssets,
      reallocations: [...(params.reallocations ?? [])],
      maxPenalty: params.maxPenalty,
    });
    const allocations = parseBlueSupplyCollateralBorrowAllocations(
      this.parsedMarket,
      mode,
    );
    if (borrowAssets > 0n) {
      if (positionData == null) {
        throw new MissingAccrualPositionError(this.parsedMarket.id);
      }
      // Reject a snapshot for another user or market.
      validateAccrualPosition({
        positionData,
        expectedMarketId: this.parsedMarket.id,
        expectedUser: userAddress,
      });
      // Reject resulting debt above the buffered LLTV.
      validatePositionHealth({
        positionData: positionData.accrueInterest(
          getBlueBundlesV1QuoteTimestamp({
            lastUpdate: positionData.market.lastUpdate,
            now: createdAt,
            deadline: normalized.deadline,
          }),
        ),
        additionalCollateral: collateralAssets,
        borrowAmount: borrowAssets,
        marketId: this.parsedMarket.id,
        lltv: this.parsedMarket.lltv,
      });
    }
    const nativeValue = parseNativeFunding({
      chainId: this.chainId,
      token: this.parsedMarket.collateralToken,
      fundedAmount: collateralAssets,
      nativeAmount: params.nativeAmount,
    });
    const input: Omit<
      BlueSupplyCollateralBorrowInput & ReferenceTimestampParams,
      symbol
    > = {
      ...normalized,
      chainId: this.chainId,
      userAddress,
      marketParams: this.parsedMarket,
      now: params.now,
      metadata,
      publicAllocations: allocations.publicAllocations,
      reallocationPenaltyAssets: allocations.penaltyAssets,
      value: nativeValue,
      collateralAssets: parseUint256Max(
        "collateralAssets",
        lowerCollateralAssets,
      ),
      borrowAssets: parseUint256Max("borrowAssets", lowerBorrowAssets),
      maxLtv: parseUint256(
        "maxLtv",
        borrowAssets > 0n ? this.getMaxLtv() : maxUint256,
      ),
    };
    return input as BlueSupplyCollateralBorrowInput & ReferenceTimestampParams;
  }

  private supplyCollateralBorrowPrepared(
    parsed: BlueSupplyCollateralBorrowInput & ReferenceTimestampParams,
  ) {
    const {
      userAddress,
      collateralAssets,
      borrowAssets,
      deadline,
      value: nativeValue,
      marketParams,
    } = parsed;
    return {
      getRequirements: async (
        requirementsParams?: BlueTokenRequirementsParams,
      ): Promise<readonly ActionRequirement[]> => {
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        const now = parsed.now ?? Time.timestamp();
        // Reject expiry before continuing this call.
        this.validateDeadline(deadline, now);
        // Native-only funding has no token or authorization chain check.
        await this.assertWriteTargets(
          chainCheck,
          nativeValue > 0n && borrowAssets === 0n,
        );
        const [tokenRequirements, authorizationRequirements] =
          await Promise.all([
            collateralAssets > 0n && nativeValue === 0n
              ? this.getTokenRequirements(chainCheck, {
                  token: marketParams.collateralToken,
                  amount: collateralAssets,
                  userAddress,
                  deadline,
                  now,
                  useSimplePermit: requirementsParams?.useSimplePermit,
                })
              : Promise.resolve([]),
            borrowAssets > 0n
              ? this.getAuthorizationRequirements(chainCheck, {
                  userAddress,
                  deadline,
                  now,
                })
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
        return buildBlueSupplyCollateralBorrow(parsed, {
          requirementSignature: token,
          authorizationSignature: authorization,
        });
      },
    };
  }

  /** {@inheritDoc BlueActions.refinance} */
  refinance(
    params: {
      readonly userAddress: Address;
      readonly positionData: AccrualPosition;
      readonly destination: {
        readonly marketParams: MarketParams;
        readonly positionData: AccrualPosition;
      };
      readonly reallocations?: Iterable<VaultV2BlueReallocation>;
      /** Maximum WAD-scaled penalty rate per reallocation in [0, WAD], defaulting to zero. Each rate applies to that reallocation's assets, so it does not bound the total penalty added to destination debt. */
      readonly maxPenalty?: bigint;
      readonly deadline: bigint;
      readonly referralFeePct?: bigint;
      readonly referralFeeRecipient?: Address;
    } & ReferenceTimestampParams,
  ) {
    return this.refinancePrepared(this.parseRefinanceParams(params));
  }

  private parseRefinanceParams(
    params: Parameters<BlueActions["refinance"]>[0],
  ): BlueRefinanceInput & ReferenceTimestampParams {
    const { userAddress, positionData, destination } = params;
    const metadata = resolveTransactionMetadata(
      this.client.options.metadata,
      params.now,
    );
    const createdAt = params.now ?? Time.timestamp();
    const normalized = this.validateWriteCommon(params, createdAt);
    const destinationMarketParams = parseBlueMarket(destination.marketParams);
    const referralFeePct = normalized.referralFeePct;
    if (positionData == null) {
      throw new MissingAccrualPositionError(this.parsedMarket.id);
    }
    // Reject a snapshot for another user or market.
    validateAccrualPosition({
      positionData,
      expectedMarketId: this.parsedMarket.id,
      expectedUser: userAddress,
    });
    if (positionData.borrowShares <= 0n) {
      throw new NonPositiveInputError(
        "positionData.borrowShares",
        positionData.borrowShares,
      );
    }
    const markets = parseBlueRefinanceMarkets({
      sourceMarketParams: this.parsedMarket,
      destinationMarketParams,
    });
    if (destination.positionData == null) {
      throw new MissingAccrualPositionError(destinationMarketParams.id);
    }
    // Reject a snapshot for another user or market.
    validateAccrualPosition({
      positionData: destination.positionData,
      expectedMarketId: destinationMarketParams.id,
      expectedUser: userAddress,
    });

    const allocations = parseBlueAllocations(
      [...(params.reallocations ?? [])],
      {
        marketParams: markets.destinationMarketParams,
        maxPenalty: params.maxPenalty,
      },
    );
    validateBlueRefinanceQuote({
      destinationMarketParams,
      sourcePosition: positionData,
      destinationPosition: destination.positionData,
      penaltyAssets: allocations.penaltyAssets,
      referralFeePct,
      now: createdAt,
      deadline: normalized.deadline,
    });

    const input: Omit<BlueRefinanceInput & ReferenceTimestampParams, symbol> = {
      ...markets,
      ...normalized,
      chainId: this.chainId,
      userAddress,
      now: params.now,
      metadata,
      publicAllocations: allocations.publicAllocations,
      reallocationPenaltyAssets: allocations.penaltyAssets,
      maxLtv: parseUint256("maxLtv", this.getMaxLtv(destinationMarketParams)),
    };
    return input as BlueRefinanceInput & ReferenceTimestampParams;
  }

  private refinancePrepared(
    parsed: BlueRefinanceInput & ReferenceTimestampParams,
  ) {
    const { userAddress, deadline } = parsed;
    return {
      getRequirements: async () => {
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        const now = parsed.now ?? Time.timestamp();
        // Reject expiry before continuing this call.
        this.validateDeadline(deadline, now);
        // Reject missing write targets before resolving requirements.
        await this.assertWriteTargets(chainCheck);
        return this.getAuthorizationRequirements(chainCheck, {
          userAddress,
          deadline,
          now,
        });
      },
      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { authorization } = selectBlueBundlesV1RequirementSignatures(
          signatures,
          {
            authorization: true,
          },
        );
        return buildBlueRefinance(parsed, {
          authorizationSignature: authorization,
        });
      },
    };
  }

  /**
   * Fetches Vault V2 BluePublicAllocator state for this target market.
   *
   * Reads the target Morpho Blue market, each Vault V2 accrual tree, and each
   * vault's BluePublicAllocator permissions and allocation caps at one block.
   * The snapshot keeps the fetched block's timestamp as its default planning time.
   * It always records Blue's loan-token balance in `blueBalances` at that
   * block, so balance-based rejection applies to plans from this fetcher.
   * Sizing has zero margin over that snapshot balance; activity on other Blue
   * markets with the same loan token can make a plan revert. Refetch close to
   * submission; there is no balance-buffer option.
   * Hand-built data without a balance uses summed snapshot-market liquidity
   * only to size plans and may add about the penalty in extra paid assets.
   *
   * @param params.vaultAddresses - Vault V2 addresses to inspect for market or idle liquidity.
   * @param params.block.number - Block number used for every RPC read.
   * @param params.block.timestamp - Timestamp of the fetched block. Stored on the snapshot and used as the
   *   planning timestamp when `options.timestamp` is omitted, never earlier than the latest market/vault
   *   `lastUpdate`. An explicit `options.timestamp` is used as given.
   * @returns A `VaultV2BlueReallocationData` snapshot ready for {@link getVaultV2BlueReallocations}.
   * @throws {ChainIdMismatchError} when the client declares another chain or its RPC reports another
   *   chain via `eth_chainId`.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when the chain has no BluePublicAllocator deployment.
   * @throws {UnknownBlueFactory} when the chain has no Vault V2 factory.
   * @throws {UnknownBlueOfFactory} when a requested address is not a Vault V2 from that factory.
   * @throws {UnsupportedBlueVaultV2AdapterError} when a vault contains an unsupported adapter.
   * @throws {UnknownTokenError} when a vault's share token has unusable decimals.
   * @throws {MalformedTokenMetadataError} when the share token's `eip712Domain()` or
   *   `bytes32` `name`/`symbol` retry returns non-empty data that does not decode, or when the
   *   deployless query reports malformed `name()`/`symbol()`/`eip712Domain()` returndata (no fallback).
   * @throws {viem.BaseError} when the `eth_chainId` request fails or a later RPC or contract read
   *   fails with no fallback left.
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
    // Confirm the RPC chain before prerequisite reads.
    await createChainCheck(this.client.viemClient, this.chainId)();

    const client = this.client.viemClient;
    const fetchParams = {
      blockNumber: block.number,
      chainId: this.chainId,
      deployless: this.client.options.supportDeployless,
    };
    const [targetMarket, vaultEntries, blueBalance] = await Promise.all([
      fetchMarket(this.parsedMarket.id, client, fetchParams),
      Promise.all(
        vaultAddresses.map(async (address) => {
          const vault = await fetchAccrualVaultV2(address, client, fetchParams);
          const publicAllocatorData = await fetchVaultV2BluePublicAllocatorData(
            vault,
            client,
            {
              ...fetchParams,
              targetMarketParams: new MarketParams(this.parsedMarket),
            },
          );
          return { publicAllocatorData, vault };
        }),
      ),
      readContract(client, {
        address: this.parsedMarket.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [getChainAddresses(this.chainId).blue],
        blockNumber: block.number,
      }),
    ]);

    return new VaultV2BlueReallocationData({
      chainId: this.chainId,
      timestamp: block.timestamp,
      blueBalances: { [this.parsedMarket.loanToken]: blueBalance },
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
   * Computes Vault V2 BluePublicAllocator reallocations for this market.
   * Market/vault state and returned post-state stay at `options.timestamp`;
   * only target-market cap checks reserve interest on the vault's existing
   * allocation through `timestamp + capAccrualBuffer` (two hours by default;
   * `0n` disables it). For market-source reallocations the source position's
   * interest is also reserved on cap ids shared with the target, and reserves
   * persist across every leg of a plan. Operation plans keep
   * `allocatorCapHeadroom` (1% of the cap by default) free under each target
   * BluePublicAllocator cap unless the operation shortfall needs it.
   * With an explicit `blueBalances` value, plans are rejected when Blue cannot
   * fund the penalty flash loan, an earlier market-sourced withdrawal, or the
   * final transfer. A missing balance uses summed snapshot-market liquidity
   * only to size plans and may make them larger; it cannot cause a balance-based
   * rejection.
   * For `refinance`, compute the plan on the destination-market handle (for
   * example, `client.morpho.blue(destination.marketParams, chainId)`), not the
   * source-market handle. Pass the source position's `borrowAssets` accrued to
   * the resolved plan expiry (or the required action deadline for entity
   * `refinance`) as `operation.amount`. With
   * `minTs = max(now, source.lastUpdate, destination.lastUpdate)`, the horizon is
   * `max(minTs, resolved expiry)`. For `prepareBlueRefinance`, omitted `expiresAt`
   * resolves to `now + 2h`, not `minTs + 2h`. Only when the resolved expiry exceeds
   * `minTs + 365 days`, use `minTs + 2h` for unlimited-deadline sentinel
   * compatibility. The optional `operation.referralFeePct` is WAD-scaled.
   * The planner includes the referral fee and its own planned allocator-leg
   * penalties in destination debt. Refinance never uses vaults with a 100%
   * penalty. When executing the returned reallocations, pass the same explicit
   * maxPenalty to borrow, supplyCollateralBorrow, withdraw, or refinance.
   *
   * @param params.reallocationData - State returned by {@link getVaultV2BlueReallocationData}.
   * @param params.options - Optional allocator discovery controls and operation to support.
   * @returns Action-ready reallocations and their post-simulation state.
   * @throws {InvalidBigIntInputError} when options.maxPenalty is supplied but is not a bigint.
   * @throws {ChainIdMismatchError} when `reallocationData` belongs to another chain.
   * @throws {UnsupportedBlueMarketIrmError} when a market with positive debt uses an unsupported IRM.
   * @throws {NegativeInputError} when the cap-accrual buffer, allocator cap headroom, utilization, penalty limit, or referral-fee percentage is negative.
   * @throws {InputExceedsMaxError} when the allocator cap headroom, a utilization, or a penalty limit exceeds WAD, or a selected borrow/withdraw plan otherwise covers its shortfall but its planned penalty exceeds the operation amount.
   * @throws {ReferralFeePctExceededError} when the referral-fee percentage is at least WAD.
   * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
   * @throws {NonPositiveInputError} when an enabled operation amount is not positive.
   * @throws {UnknownReallocationMarketError} when a required market is absent.
   * @throws {UnknownReallocationVaultError} when configured vault state is absent.
   * @throws {UnknownReallocationPublicAllocatorConfigError} when allocator authorization state is absent.
   * @throws {UnknownReallocationActiveAdaptersError} when active-adapter state is absent.
   * @throws {UnknownReallocationMarketPublicAllocatorConfigError} when an adapter-market allocator configuration is absent.
   * @throws {UnknownReallocationAllocationError} when required allocation state is absent.
   * @throws {ReallocationAdapterSupplySharesUnderflowError} when an inconsistent adapter snapshot underflows during the final transition.
   * @throws {ReallocationAllocationUnderflowError} when an inconsistent allocation snapshot underflows during the final transition.
   * @throws {InsufficientSharedLiquidityError} when selected liquidity cannot cover the operation shortfall or refinance penalties, or an explicit Blue balance cannot fund a required transfer.
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
    // Reject cross-chain inputs before continuing.
    validateChainId(reallocationData.chainId, this.chainId);

    return reallocationData.computeVaultV2BlueReallocations(
      this.parsedMarket.id,
      options,
    );
  }
}
