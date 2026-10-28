import { type MarketId, MathLib, UnknownDataError } from "@morpho-org/blue-sdk";
import { Payload } from "@morpho-org/midnight-sdk";
import type { AddressLabel } from "@morpho-org/morpho-ts";
import type { Address, BaseError, Hash, Hex } from "viem";
import { MIDNIGHT_MAX_REFERRAL_FEE_PCT } from "../helpers/constant.js";

/**
 * Thrown when a morpho-sdk input that must be non-negative is negative.
 *
 * @example
 * ```ts
 * import { NegativeInputError } from "@morpho-org/morpho-sdk";
 *
 * const error = new NegativeInputError("amount", -1n);
 * if (error instanceof NegativeInputError) {
 *   console.error(error.field, error.value);
 * }
 * ```
 */
export class NegativeInputError extends Error {
  /**
   * @param field - Public input field whose value is invalid.
   * @param value - Negative bigint supplied for the field.
   */
  public constructor(
    public readonly field: string,
    public readonly value: bigint,
  ) {
    super(`Input "${field}" must be non-negative, got "${value}".`);
    this.name = "NegativeInputError";
  }
}

/**
 * Thrown when a morpho-sdk input that must be positive is zero or negative.
 *
 * @example
 * ```ts
 * import { NonPositiveInputError } from "@morpho-org/morpho-sdk";
 *
 * const error = new NonPositiveInputError("shares", 0n);
 * if (error instanceof NonPositiveInputError) {
 *   console.error(error.field, error.value);
 * }
 * ```
 */
export class NonPositiveInputError extends Error {
  /**
   * @param field - Public input field whose value is invalid.
   * @param value - Zero or negative bigint supplied for the field.
   */
  public constructor(
    public readonly field: string,
    public readonly value: bigint,
  ) {
    super(`Input "${field}" must be positive, got "${value}".`);
    this.name = "NonPositiveInputError";
  }
}

/** Thrown when an integer input exceeds its protocol-defined maximum. */
export class InputExceedsMaxError extends Error {
  /**
   * @param params - Maximum-bound validation details.
   * @param params.field - Public input field whose value is invalid.
   * @param params.value - Supplied value.
   * @param params.max - Largest accepted value.
   */
  public constructor(params: {
    readonly field: string;
    readonly value: bigint;
    readonly max: bigint;
  }) {
    super(
      `Input "${params.field}" must be at most "${params.max}", got "${params.value}".`,
    );
    this.field = params.field;
    this.value = params.value;
    this.max = params.max;
    this.name = "InputExceedsMaxError";
  }

  /** Public input field whose value is invalid. */
  public readonly field: string;
  /** Supplied value. */
  public readonly value: bigint;
  /** Largest accepted value. */
  public readonly max: bigint;
}

/** Thrown when an in-kind redemption does not include any Morpho Blue market parameters. */
export class EmptyMarketParamsListError extends Error {
  public constructor() {
    super(
      "Market parameters list cannot be empty. Include enough ordered vault markets to cover the in-kind redemption.",
    );
    this.name = "EmptyMarketParamsListError";
  }
}

/** Thrown when an SDK operation deadline has already passed. */
export class ExpiredDeadlineError extends Error {
  /**
   * @param deadline - Expired deadline supplied by the caller.
   * @param timestamp - Current timestamp used for validation.
   */
  public constructor(
    public readonly deadline: bigint,
    public readonly timestamp: bigint,
  ) {
    super(
      `Deadline "${deadline}" has expired at timestamp "${timestamp}". Choose a future deadline and rebuild the operation.`,
    );
    this.name = "ExpiredDeadlineError";
  }
}

/**
 * Thrown when a VaultExitBundlesV1 Vault V2 exit targets a vault without exactly one adapter.
 *
 * Both `vaultExitBundlesV1InKindRedemptionVaultV2` and
 * `vaultExitBundlesV1ForceWithdrawVaultV2` require `adaptersLength() == 1`.
 *
 * @example
 * ```ts
 * import { VaultV2SingleAdapterRequiredError } from "@morpho-org/morpho-sdk";
 *
 * const error = new VaultV2SingleAdapterRequiredError(vault, 2);
 * if (error instanceof VaultV2SingleAdapterRequiredError) {
 *   console.error(error.vault, error.adapters);
 * }
 * ```
 */
export class VaultV2SingleAdapterRequiredError extends Error {
  /**
   * @param vault - Vault V2 address.
   * @param adapters - Number of adapters in the supplied vault snapshot.
   */
  public constructor(
    public readonly vault: Address,
    public readonly adapters: number,
  ) {
    super(
      `Vault "${vault}" has "${adapters}" adapters. VaultExitBundlesV1 exits require exactly one MorphoMarketV1AdapterV2.`,
    );
    this.name = "VaultV2SingleAdapterRequiredError";
  }
}

/** Thrown when a requested in-kind redemption adapter is not part of the Vault V2 snapshot. */
export class AdapterNotPartOfVaultError extends Error {
  /**
   * @param vault - Vault V2 address.
   * @param adapter - Adapter rejected by the vault snapshot.
   */
  public constructor(
    public readonly vault: Address,
    public readonly adapter: Address,
  ) {
    super(
      `Adapter "${adapter}" is not part of vault "${vault}". Use the vault's sole configured adapter.`,
    );
    this.name = "AdapterNotPartOfVaultError";
  }
}

/**
 * Thrown when the Vault V2 adapter cannot expose MorphoMarketV1AdapterV2 market shares.
 *
 * VaultExitBundlesV1 casts the adapter to `IMorphoMarketV1AdapterV2`, so a legacy
 * positions-based `MorphoMarketV1Adapter` or a `MorphoVaultV1Adapter` cannot be exited.
 *
 * @example
 * ```ts
 * import { VaultV2UnsupportedExitAdapterError } from "@morpho-org/morpho-sdk";
 *
 * const error = new VaultV2UnsupportedExitAdapterError(adapter);
 * if (error instanceof VaultV2UnsupportedExitAdapterError) {
 *   console.error(error.adapter);
 * }
 * ```
 */
export class VaultV2UnsupportedExitAdapterError extends Error {
  /**
   * @param adapter - Unsupported Vault V2 adapter address.
   */
  public constructor(public readonly adapter: Address) {
    super(
      `Adapter "${adapter}" does not support Vault V2 exits through VaultExitBundlesV1. Use a MorphoMarketV1AdapterV2-backed vault.`,
    );
    this.name = "VaultV2UnsupportedExitAdapterError";
  }
}

/**
 * Thrown when a Vault V2 exit cannot resolve the vault's configured liquidity adapter.
 *
 * `VaultExitBundlesV1.vaultExitBundlesV1ForceWithdrawVaultV2` casts `liquidityAdapter` to
 * `IMorphoMarketV1AdapterV2` and ABI-decodes `liquidityData` as `MarketParams`. Because the exit
 * also requires `adaptersLength() == 1`, the only resolvable configurations are an unset
 * liquidity adapter or the vault's sole adapter.
 *
 * @example
 * ```ts
 * import { VaultV2UnsupportedLiquidityAdapterError } from "@morpho-org/morpho-sdk";
 *
 * const error = new VaultV2UnsupportedLiquidityAdapterError({
 *   vault,
 *   liquidityAdapter,
 *   adapter,
 * });
 * if (error instanceof VaultV2UnsupportedLiquidityAdapterError) {
 *   console.error(error.liquidityAdapter, error.adapter);
 * }
 * ```
 */
export class VaultV2UnsupportedLiquidityAdapterError extends Error {
  /** Vault V2 address. */
  public readonly vault: Address;
  /** Liquidity adapter configured on the vault. */
  public readonly liquidityAdapter: Address;
  /** Sole adapter the exit targets. */
  public readonly adapter: Address;

  /**
   * @param params - Liquidity-adapter mismatch details.
   * @param params.vault - Vault V2 address.
   * @param params.liquidityAdapter - Liquidity adapter configured on the vault.
   * @param params.adapter - Sole adapter the exit targets.
   */
  public constructor(params: {
    readonly vault: Address;
    readonly liquidityAdapter: Address;
    readonly adapter: Address;
  }) {
    super(
      `Vault "${params.vault}" routes liquidity through "${params.liquidityAdapter}", which is neither unset nor its sole adapter "${params.adapter}". Use another exit path until the vault routes liquidity through its sole MorphoMarketV1AdapterV2.`,
    );
    this.vault = params.vault;
    this.liquidityAdapter = params.liquidityAdapter;
    this.adapter = params.adapter;
    this.name = "VaultV2UnsupportedLiquidityAdapterError";
  }
}

/**
 * Thrown when a Vault V2 exit cannot ABI-decode the vault's `liquidityData` as `MarketParams`.
 *
 * Distinct from {@link VaultV2UnsupportedLiquidityAdapterError}: the liquidity adapter *is* the
 * vault's sole adapter, but the market params stored alongside it are unusable, so the contract's
 * `abi.decode` would revert. Only the vault curator can repair this by re-setting the liquidity
 * adapter and data.
 *
 * @example
 * ```ts
 * import { VaultV2UndecodableLiquidityDataError } from "@morpho-org/morpho-sdk";
 *
 * try {
 *   vault.forceWithdraw({ exitAssets: 1_000_000n, vaultData, userAddress });
 * } catch (error) {
 *   if (error instanceof VaultV2UndecodableLiquidityDataError) {
 *     console.error(error.liquidityData, error.cause);
 *   }
 * }
 * ```
 */
export class VaultV2UndecodableLiquidityDataError extends Error {
  /** Vault V2 address. */
  public readonly vault: Address;
  /** Liquidity adapter configured on the vault. */
  public readonly liquidityAdapter: Address;
  /** Raw `liquidityData` that failed to decode. */
  public readonly liquidityData: Hex;

  /**
   * @param params - Undecodable liquidity-data details.
   * @param params.vault - Vault V2 address.
   * @param params.liquidityAdapter - Liquidity adapter configured on the vault.
   * @param params.liquidityData - Raw `liquidityData` that failed to decode.
   * @param params.cause - Underlying decode failure.
   */
  public constructor(params: {
    readonly vault: Address;
    readonly liquidityAdapter: Address;
    readonly liquidityData: Hex;
    readonly cause?: unknown;
  }) {
    super(
      `Vault "${params.vault}" stores liquidity data "${params.liquidityData}" for adapter "${params.liquidityAdapter}" that does not decode as MarketParams. Use another exit path until the vault curator re-sets its liquidity adapter and data.`,
      { cause: params.cause },
    );
    this.vault = params.vault;
    this.liquidityAdapter = params.liquidityAdapter;
    this.liquidityData = params.liquidityData;
    this.name = "VaultV2UndecodableLiquidityDataError";
  }
}

/**
 * Thrown when the adapter's markets cannot cover a Vault V2 force withdrawal.
 *
 * `vaultExitBundlesV1ForceWithdrawVaultV2` loops over the adapter's market list without a bound,
 * so an under-covered request reverts on-chain with a raw `panic 0x32`. This error surfaces that
 * failure before submission.
 *
 * @example
 * ```ts
 * import { VaultV2ForceWithdrawCoverageError } from "@morpho-org/morpho-sdk";
 *
 * const error = new VaultV2ForceWithdrawCoverageError({
 *   required: 100n,
 *   covered: 40n,
 *   maxExitAssets: 60n,
 * });
 * if (error instanceof VaultV2ForceWithdrawCoverageError) {
 *   console.error(error.maxExitAssets);
 * }
 * ```
 */
export class VaultV2ForceWithdrawCoverageError extends Error {
  /** Assets that must be force-deallocated from the adapter's markets. */
  public readonly required: bigint;
  /** Assets the adapter's markets can actually release. */
  public readonly covered: bigint;
  /** Largest penalty-inclusive `exitAssets` the current vault state supports. */
  public readonly maxExitAssets: bigint;

  /**
   * @param params - Coverage values used to explain the rejected exit.
   * @param params.required - Assets that must be force-deallocated.
   * @param params.covered - Assets the adapter's markets can release.
   * @param params.maxExitAssets - Largest supported penalty-inclusive `exitAssets`.
   */
  public constructor(params: {
    readonly required: bigint;
    readonly covered: bigint;
    readonly maxExitAssets: bigint;
  }) {
    super(
      `Force withdrawal requires "${params.required}" force-deallocated assets but the adapter's markets only release "${params.covered}". Reduce exitAssets to at most "${params.maxExitAssets}" or wait for market liquidity.`,
    );
    this.required = params.required;
    this.covered = params.covered;
    this.maxExitAssets = params.maxExitAssets;
    this.name = "VaultV2ForceWithdrawCoverageError";
  }
}

/**
 * Thrown when a Vault V2 force withdrawal would withdraw nothing while still consuming its permit.
 *
 * Happens on a dust `exitAssets` when the vault has no penalty-free liquidity and the
 * penalty-adjusted remainder rounds down to zero.
 *
 * @example
 * ```ts
 * import { VaultV2ForceWithdrawZeroWithdrawalError } from "@morpho-org/morpho-sdk";
 *
 * const error = new VaultV2ForceWithdrawZeroWithdrawalError({
 *   vault,
 *   exitAssets: 1n,
 *   penalty: 20_000000000000000n,
 * });
 * if (error instanceof VaultV2ForceWithdrawZeroWithdrawalError) {
 *   console.error(error.exitAssets, error.penalty);
 * }
 * ```
 */
export class VaultV2ForceWithdrawZeroWithdrawalError extends Error {
  /** Vault V2 address. */
  public readonly vault: Address;
  /** Positive penalty-inclusive amount requested by the caller. */
  public readonly exitAssets: bigint;
  /** WAD-scaled force-deallocation penalty applied by the adapter. */
  public readonly penalty: bigint;

  /**
   * @param params - Values that caused the exit to withdraw nothing.
   * @param params.vault - Vault V2 address.
   * @param params.exitAssets - Positive penalty-inclusive amount requested by the caller.
   * @param params.penalty - WAD-scaled force-deallocation penalty applied by the adapter.
   */
  public constructor(params: {
    readonly vault: Address;
    readonly exitAssets: bigint;
    readonly penalty: bigint;
  }) {
    super(
      `Vault "${params.vault}" has no penalty-free liquidity, and force-withdraw exitAssets "${params.exitAssets}" rounds to zero withdrawn assets after applying penalty "${params.penalty}". Increase exitAssets or use another exit path.`,
    );
    this.vault = params.vault;
    this.exitAssets = params.exitAssets;
    this.penalty = params.penalty;
    this.name = "VaultV2ForceWithdrawZeroWithdrawalError";
  }
}

/**
 * Thrown when a Vault V2 force withdrawal's derived share-price floor rounds down to zero.
 *
 * VaultExitBundlesV1 reads `minSharePriceE27 == 0` as "no bound at all", so emitting a rounded-down
 * zero would silently ship an exit with none of the slippage protection this path exists to add.
 * Reaching it means the exit burns more shares than `withdrawnAssets` can price at RAY scale — a
 * vault whose share price has collapsed below `1e-27` assets per share, or a dust exit against one.
 *
 * @example
 * ```ts
 * import { VaultV2ForceWithdrawZeroSharePriceError } from "@morpho-org/morpho-sdk";
 *
 * try {
 *   vault.forceWithdraw({ exitAssets, vaultData, userAddress });
 * } catch (error) {
 *   if (error instanceof VaultV2ForceWithdrawZeroSharePriceError) {
 *     console.error(error.withdrawnAssets, error.sharesBurnt);
 *   }
 * }
 * ```
 */
export class VaultV2ForceWithdrawZeroSharePriceError extends Error {
  /** Assets the exit withdraws in total, before the referral fee. */
  public readonly withdrawnAssets: bigint;
  /** Upper bound of the vault shares the exit burns. */
  public readonly sharesBurnt: bigint;
  /** WAD-scaled slippage tolerance applied to the floor. */
  public readonly slippageTolerance: bigint;

  /**
   * @param params - Values whose ratio rounded down to a zero share-price floor.
   * @param params.withdrawnAssets - Assets the exit withdraws in total, before the referral fee.
   * @param params.sharesBurnt - Upper bound of the vault shares the exit burns.
   * @param params.slippageTolerance - WAD-scaled slippage tolerance applied to the floor.
   */
  public constructor(params: {
    readonly withdrawnAssets: bigint;
    readonly sharesBurnt: bigint;
    readonly slippageTolerance: bigint;
  }) {
    super(
      `Force-withdraw share-price floor rounds to zero: withdrawnAssets "${params.withdrawnAssets}" over sharesBurnt "${params.sharesBurnt}" at slippageTolerance "${params.slippageTolerance}". The contract reads a zero floor as no bound at all, so this exit cannot be built safely — increase exitAssets or use another exit path.`,
    );
    this.withdrawnAssets = params.withdrawnAssets;
    this.sharesBurnt = params.sharesBurnt;
    this.slippageTolerance = params.slippageTolerance;
    this.name = "VaultV2ForceWithdrawZeroSharePriceError";
  }
}

/**
 * Thrown when a supplied force-withdraw share-price floor is below the SDK safety floor.
 *
 * An override below the floor derived at `MAX_SLIPPAGE_TOLERANCE` would weaken the on-chain
 * share-price protection and let the required share allowance grow without bound, so the entity
 * rejects it instead of encoding it.
 *
 * @example
 * ```ts
 * import { VaultV2ForceWithdrawSharePriceBelowFloorError } from "@morpho-org/morpho-sdk";
 *
 * try {
 *   vault.forceWithdraw({ exitAssets, vaultData, userAddress, minSharePriceE27 });
 * } catch (error) {
 *   if (error instanceof VaultV2ForceWithdrawSharePriceBelowFloorError) {
 *     console.error(error.minSharePriceE27, error.floorE27);
 *   }
 * }
 * ```
 */
export class VaultV2ForceWithdrawSharePriceBelowFloorError extends Error {
  /** Supplied force-withdraw share-price floor. */
  public readonly minSharePriceE27: bigint;
  /** Minimum share-price floor allowed at maximum SDK slippage tolerance. */
  public readonly floorE27: bigint;

  /**
   * @param params - Supplied and minimum allowed share-price floors.
   * @param params.minSharePriceE27 - Supplied force-withdraw share-price floor.
   * @param params.floorE27 - Minimum floor derived at maximum SDK slippage tolerance.
   */
  public constructor(params: {
    readonly minSharePriceE27: bigint;
    readonly floorE27: bigint;
  }) {
    super(
      `Force-withdraw share price floor "${params.minSharePriceE27}" is below the minimum allowed "${params.floorE27}" (max slippage tolerance). Raise minSharePriceE27 or use slippageTolerance.`,
    );
    this.minSharePriceE27 = params.minSharePriceE27;
    this.floorE27 = params.floorE27;
    this.name = "VaultV2ForceWithdrawSharePriceBelowFloorError";
  }
}

/**
 * Thrown when fee shares projected to the accepted deadline reach the lower force-withdraw
 * burn bound at that time.
 *
 * VaultExitBundlesV1 measures shares burned after its first withdrawal accrues fees. If the
 * recipient's fee shares are at least the measured burn bound, its share-price check is skipped or
 * reverts due to an underflow.
 *
 * @example
 * ```ts
 * import { VaultV2ForceWithdrawFeeSharesExceedBurnError } from "@morpho-org/morpho-sdk";
 *
 * try {
 *   vault.forceWithdraw({ exitAssets, vaultData, userAddress });
 * } catch (error) {
 *   if (error instanceof VaultV2ForceWithdrawFeeSharesExceedBurnError) {
 *     console.error(error.sharesBurnt, error.feeShares);
 *   }
 * }
 * ```
 */
export class VaultV2ForceWithdrawFeeSharesExceedBurnError extends Error {
  /** Vault V2 address being exited. */
  public readonly vault: Address;
  /** Fee-recipient account submitting the exit. */
  public readonly userAddress: Address;
  /** Lower bound of shares measured as burned by VaultExitBundlesV1. */
  public readonly sharesBurnt: bigint;
  /** Fee shares projected for `userAddress` at the accepted deadline. */
  public readonly feeShares: bigint;

  /**
   * @param params - Fee-share and burn-bound values that make the exit unsafe.
   * @param params.vault - Vault V2 address being exited.
   * @param params.userAddress - Fee-recipient account submitting the exit.
   * @param params.sharesBurnt - Lower bound of shares measured as burned by VaultExitBundlesV1.
   * @param params.feeShares - Fee shares projected for `userAddress` at the accepted deadline.
   */
  public constructor(params: {
    readonly vault: Address;
    readonly userAddress: Address;
    readonly sharesBurnt: bigint;
    readonly feeShares: bigint;
  }) {
    super(
      `Vault V2 "${params.vault}" fee-recipient account "${params.userAddress}" accrues "${params.feeShares}" fee shares, reaching the lower force-withdraw share-burn bound "${params.sharesBurnt}". VaultExitBundlesV1's share-price check would be skipped or revert. Increase exitAssets or let the vault accrue first.`,
    );
    this.vault = params.vault;
    this.userAddress = params.userAddress;
    this.sharesBurnt = params.sharesBurnt;
    this.feeShares = params.feeShares;
    this.name = "VaultV2ForceWithdrawFeeSharesExceedBurnError";
  }
}

/** Thrown when a Vault V2 in-kind redemption rounds to no deallocated assets. */
export class InKindRedeemZeroDeallocationError extends Error {
  /**
   * @param params - Values that caused the exit to round to zero deallocated assets.
   * @param params.vault - Vault V2 address with no idle assets available for the exit.
   * @param params.amount - Positive penalty-inclusive amount requested by the caller.
   * @param params.penalty - WAD-scaled force-deallocation penalty applied by the adapter.
   */
  public readonly vault: Address;
  public readonly amount: bigint;
  public readonly penalty: bigint;

  public constructor(params: {
    readonly vault: Address;
    readonly amount: bigint;
    readonly penalty: bigint;
  }) {
    super(
      `Vault "${params.vault}" has no idle assets, and in-kind redemption amount "${params.amount}" rounds to zero deallocated assets after applying penalty "${params.penalty}". Increase the amount or use another exit path.`,
    );
    this.vault = params.vault;
    this.amount = params.amount;
    this.penalty = params.penalty;
    this.name = "InKindRedeemZeroDeallocationError";
  }
}

/** Thrown when the ordered market list cannot cover the requested in-kind redemption. */
export class InKindRedeemCoverageError extends Error {
  /**
   * @param params - Coverage values used to explain the rejected exit.
   * @param params.required - Assets that must be deallocated from listed markets.
   * @param params.covered - Assets covered by the supplied market list.
   * @param params.maxExitAssets - Largest penalty-inclusive exit supported by the list.
   */
  public readonly required: bigint;
  public readonly covered: bigint;
  public readonly maxExitAssets: bigint;

  public constructor(params: {
    readonly required: bigint;
    readonly covered: bigint;
    readonly maxExitAssets: bigint;
  }) {
    super(
      `In-kind redemption requires "${params.required}" assets but the market list covers "${params.covered}". Reduce the amount to at most "${params.maxExitAssets}" or include more vault markets.`,
    );
    this.required = params.required;
    this.covered = params.covered;
    this.maxExitAssets = params.maxExitAssets;
    this.name = "InKindRedeemCoverageError";
  }
}

/** Thrown when Morpho Blue lacks the physical loan-token balance needed during an exit callback. */
export class InsufficientBlueBalanceForInKindRedeemError extends Error {
  /**
   * @param params - Morpho Blue balance values used to explain the rejected exit.
   * @param params.asset - Loan token required by the exit.
   * @param params.available - Current token balance held by Morpho Blue.
   * @param params.required - Peak token balance required by the exit.
   */
  public readonly asset: Address;
  public readonly available: bigint;
  public readonly required: bigint;

  public constructor(params: {
    readonly asset: Address;
    readonly available: bigint;
    readonly required: bigint;
  }) {
    super(
      `Morpho Blue holds "${params.available}" of asset "${params.asset}", but this in-kind redemption requires "${params.required}" during its callback. Reduce the amount or wait for Blue liquidity.`,
    );
    this.asset = params.asset;
    this.available = params.available;
    this.required = params.required;
    this.name = "InsufficientBlueBalanceForInKindRedeemError";
  }
}

/** Thrown when a MetaMorpho vault is connected to a different Morpho deployment. */
export class VaultMorphoMismatchError extends Error {
  /**
   * @param params - Vault and Morpho addresses used to explain the mismatch.
   * @param params.vault - MetaMorpho vault address.
   * @param params.expected - Morpho Blue address expected for the target chain.
   * @param params.actual - Morpho address returned by the vault.
   */
  public readonly vault: Address;
  public readonly expected: Address;
  public readonly actual: Address;

  public constructor(params: {
    readonly vault: Address;
    readonly expected: Address;
    readonly actual: Address;
  }) {
    super(
      `Vault "${params.vault}" uses Morpho "${params.actual}", expected "${params.expected}". Use vault data from the selected chain.`,
    );
    this.vault = params.vault;
    this.expected = params.expected;
    this.actual = params.actual;
    this.name = "VaultMorphoMismatchError";
  }
}

/** Thrown when a Vault V1 is Morpho Blue's fee recipient and cannot safely redeem in kind. */
export class VaultIsBlueFeeRecipientError extends Error {
  /**
   * @param vault - Unsupported Vault V1 address.
   * @param blue - Morpho Blue deployment whose fees accrue to the vault.
   */
  public constructor(
    public readonly vault: Address,
    public readonly blue: Address,
  ) {
    super(
      `Vault "${vault}" is Morpho Blue "${blue}"'s fee recipient. Use another exit path because VaultExitBundlesV1 cannot safely account for the vault's accrued fee shares.`,
    );
    this.name = "VaultIsBlueFeeRecipientError";
  }
}

/** Thrown when a vault-shares requirement cannot be safely encoded as a bundles permit. */
export class BundlesPermitMismatchError extends Error {
  /**
   * @param params - Permit mismatch values used to explain the rejection.
   * @param params.field - Permit field that does not match the exit.
   * @param params.expected - Value required by the exit. For `field: "amount"` on an
   *   operation that accepts a range of permit amounts, an inclusive `"[min, max]"` range.
   * @param params.actual - Value supplied by the signature.
   * @param params.cause - Original parser failure when signature decoding is wrapped.
   */
  public readonly field:
    | "type"
    | "asset"
    | "owner"
    | "spender"
    | "amount"
    | "nonce"
    | "deadline"
    | "signature";
  public readonly expected: string;
  public readonly actual: string;

  public constructor(params: {
    readonly field:
      | "type"
      | "asset"
      | "owner"
      | "spender"
      | "amount"
      | "nonce"
      | "deadline"
      | "signature";
    readonly expected: string;
    readonly actual: string;
    readonly cause?: unknown;
  }) {
    super(
      `Bundles permit ${params.field} mismatch: expected "${params.expected}", got "${params.actual}". Resolve and sign the requirements returned by this prepared operation.`,
      { cause: params.cause },
    );
    this.field = params.field;
    this.expected = params.expected;
    this.actual = params.actual;
    this.name = "BundlesPermitMismatchError";
  }
}

/** Thrown when a signed requirement cannot be safely encoded for a fixed bundles call. */
export class BundlesRequirementSignatureMismatchError extends Error {
  /** Field whose signed value or encoding is invalid for the fixed bundles call. */
  public readonly field:
    | "type"
    | "authorized"
    | "isAuthorized"
    | "nonce"
    | "deadline"
    | "signature";
  /** Value required by the fixed bundles call. */
  public readonly expected: string;
  /** Value supplied by the signed requirement. */
  public readonly actual: string;

  /**
   * @param params - Signature mismatch details.
   * @param params.field - Field rejected by the converter.
   * @param params.expected - Value required by the direct route.
   * @param params.actual - Value supplied by the requirement.
   * @param params.cause - Original signature parser failure, when applicable.
   */
  public constructor(params: {
    field:
      | "type"
      | "authorized"
      | "isAuthorized"
      | "nonce"
      | "deadline"
      | "signature";
    expected: string;
    actual: string;
    cause?: unknown;
  }) {
    super(
      `Bundles requirement ${params.field} mismatch: expected "${params.expected}", got "${params.actual}". Resolve and sign the requirements returned by this prepared operation.`,
      { cause: params.cause },
    );
    this.field = params.field;
    this.expected = params.expected;
    this.actual = params.actual;
    this.name = "BundlesRequirementSignatureMismatchError";
  }
}

/** Thrown when an explicit Permit2 SignatureTransfer unordered nonce is already consumed. */
export class Permit2SignatureTransferNonceAlreadyUsedError extends Error {
  /**
   * @param owner - Permit2 token owner whose nonce is unavailable.
   * @param nonce - Explicit unordered nonce that has already been consumed.
   */
  public constructor(
    public readonly owner: Address,
    public readonly nonce: bigint,
  ) {
    super(
      `Permit2 nonce "${nonce}" is already used for owner "${owner}". Generate a different uint256 permit2Nonce and resolve the requirements again.`,
    );
    this.name = "Permit2SignatureTransferNonceAlreadyUsedError";
  }
}

/** Thrown when no unused Permit2 unordered nonce exists at or after the requested start nonce. */
export class NoUnusedPermit2NonceError extends Error {
  /**
   * @param owner - Permit2 token owner scanned for a free nonce.
   * @param startNonce - Lowest nonce that was considered.
   */
  public constructor(
    public readonly owner: Address,
    public readonly startNonce: bigint,
  ) {
    super(
      `No unused Permit2 nonce found for owner "${owner}" at or after "${startNonce}". Pass a lower startNonce.`,
    );
    this.name = "NoUnusedPermit2NonceError";
  }
}

/** Thrown when native funding does not exactly match the contract's gross token pull. */
export class NativeFundingAmountMismatchError extends Error {
  /**
   * @param nativeAmount - Native value supplied with the transaction.
   * @param requiredAmount - Gross amount the BlueBundlesV1 entrypoint funds.
   */
  public constructor(
    public readonly nativeAmount: bigint,
    public readonly requiredAmount: bigint,
  ) {
    super(
      `Native funding must equal the full funded amount: expected "${requiredAmount}", got "${nativeAmount}". Use either native funding or ERC-20 funding, not both.`,
    );
    this.name = "NativeFundingAmountMismatchError";
  }
}

/** Thrown when a positive referral fee has no recipient. */
export class ReferralFeeRecipientMissingError extends Error {
  public constructor() {
    super(
      "A positive referralFeePct requires referralFeeRecipient. Provide the recipient or set referralFeePct to zero.",
    );
    this.name = "ReferralFeeRecipientMissingError";
  }
}

/**
 * Thrown when a referral fee percentage is outside the contract's `[0, WAD)` range.
 *
 * Extends {@link InputExceedsMaxError} — and reports the same `field`, `value`, and `max` the
 * generic bound error used to carry for this input — so integrators already pattern-matching
 * `InputExceedsMaxError` keep catching this failure.
 */
export class ReferralFeePctExceededError extends InputExceedsMaxError {
  /** @param referralFeePct - WAD-scaled referral fee percentage supplied by the caller. */
  public constructor(public readonly referralFeePct: bigint) {
    super({
      field: "referralFeePct",
      value: referralFeePct,
      max: MathLib.WAD - 1n,
    });
    this.message = `Referral fee percentage "${referralFeePct}" must be below WAD. Reduce referralFeePct or disable the referral fee.`;
    this.name = "ReferralFeePctExceededError";
  }
}

/**
 * Thrown when the SDK's 10% (`WAD / 10n`) Midnight referral-fee cap is exceeded;
 * the contract itself only requires `referralFeePct < WAD`.
 */
export class MidnightReferralFeePctExceededError extends InputExceedsMaxError {
  /**
   * @param referralFeePct - WAD-scaled referral fee percentage supplied by the caller.
   *   The SDK cap is 10% (`WAD / 10n`); the contract itself only requires
   *   `referralFeePct < WAD`.
   */
  public constructor(public readonly referralFeePct: bigint) {
    super({
      field: "referralFeePct",
      value: referralFeePct,
      max: MIDNIGHT_MAX_REFERRAL_FEE_PCT,
    });
    this.message = `Referral fee "${referralFeePct}" exceeds the SDK's 10% Midnight referral-fee cap "${MIDNIGHT_MAX_REFERRAL_FEE_PCT}". Reduce referralFeePct.`;
    this.name = "MidnightReferralFeePctExceededError";
  }
}

/** Thrown when a fixed bundles call mixes ERC-20 and native funding. */
export class MixedBundlesFundingError extends Error {
  public constructor() {
    super(
      "Bundles funding accepts either amount or nativeAmount, not both. Choose one funding source and rebuild the transaction.",
    );
    this.name = "MixedBundlesFundingError";
  }
}

/** Thrown when a vault migration specifies both assets and shares, or neither. */
export class AmountAndSharesExclusiveError extends Error {
  public constructor() {
    super(
      "Vault migration requires exactly one of assets or shares. Choose the desired withdrawal mode and rebuild the transaction.",
    );
    this.name = "AmountAndSharesExclusiveError";
  }
}

/** Thrown when a vault migration selects the same source and destination vault. */
export class SameVaultMigrationError extends Error {
  public constructor(public readonly vault: Address) {
    super(
      `Source and destination vault are both "${vault}". Select a different destination vault.`,
    );
    this.name = "SameVaultMigrationError";
  }
}

/** Thrown when a BlueBundlesV1 reallocation source uses another loan token. */
export class ReallocationLoanTokenMismatchError extends Error {
  /**
   * @param expected - Loan token of the operation's target market.
   * @param actual - Loan token found in the reallocation source market.
   */
  public constructor(
    public readonly expected: Address,
    public readonly actual: Address,
  ) {
    super(
      `Reallocation source loan token "${actual}" does not match target loan token "${expected}". Recompute reallocations for the target market.`,
    );
    this.name = "ReallocationLoanTokenMismatchError";
  }
}

/**
 * Thrown when a Blue authorization operator is not the chain's registered BlueBundlesV1 contract.
 */
export class UnsupportedAuthorizationOperatorError extends Error {
  /**
   * @param authorized - The operator address rejected as unsupported.
   * @param chainId - Chain whose registry was consulted for the supported operators.
   */
  public constructor(
    public readonly authorized: Address,
    public readonly chainId: number,
  ) {
    super(
      `Authorization operator "${authorized}" is not supported on chain ${chainId}. Pass the chain's registered BlueBundlesV1 address.`,
    );
    this.name = "UnsupportedAuthorizationOperatorError";
  }
}

/** Thrown when reallocations are attached to a combined call with no borrow leg. */
export class ReallocationsRequireBorrowError extends Error {
  public constructor() {
    super(
      "BlueBundlesV1 reallocations require a positive borrowAssets value. Remove the reallocations or add a borrow leg.",
    );
    this.name = "ReallocationsRequireBorrowError";
  }
}

/** Thrown when repay funding cannot cover the requested assets and referral fee. */
export class MaxRepayAssetsBelowRepayAssetsError extends Error {
  /**
   * @param maxRepayAssets - Maximum loan-token funding supplied to the bundle.
   * @param repayAssets - Minimum funding required for the repayment and referral fee.
   */
  public constructor(
    public readonly maxRepayAssets: bigint,
    public readonly repayAssets: bigint,
  ) {
    super(
      `maxRepayAssets "${maxRepayAssets}" cannot cover required repay funding "${repayAssets}". Increase maxRepayAssets to include the repayment and referral fee.`,
    );
    this.name = "MaxRepayAssetsBelowRepayAssetsError";
  }
}

/** Requirement signature kind accepted by action-output transaction builders. */
export type RequirementSignatureKind =
  | "permit"
  | "permit2SignatureTransfer"
  | "authorization";

/**
 * Thrown when `buildTx` receives more than one requirement signature of the same kind.
 *
 * A bundled path consumes at most one signature per accepted kind; passing several of the same
 * kind is ambiguous and would silently drop all but the first, so it is rejected instead.
 *
 * @example
 * ```ts
 * import { AmbiguousRequirementSignaturesError } from "@morpho-org/morpho-sdk";
 *
 * if (error instanceof AmbiguousRequirementSignaturesError) {
 *   // Pass a single signature per accepted kind to buildTx.
 * }
 * ```
 */
export class AmbiguousRequirementSignaturesError extends Error {
  /**
   * @param kind - The over-supplied signature kind.
   * @param count - How many signatures of that kind were received.
   */
  constructor(kind: RequirementSignatureKind, count: number) {
    super(
      `Expected at most one ${kind} signature but received ${count}. Pass a single ${kind} signature to buildTx.`,
    );
    this.name = "AmbiguousRequirementSignaturesError";
  }
}

/**
 * Thrown when `buildTx` receives a requirement signature of a kind the operation does not consume.
 * Surfacing it prevents a signed requirement from being silently ignored.
 *
 * @example
 * ```ts
 * import { UnexpectedRequirementSignatureError } from "@morpho-org/morpho-sdk";
 *
 * if (error instanceof UnexpectedRequirementSignatureError) {
 *   // Remove the signature this operation does not use from the buildTx array.
 * }
 * ```
 */
export class UnexpectedRequirementSignatureError extends Error {
  /**
   * @param kind - The unexpected signature kind.
   */
  constructor(kind: RequirementSignatureKind) {
    super(
      `Received a ${kind} signature that this operation does not consume. Remove it from the buildTx signatures array.`,
    );
    this.name = "UnexpectedRequirementSignatureError";
  }
}

/** Thrown when `buildTx` receives a requirement signature whose action type is not supported. */
export class UnsupportedRequirementSignatureError extends Error {
  /**
   * @param type - The unsupported signature action type.
   */
  constructor(public readonly type: string) {
    super(
      `Received a requirement signature with unsupported action type "${type}". Re-run getRequirements() and sign the current requirements.`,
    );
    this.name = "UnsupportedRequirementSignatureError";
  }
}

/** Thrown when a viem client's account address does not match the address required by the call. */
export class AddressMismatchError extends Error {
  constructor(clientAddress: Address, argsAddress: Address) {
    super(
      `Address mismatch between client: ${clientAddress} and args: ${argsAddress}`,
    );
    this.name = "AddressMismatchError";
  }
}

/** Thrown when a viem client's chain id does not match the chain id required by the call. */
export class ChainIdMismatchError extends Error {
  constructor(clientChainId: number | undefined, argsChainId: number) {
    super(
      `Chain ID mismatch between client: ${clientChainId} and args: ${argsChainId}`,
    );
    this.name = "ChainIdMismatchError";
  }
}

/** Thrown when a runtime crypto API is required but unavailable. */
export class CryptoUnavailableError extends Error {
  constructor(feature: string) {
    super(`Crypto API is required for ${feature} but is unavailable.`);
    this.name = "CryptoUnavailableError";
  }
}

/** Thrown when the viem client is missing a property the call requires (e.g. `account.address`). */
export class MissingClientPropertyError extends Error {
  constructor(property: string) {
    super(`A required ${property} is missing from the client.`);
    this.name = "MissingClientPropertyError";
  }
}

/** Thrown when a requirement encoder targets an unsupported spender. */
export class UnsupportedErc20ApprovalSpenderError extends Error {
  constructor(params: {
    readonly spender: Address;
    readonly chainId: number;
    readonly permit2?: Address;
    readonly midnight?: Address;
    readonly supportedSpenders?: readonly (Address | undefined)[];
  }) {
    const supported = (
      params.supportedSpenders ?? [params.permit2, params.midnight]
    )
      .filter((address) => address != null)
      .join('", "');
    super(
      `Requirement spender "${params.spender}" is not supported on chain "${params.chainId}". Use "${supported}".`,
    );
    this.name = "UnsupportedErc20ApprovalSpenderError";
  }
}

/** Thrown when a Midnight authorization target (a requirement operator, or the ratifier that `midnightCancelAndMake` activates and MidnightBundlesV2 authorizes) is not registered for the chain. */
export class UnsupportedMidnightAuthorizationTargetError extends Error {
  constructor(params: {
    readonly authorized: Address;
    readonly chainId: number;
    readonly supportedTargets: readonly Address[];
  }) {
    super(
      `Midnight authorization target "${params.authorized}" is not supported on chain "${params.chainId}". Use "${params.supportedTargets.join('", "')}".`,
    );
    this.name = "UnsupportedMidnightAuthorizationTargetError";
  }
}

/** Thrown when a Morpho accrual position required by a call is missing. */
export class MissingAccrualPositionError extends Error {
  constructor(market?: string) {
    super(
      market == null
        ? "Accrual position is missing. Fetch the position data and try again."
        : `Accrual position is missing for market: ${market}`,
    );
    this.name = "MissingAccrualPositionError";
  }
}

/** Thrown when a slippage tolerance exceeds `MAX_SLIPPAGE_TOLERANCE` (10%). */
export class ExcessiveSlippageToleranceError extends Error {
  constructor(slippageTolerance: bigint) {
    super(
      `Slippage tolerance ${slippageTolerance} exceeds maximum allowed (10%)`,
    );
    this.name = "ExcessiveSlippageToleranceError";
  }
}

/** Thrown when a VaultV2 force-withdraw or force-redeem call has no deallocations to perform. */
export class EmptyDeallocationsError extends Error {
  constructor(vault: Address) {
    super(`Deallocations list cannot be empty for vault: ${vault}`);
    this.name = "EmptyDeallocationsError";
  }
}

/** Thrown when a deposit's amount differs from the amount the supplied permit / permit2 signature was issued for. */
export class DepositAmountMismatchError extends Error {
  constructor(depositAmount: bigint, signatureAmount: bigint) {
    super(
      `Deposit amount "${depositAmount}" does not match requirement signature amount "${signatureAmount}"`,
    );
    this.name = "DepositAmountMismatchError";
  }
}

/** Thrown when a deposit's asset differs from the asset the supplied permit / permit2 signature was issued for. */
export class DepositAssetMismatchError extends Error {
  constructor(depositAsset: Address, signatureAsset: Address) {
    super(
      `Deposit asset "${depositAsset}" does not match requirement signature asset "${signatureAsset}"`,
    );
    this.name = "DepositAssetMismatchError";
  }
}

/** Thrown when a deposit's owner differs from the owner the supplied permit / permit2 signature was issued for. */
export class DepositOwnerMismatchError extends Error {
  constructor(depositOwner: Address, signatureOwner: Address) {
    super(
      `Deposit owner "${depositOwner}" does not match requirement signature owner "${signatureOwner}"`,
    );
    this.name = "DepositOwnerMismatchError";
  }
}

/** Thrown when a deposit's spender differs from the spender the supplied permit / permit2 signature was issued for. */
export class DepositSpenderMismatchError extends Error {
  constructor(depositSpender: Address, signatureSpender: Address) {
    super(
      `Deposit spender "${depositSpender}" does not match requirement signature spender "${signatureSpender}"`,
    );
    this.name = "DepositSpenderMismatchError";
  }
}

/** Thrown when a vault deposit uses `nativeAmount` but the vault asset is not the chain's wNative. */
export class NativeAmountOnNonWNativeVaultError extends Error {
  constructor(vaultAsset: Address, wNative: Address) {
    super(
      `Cannot use nativeAmount: vault asset ${vaultAsset} is not the wrapped native token ${wNative}`,
    );
    this.name = "NativeAmountOnNonWNativeVaultError";
  }
}

/** Thrown when a `nativeAmount` is supplied but the chain has no configured wNative address. */
export class ChainWNativeMissingError extends Error {
  constructor(chainId: number) {
    super(
      `Chain ${chainId} does not have a configured wrapped native token (wNative)`,
    );
    this.name = "ChainWNativeMissingError";
  }
}

/** Thrown when a vault entity's address does not match the vault address embedded in the call's args. */
export class VaultAddressMismatchError extends Error {
  constructor(vaultAddress: Address, argsVaultAddress: Address) {
    super(
      `Vault address mismatch between vault: ${vaultAddress} and args: ${argsVaultAddress}`,
    );
    this.name = "VaultAddressMismatchError";
  }
}

/** Thrown when an action uses `nativeAmount` but the target asset is not the chain's wNative. */
export class NativeAmountOnNonWNativeAssetError extends Error {
  constructor(asset: Address, wNative: Address) {
    super(
      `Cannot use nativeAmount: asset ${asset} is not the wrapped native token ${wNative}`,
    );
    this.name = "NativeAmountOnNonWNativeAssetError";
  }
}

/** Thrown when a borrow exceeds the LLTV-buffered safe maximum for the position. */
export class BorrowExceedsSafeLtvError extends Error {
  constructor(borrowAmount: bigint, maxSafeBorrow: bigint) {
    super(
      `Borrow amount ${borrowAmount} exceeds safe maximum ${maxSafeBorrow} (LLTV minus buffer). Reduce borrow or increase collateral.`,
    );
    this.name = "BorrowExceedsSafeLtvError";
  }
}

/** Thrown when the market's oracle price is unavailable and position health cannot be validated. */
export class MissingMarketPriceError extends Error {
  constructor(market: string) {
    super(
      `Oracle price unavailable for market ${market}. Cannot validate position health.`,
    );
    this.name = "MissingMarketPriceError";
  }
}

/** Thrown when a `MarketParams.id` does not match the expected market id derived from the other fields. */
export class MarketIdMismatchError extends Error {
  constructor(marketId: string, expectedMarketId: string) {
    super(
      `Market ${marketId} does not match expected market ${expectedMarketId}`,
    );
    this.name = "MarketIdMismatchError";
  }
}

/** Thrown when an accrual position belongs to a different user than the one expected by the call. */
export class AccrualPositionUserMismatchError extends Error {
  constructor(positionUser: string, expectedUser: string) {
    super(
      `Accrual position user ${positionUser} does not match expected user ${expectedUser}`,
    );
    this.name = "AccrualPositionUserMismatchError";
  }
}

/** Thrown when a Public Allocator source references the target Blue market. */
export class ReallocationWithdrawalOnTargetMarketError extends Error {
  constructor(vault: string, marketId: string) {
    super(
      `Reallocation withdrawal cannot include the target market ${marketId} for vault ${vault}.`,
    );
    this.name = "ReallocationWithdrawalOnTargetMarketError";
  }
}

/**
 * Thrown when a reallocation entry passed to a high-level Blue write is not a valid
 * {@link VaultV2BlueReallocation}: a non-object entry, or an entry carrying Vault V1
 * `withdrawals`/`fee` fields that high-level Blue writes no longer accept.
 *
 * @example
 * ```ts
 * import { InvalidVaultV2BlueReallocationShapeError } from "@morpho-org/morpho-sdk";
 *
 * const error = new InvalidVaultV2BlueReallocationShapeError();
 * ```
 */
export class InvalidVaultV2BlueReallocationShapeError extends Error {
  public constructor() {
    super(
      "Reallocation entry is not a valid Vault V2 reallocation. High-level Blue writes accept only VaultV2BlueReallocation entries (e.g. from getVaultV2BlueReallocations()). Use morpho-sdk v5 if Vault V1 reallocations are required.",
    );
    this.name = "InvalidVaultV2BlueReallocationShapeError";
  }
}

/**
 * Thrown when a Blue Public Allocator reallocation contains a malformed vault
 * or adapter address.
 *
 * @example
 * ```ts
 * import { InvalidReallocationAddressError } from "@morpho-org/morpho-sdk";
 *
 * const error = new InvalidReallocationAddressError("to.adapter");
 * if (error instanceof InvalidReallocationAddressError) {
 *   console.error(error.field);
 * }
 * ```
 */
export class InvalidReallocationAddressError extends Error {
  /**
   * @param field - Reallocation address field that is absent or malformed.
   */
  public constructor(
    public readonly field: "vault" | "from.adapter" | "to.adapter",
  ) {
    super(`Reallocation "${field}" must be a valid address.`);
    this.name = "InvalidReallocationAddressError";
  }
}

/**
 * Thrown when a Blue Public Allocator source is absent, incomplete, or has an
 * unknown discriminator.
 *
 * @example
 * ```ts
 * import { InvalidReallocationSourceTypeError } from "@morpho-org/morpho-sdk";
 *
 * const error = new InvalidReallocationSourceTypeError("marketTypo");
 * ```
 */
export class InvalidReallocationSourceTypeError extends Error {
  /**
   * @param sourceType - Invalid runtime value received for `reallocation.from.type`,
   *   or `undefined` when the source or discriminator is absent.
   * @param missingField - Required market-source field that is absent or malformed.
   */
  public constructor(
    public readonly sourceType: string | undefined,
    public readonly missingField?: "adapter" | "marketParams",
  ) {
    super(
      missingField == null
        ? sourceType === undefined
          ? 'Reallocation source must specify type "market" or "idle".'
          : `Reallocation source type must be "market" or "idle", got "${sourceType}".`
        : `Reallocation market source must include a valid "${missingField}".`,
    );
    this.name = "InvalidReallocationSourceTypeError";
  }
}

/**
 * Thrown when one bundle assigns different penalty rates to the same Vault V2.
 *
 * @example
 * ```ts
 * import { InconsistentReallocationPenaltyError } from "@morpho-org/morpho-sdk";
 * import type { Address } from "viem";
 *
 * const vaultFixture =
 *   "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" satisfies Address;
 * const error = new InconsistentReallocationPenaltyError({
 *   vault: vaultFixture,
 *   expected: 5n,
 *   actual: 11n,
 * });
 * ```
 */
export class InconsistentReallocationPenaltyError extends Error {
  /** Vault whose configured penalty must be reused. */
  public readonly vault: Address;
  /** Penalty rate established by the first matching bundle entry. */
  public readonly expected: bigint;
  /** Conflicting penalty rate supplied by a later bundle entry. */
  public readonly actual: bigint;

  /**
   * @param params - Conflicting vault penalty details.
   * @param params.vault - Vault whose configured penalty applies.
   * @param params.expected - Penalty rate established by the first matching entry.
   * @param params.actual - Conflicting penalty rate supplied by a later entry.
   */
  public constructor(params: {
    readonly vault: Address;
    readonly expected: bigint;
    readonly actual: bigint;
  }) {
    super(
      `Penalty for vault "${params.vault}" must remain "${params.expected}" across the bundle, got "${params.actual}". Use the vault's configured penalty for every call.`,
    );
    this.vault = params.vault;
    this.expected = params.expected;
    this.actual = params.actual;
    this.name = "InconsistentReallocationPenaltyError";
  }
}

/** Thrown when a market repay specifies both `assets` and `shares` as non-zero (modes are mutually exclusive). */
export class MutuallyExclusiveRepayAmountsError extends Error {
  constructor(market: string) {
    super(
      `Exactly one of assets or shares must be non-zero for market: ${market}. Both were provided.`,
    );
    this.name = "MutuallyExclusiveRepayAmountsError";
  }
}

/** Thrown when a withdraw amount exceeds the position's available collateral. */
export class WithdrawExceedsCollateralError extends Error {
  constructor(params: {
    withdrawAmount: bigint;
    available: bigint;
    market: string;
  }) {
    super(
      `Withdraw amount ${params.withdrawAmount} exceeds available collateral ${params.available} for market: ${params.market}`,
    );
    this.name = "WithdrawExceedsCollateralError";
  }
}

/** Thrown when a collateral withdrawal would leave the borrower's position above the LLTV-buffered safe maximum. */
export class WithdrawMakesPositionUnhealthyError extends Error {
  constructor(params: {
    withdrawAmount: bigint;
    borrowAssets: bigint;
    maxSafeBorrow: bigint;
  }) {
    super(
      `Withdrawing ${params.withdrawAmount} collateral would make position unhealthy. Max safe borrow after withdrawal: ${params.maxSafeBorrow}. Actual Borrow assets: ${params.borrowAssets}.`,
    );
    this.name = "WithdrawMakesPositionUnhealthyError";
  }
}

/** Thrown when a repay amount in assets exceeds the borrower's outstanding debt. */
export class RepayExceedsDebtError extends Error {
  constructor(params: { repayAmount: bigint; debt: bigint; market: string }) {
    super(
      `Repay amount ${params.repayAmount} exceeds outstanding debt ${params.debt} for market: ${params.market}`,
    );
    this.name = "RepayExceedsDebtError";
  }
}

/** Thrown when EIP-712 signature verification fails (the signed data does not match the expected signer). */
export class InvalidSignatureError extends Error {
  constructor() {
    super(
      "Signature verification failed: the signed data does not match the expected signer address",
    );
    this.name = "InvalidSignatureError";
  }
}

/** Thrown when a repay in shares mode supplies more shares than the borrower owes. */
export class RepaySharesExceedDebtError extends Error {
  constructor(params: {
    repayShares: bigint;
    borrowShares: bigint;
    market: string;
  }) {
    super(
      `Repay shares ${params.repayShares} exceed outstanding borrow shares ${params.borrowShares} for market: ${params.market}`,
    );
    this.name = "RepaySharesExceedDebtError";
  }
}

/**
 * Thrown when shared liquidity selected by a Vault V2 reallocation planner cannot
 * cover the operation's absolute shortfall on the target market — the resulting
 * `morphoBorrow` or `morphoWithdraw` would still revert onchain.
 *
 * Pattern-match on the class and inspect `params` to surface the gap to users.
 */
export class InsufficientSharedLiquidityError extends Error {
  constructor(
    public readonly params: {
      readonly marketId: MarketId;
      readonly shortfall: bigint;
      readonly available: bigint;
    },
  ) {
    super(
      `Shared liquidity is insufficient on market ${params.marketId}: shortfall "${params.shortfall}", available "${params.available}". Reduce the operation amount or wait for additional vault liquidity.`,
    );
    this.name = "InsufficientSharedLiquidityError";
  }
}

/** Thrown when reallocation state does not contain a requested market. */
export class UnknownReallocationMarketError extends UnknownDataError {
  /**
   * @param marketId - Missing market id.
   */
  constructor(public readonly marketId: MarketId) {
    super(`unknown reallocation market "${marketId}"`);
    this.name = "UnknownReallocationMarketError";
  }
}

/** Thrown when reallocation state does not contain a requested vault. */
export class UnknownReallocationVaultError extends UnknownDataError {
  /**
   * @param vault - Missing vault address.
   */
  constructor(public readonly vault: Address) {
    super(`unknown reallocation vault "${vault}"`);
    this.name = "UnknownReallocationVaultError";
  }
}

/** Thrown when Vault V2 reallocation state does not contain a requested allocation id. */
export class UnknownReallocationAllocationError extends UnknownDataError {
  /**
   * @param vault - Vault V2 address for the missing allocation.
   * @param id - Missing Vault V2 allocation id.
   */
  constructor(
    public readonly vault: Address,
    public readonly id: Hash,
  ) {
    super(`unknown reallocation allocation "${id}" for vault "${vault}"`);
    this.name = "UnknownReallocationAllocationError";
  }
}

/** Thrown when Vault V2 reallocation state lacks the vault-wide allocator configuration. */
export class UnknownReallocationPublicAllocatorConfigError extends UnknownDataError {
  /** @param vault - Vault V2 address with missing allocator configuration. */
  constructor(public readonly vault: Address) {
    super(`unknown public allocator configuration for vault "${vault}"`);
    this.name = "UnknownReallocationPublicAllocatorConfigError";
  }
}

/** Thrown when Vault V2 reallocation state lacks the fetched active-adapter set. */
export class UnknownReallocationActiveAdaptersError extends UnknownDataError {
  /** @param vault - Vault V2 address with missing active-adapter state. */
  constructor(public readonly vault: Address) {
    super(`unknown active adapters for reallocation vault "${vault}"`);
    this.name = "UnknownReallocationActiveAdaptersError";
  }
}

/** Thrown when Vault V2 reallocation state lacks an adapter-market allocator configuration. */
export class UnknownReallocationMarketPublicAllocatorConfigError extends UnknownDataError {
  /**
   * @param vault - Vault V2 address for the missing configuration.
   * @param adapterMarketCapId - Missing adapter-scoped market cap id.
   */
  constructor(
    public readonly vault: Address,
    public readonly adapterMarketCapId: Hash,
  ) {
    super(
      `unknown public allocator configuration "${adapterMarketCapId}" for vault "${vault}"`,
    );
    this.name = "UnknownReallocationMarketPublicAllocatorConfigError";
  }
}

/** Thrown when Vault V2 reallocation state does not contain a requested adapter. */
export class UnknownReallocationAdapterError extends UnknownDataError {
  /**
   * @param vault - Vault V2 address expected to own the adapter.
   * @param adapter - Missing adapter address.
   */
  constructor(
    public readonly vault: Address,
    public readonly adapter: Address,
  ) {
    super(`unknown reallocation adapter "${adapter}" for vault "${vault}"`);
    this.name = "UnknownReallocationAdapterError";
  }
}

/** Thrown when a simulated Vault V2 allocation transition would underflow. */
export class ReallocationAllocationUnderflowError extends Error {
  constructor(
    public readonly params: {
      readonly vault: Address;
      readonly id: Hash;
      readonly allocation: bigint;
      readonly change: bigint;
    },
  ) {
    super(
      `Reallocation change "${params.change}" exceeds allocation "${params.allocation}" for id "${params.id}" on vault "${params.vault}". Refresh the reallocation data and recompute the plan.`,
    );
    this.name = "ReallocationAllocationUnderflowError";
  }
}

/** Thrown when a simulated Vault V2 market withdrawal exceeds the adapter's supply shares. */
export class ReallocationAdapterSupplySharesUnderflowError extends Error {
  constructor(
    public readonly params: {
      readonly vault: Address;
      readonly adapter: Address;
      readonly marketId: MarketId;
      readonly supplyShares: bigint;
      readonly withdrawnShares: bigint;
    },
  ) {
    super(
      `Reallocation withdraw shares "${params.withdrawnShares}" exceed adapter supply shares "${params.supplyShares}" on market "${params.marketId}" for adapter "${params.adapter}". Refresh the reallocation data and recompute the plan.`,
    );
    this.name = "ReallocationAdapterSupplySharesUnderflowError";
  }
}

/** Thrown when a Midnight batch cancellation has no offer groups. */
export class EmptyMidnightGroupCancellationsError extends Error {
  constructor() {
    super(
      "Midnight group cancellations cannot be empty. Pass at least one offer group to cancel.",
    );
    this.name = "EmptyMidnightGroupCancellationsError";
  }
}

/** Thrown when a Midnight flow passes a collateral market with no collateral supplies. */
export class EmptyMidnightCollateralSuppliesError extends Error {
  constructor() {
    super(
      "Midnight collateral supplies cannot be empty. Pass at least one collateral supply, or use `makeBorrow` to publish without collateral.",
    );
    this.name = "EmptyMidnightCollateralSuppliesError";
  }
}

/** Thrown when a Midnight batch cancellation lists the same offer group twice. */
export class DuplicateMidnightGroupCancellationError extends Error {
  constructor(params: { readonly index: number; readonly group: Hex }) {
    super(
      `Midnight group cancellation "${params.index}" repeats group "${params.group}". Pass each offer group once.`,
    );
    this.name = "DuplicateMidnightGroupCancellationError";
  }
}

/** Thrown when a Midnight flow needs at least one takeable offer. */
export class EmptyMidnightTakeableOffersError extends Error {
  constructor() {
    super(
      "Midnight takeable offers cannot be empty. Refresh the quote and try again.",
    );
    this.name = "EmptyMidnightTakeableOffersError";
  }
}

/** Thrown when a Midnight offer has the wrong maker side for the requested flow. */
export class MidnightOfferSideMismatchError extends Error {
  constructor(params: {
    index: number;
    expectedBuy: boolean;
    actualBuy: boolean;
  }) {
    super(
      `Midnight offer "${params.index}" has buy="${params.actualBuy}", expected "${params.expectedBuy}". Use the matching flow or rebuild the offer list.`,
    );
    this.name = "MidnightOfferSideMismatchError";
  }
}

/** Thrown when a Midnight maker method that is not a limit exit receives a reduce-only offer. */
export class MidnightOfferReduceOnlyError extends Error {
  constructor(params: { readonly index: number }) {
    super(
      `Midnight offer "${params.index}" is reduce-only. Rebuild the offer with reduceOnly=false; reduce-only exits need a dedicated exit flow.`,
    );
    this.name = "MidnightOfferReduceOnlyError";
  }
}

/** Thrown when a Midnight maker offer belongs to a different account than the action flow. */
export class MidnightOfferMakerMismatchError extends Error {
  constructor(params: {
    readonly index: number;
    readonly expectedMaker: Address;
    readonly actualMaker: Address;
  }) {
    super(
      `Midnight offer "${params.index}" belongs to maker "${params.actualMaker}", expected "${params.expectedMaker}". Rebuild the offer set for the active account.`,
    );
    this.name = "MidnightOfferMakerMismatchError";
  }
}

/** Thrown when a Midnight maker offer sets a nonzero continuous fee cap. */
export class MidnightOfferContinuousFeeCapError extends Error {
  /** Offer index in the maker tree. */
  public readonly index: number;
  /** Continuous fee cap supplied on the offer. */
  public readonly continuousFeeCap: bigint;

  /**
   * @param params - Offer index and rejected fee cap.
   * @param params.index - Offer index in the maker tree.
   * @param params.continuousFeeCap - Continuous fee cap supplied on the offer.
   */
  public constructor(params: {
    readonly index: number;
    readonly continuousFeeCap: bigint;
  }) {
    super(
      `Midnight offer "${params.index}" has continuous fee cap "${params.continuousFeeCap}". Maker offers must use 0n; rebuild the offer with its fee cap set to zero.`,
    );
    this.index = params.index;
    this.continuousFeeCap = params.continuousFeeCap;
    this.name = "MidnightOfferContinuousFeeCapError";
  }
}

/** Thrown when a Midnight sell offer routes its seller proceeds to another address. */
export class MidnightOfferSellerReceiverMismatchError extends Error {
  /** Offer index in the maker tree. */
  public readonly index: number;
  /** Offer maker, which must receive seller proceeds. */
  public readonly expectedReceiver: Address;
  /** Seller receiver supplied on the offer. */
  public readonly actualReceiver: Address;

  /**
   * @param params - Offer index and expected and actual seller receivers.
   * @param params.index - Offer index in the maker tree.
   * @param params.expectedReceiver - Offer maker, which must receive seller proceeds.
   * @param params.actualReceiver - Seller receiver supplied on the offer.
   */
  public constructor(params: {
    readonly index: number;
    readonly expectedReceiver: Address;
    readonly actualReceiver: Address;
  }) {
    super(
      `Midnight sell offer "${params.index}" routes seller proceeds to "${params.actualReceiver}", expected its maker "${params.expectedReceiver}". Set receiverIfMakerIsSeller to the maker address.`,
    );
    this.index = params.index;
    this.expectedReceiver = params.expectedReceiver;
    this.actualReceiver = params.actualReceiver;
    this.name = "MidnightOfferSellerReceiverMismatchError";
  }
}

/** Thrown when a Midnight taker flow uses an unbounded target or deadline. */
export class UnboundedMidnightTakeInputError extends Error {
  /**
   * @param field - Target or deadline input set to `maxUint256`.
   */
  public constructor(
    public readonly field:
      | "target.units"
      | "target.maxBuyerAssets"
      | "target.maxUnits"
      | "deadline",
  ) {
    super(
      `Midnight "${field}" cannot be maxUint256. Provide an explicit bounded value.`,
    );
    this.name = "UnboundedMidnightTakeInputError";
  }
}

/**
 * Thrown when none of a Midnight take's offers can fill and the flow has no other source of units,
 * so `MidnightBundlesV2` would revert with `OutOfOffers()`, or when every offer would abort the
 * bundle before its take (`Panic(0x12)`, `PriceGreaterThanOne()` or an underflow), whatever the
 * fallback.
 */
export class MidnightTakeableOffersNotFillableError extends Error {
  /** Every supplied offer with the reason it cannot fill. */
  public readonly offers: readonly {
    /** Offer index in the supplied `takeableOffers`. */
    readonly index: number;
    /** Why the offer cannot fill. */
    readonly reason:
      | "expired"
      | "notStarted"
      | "selfTake"
      | "continuousFeeCapBelowMarketFee"
      | "zeroUnits"
      | "receiverIfMakerIsSellerNotZero"
      | "marketMatured"
      | "zeroBuyerPrice"
      | "buyerPriceAboveOne"
      | "priceBelowSettlementFee"
      | "tickOutOfRange";
  }[];

  /**
   * @param offers - Every supplied offer with the reason it cannot fill.
   */
  public constructor(offers: MidnightTakeableOffersNotFillableError["offers"]) {
    super(
      `No Midnight takeable offer can fill: ${offers
        .map(({ index, reason }) => `offer "${index}" is "${reason}"`)
        .join(", ")}. Refresh the quote and try again.`,
    );
    this.offers = offers;
    this.name = "MidnightTakeableOffersNotFillableError";
  }
}

/**
 * Thrown when a Midnight take target can never be met, so `MidnightBundlesV2` would revert
 * (`OutOfOffers()`, `SellerAssetsTooLow()`, `UnitsTooHigh()` or a loan-token transfer error).
 */
export class MidnightTakeTargetUnreachableError extends Error {
  /** Target bound that cannot be met, or `takeableOffers` when the offers lack capacity. */
  public readonly field:
    | "target.minSellerAssets"
    | "target.maxUnits"
    | "target.maxBuyerAssets"
    | "repay.maxBuyerAssets"
    | "takeableOffers";
  /** Supplied bound, or the fillable units for `takeableOffers`. */
  public readonly value: bigint;
  /** Bound the target needs. */
  public readonly limit: bigint;

  /**
   * @param params - Unreachable bound, supplied value and required limit.
   * @param params.field - Target bound that cannot be met, or `takeableOffers`.
   * @param params.value - Supplied bound, or the fillable units for `takeableOffers`.
   * @param params.limit - Bound the target needs.
   */
  public constructor(params: {
    readonly field: MidnightTakeTargetUnreachableError["field"];
    readonly value: bigint;
    readonly limit: bigint;
  }) {
    super(
      {
        "target.minSellerAssets": `Midnight "target.minSellerAssets" "${params.value}" exceeds the most the seller can receive, "${params.limit}", since each unit sells for at most one asset and the referral fee is deducted. Lower minSellerAssets or raise target.units.`,
        "target.maxUnits": `Midnight "target.maxUnits" "${params.value}" is below the "${params.limit}" units needed, since each unit sells for at most one asset and the referral fee is added. Raise maxUnits or lower target.assets.`,
        "target.maxBuyerAssets": `Midnight "target.maxBuyerAssets" "${params.value}" is below the minimum cost "${params.limit}" of the target units at the cheapest fillable price, including the referral fee. Raise maxBuyerAssets or lower target.units.`,
        "repay.maxBuyerAssets": `Midnight "repay.maxBuyerAssets" "${params.value}" is below the position debt "${params.limit}", which a full repay pays at par. Raise maxBuyerAssets to cover the debt.`,
        takeableOffers: `Midnight takeable offers can fill at most "${params.value}" units, below the "${params.limit}" units the target needs. Request a larger quote or lower the target.`,
      }[params.field],
    );
    this.field = params.field;
    this.value = params.value;
    this.limit = params.limit;
    this.name = "MidnightTakeTargetUnreachableError";
  }
}

/**
 * Thrown when a Midnight buy's `maxContinuousFee` is below the market's continuous fee, so
 * `MidnightBundlesV2` would revert with `ContinuousFeeAboveMax()`.
 */
export class MidnightContinuousFeeAboveMaxError extends Error {
  /** Largest continuous fee the caller accepts. */
  public readonly maxContinuousFee: bigint;
  /** Market continuous fee from the market snapshot. */
  public readonly continuousFee: bigint;

  /**
   * @param params - Caller cap and market fee.
   * @param params.maxContinuousFee - Largest continuous fee the caller accepts.
   * @param params.continuousFee - Market continuous fee from the market snapshot.
   */
  public constructor(params: {
    readonly maxContinuousFee: bigint;
    readonly continuousFee: bigint;
  }) {
    super(
      `Midnight market continuous fee "${params.continuousFee}" exceeds maxContinuousFee "${params.maxContinuousFee}". Raise maxContinuousFee or refresh the market data.`,
    );
    this.maxContinuousFee = params.maxContinuousFee;
    this.continuousFee = params.continuousFee;
    this.name = "MidnightContinuousFeeAboveMaxError";
  }
}

/**
 * Thrown when a Midnight reduce-only repay targets more than the position's debt, so
 * `MidnightBundlesV2` would revert with `NotReduceOnly()` or `OutOfOffers()`.
 */
export class MidnightRepayExceedsDebtError extends Error {
  /** Repay input that exceeds the debt. */
  public readonly field:
    | "target.units"
    | "target.minUnits"
    | "target.assets"
    | "repay.assets";
  /** Supplied repay amount; for `target.assets`, net of the referral fee. */
  public readonly value: bigint;
  /** Debt from the position snapshot. */
  public readonly debt: bigint;

  /**
   * @param params - Repay input, amount and debt.
   * @param params.field - Repay input that exceeds the debt.
   * @param params.value - Supplied repay amount; for `target.assets`, net of the referral fee.
   * @param params.debt - Debt from the position snapshot.
   */
  public constructor(params: {
    readonly field:
      | "target.units"
      | "target.minUnits"
      | "target.assets"
      | "repay.assets";
    readonly value: bigint;
    readonly debt: bigint;
  }) {
    super(
      `Midnight "${params.field}" "${params.value}" exceeds the position debt "${params.debt}". Lower the repay amount or use a full repay.`,
    );
    this.field = params.field;
    this.value = params.value;
    this.debt = params.debt;
    this.name = "MidnightRepayExceedsDebtError";
  }
}

/**
 * Thrown when a Midnight flow uses a zero receiver or a zero collateral receiver with withdrawals.
 */
export class MidnightZeroReceiverError extends Error {
  /**
   * @param field - Receiver field or collateral receiver field containing the zero address.
   */
  public constructor(public readonly field: "receiver" | "collateralReceiver") {
    super(
      `Midnight "${field}" cannot be the zero address. Provide a valid recipient.`,
    );
    this.name = "MidnightZeroReceiverError";
  }
}

/** Thrown when a Midnight flow uses the zero address as the account it acts for. */
export class MidnightZeroOnBehalfError extends Error {
  /**
   * @param field - Account field containing the zero address.
   */
  public constructor(public readonly field: "onBehalf") {
    super(
      `Midnight "${field}" cannot be the zero address. Provide a valid account.`,
    );
    this.name = "MidnightZeroOnBehalfError";
  }
}

/**
 * Thrown when a Midnight receiver is a Midnight protocol or market token contract that cannot
 * forward received assets.
 */
export class MidnightContractReceiverError extends Error {
  /** Receiver field supplied with the contract address. */
  public readonly field:
    | "receiver"
    | "collateralReceiver"
    | "referralFeeRecipient";
  /** Contract address supplied as the receiver. */
  public readonly receiver: Address;
  /** Midnight registry key (`"midnight"`, `"midnightBundlesV2"`,
   * `"midnightBlueBuyCallbackFactory"`, `"midnightMempool"`, `"ecrecoverRatifier"`,
   * `"ecrecoverAuthorizer"`, `"setterRatifier"`, `"priceRatifierV1"`,
   * `"rateRatifierV1"`) or market token label (`"loanToken"`, `"collateralToken[i]"`)
   * identifying the matched contract. */
  public readonly contract:
    | "midnight"
    | "midnightBundlesV2"
    | "midnightBlueBuyCallbackFactory"
    | "midnightMempool"
    | "ecrecoverRatifier"
    | "ecrecoverAuthorizer"
    | "setterRatifier"
    | "priceRatifierV1"
    | "rateRatifierV1"
    | "loanToken"
    | `collateralToken[${number}]`;

  /**
   * @param params - Matched receiver field, contract address, and contract label.
   * @param params.field - Receiver field supplied with the contract address.
   * @param params.receiver - Contract address supplied as the receiver.
   * @param params.contract - Midnight registry key (for example `"midnightBundlesV2"`) or
   *   market token label (`"loanToken"`, `"collateralToken[i]"`) identifying the matched
   *   contract.
   */
  public constructor(params: {
    readonly field: "receiver" | "collateralReceiver" | "referralFeeRecipient";
    readonly receiver: Address;
    readonly contract:
      | "midnight"
      | "midnightBundlesV2"
      | "midnightBlueBuyCallbackFactory"
      | "midnightMempool"
      | "ecrecoverRatifier"
      | "ecrecoverAuthorizer"
      | "setterRatifier"
      | "priceRatifierV1"
      | "rateRatifierV1"
      | "loanToken"
      | `collateralToken[${number}]`;
  }) {
    super(
      `Midnight "${params.field}" "${params.receiver}" is the ${params.contract} contract, which cannot forward received assets. Provide an account address that can receive them.`,
    );
    this.name = "MidnightContractReceiverError";
    this.field = params.field;
    this.receiver = params.receiver;
    this.contract = params.contract;
  }
}

/** Thrown when a Midnight take deadline is more than one hour from the current time. */
export class MidnightTakeDeadlineTooFarError extends Error {
  /** Deadline supplied by the caller. */
  public readonly deadline: bigint;
  /** Accepted maximum deadline. */
  public readonly maxDeadline: bigint;

  /**
   * @param params - Supplied deadline and accepted maximum.
   * @param params.deadline - Deadline supplied by the caller.
   * @param params.maxDeadline - Latest accepted deadline.
   */
  public constructor(params: {
    readonly deadline: bigint;
    readonly maxDeadline: bigint;
  }) {
    super(
      `Midnight take deadline "${params.deadline}" is later than the one-hour limit "${params.maxDeadline}". Choose a deadline within the next hour.`,
    );
    this.deadline = params.deadline;
    this.maxDeadline = params.maxDeadline;
    this.name = "MidnightTakeDeadlineTooFarError";
  }
}

/** Thrown when a Midnight maker offer targets a different chain than the action flow. */
export class MidnightOfferMarketChainMismatchError extends Error {
  constructor(params: {
    readonly index: number;
    readonly expectedChainId: number;
    readonly actualChainId: bigint;
  }) {
    super(
      `Midnight offer "${params.index}" targets chain "${params.actualChainId}", expected "${params.expectedChainId}". Rebuild the offer set for the selected chain.`,
    );
    this.name = "MidnightOfferMarketChainMismatchError";
  }
}

/** Thrown when a Midnight maker offer targets a different Midnight contract than the action flow. */
export class MidnightOfferMarketAddressMismatchError extends Error {
  constructor(params: {
    readonly index: number;
    readonly expectedMidnight: Address;
    readonly actualMidnight: Address;
  }) {
    super(
      `Midnight offer "${params.index}" targets Midnight "${params.actualMidnight}", expected "${params.expectedMidnight}". Rebuild the offer set for the selected chain.`,
    );
    this.name = "MidnightOfferMarketAddressMismatchError";
  }
}

/** Thrown when a Midnight market targets a different deployment than the selected chain. */
export class MidnightMarketAddressMismatchError extends Error {
  constructor(params: {
    readonly expectedMidnight: Address;
    readonly actualMidnight: Address;
  }) {
    super(
      `Midnight market targets contract "${params.actualMidnight}", expected "${params.expectedMidnight}". Use market data from the selected chain deployment.`,
    );
    this.name = "MidnightMarketAddressMismatchError";
  }
}

/** Thrown when a Midnight make-lend offer does not use the approved loan token. */
export class MidnightOfferMarketLoanTokenMismatchError extends Error {
  constructor(params: {
    readonly index: number;
    readonly expectedLoanToken: Address;
    readonly actualLoanToken: Address;
  }) {
    super(
      `Midnight offer "${params.index}" uses loan token "${params.actualLoanToken}", expected "${params.expectedLoanToken}". Rebuild the lend offer set for the approved loan token.`,
    );
    this.name = "MidnightOfferMarketLoanTokenMismatchError";
  }
}

/** Thrown when a Blue-funded Midnight lend offer does not use the maker's derived `BlueBuyCallback`. */
export class MidnightOfferCallbackMismatchError extends Error {
  constructor(params: {
    readonly index: number;
    readonly expectedCallback: Address;
    readonly actualCallback: Address;
  }) {
    super(
      `Midnight offer "${params.index}" uses callback "${params.actualCallback}", expected the maker's BlueBuyCallback "${params.expectedCallback}". Rebuild the offer with the derived callback.`,
    );
    this.name = "MidnightOfferCallbackMismatchError";
  }
}

/** Thrown when a Blue-funded Midnight lend offer's callback data is not the ABI-encoded Blue market. */
export class MidnightOfferCallbackDataMismatchError extends Error {
  constructor(params: {
    readonly index: number;
    readonly expectedCallbackData: Hex;
    readonly actualCallbackData: Hex;
  }) {
    super(
      `Midnight offer "${params.index}" uses callback data "${params.actualCallbackData}", expected "${params.expectedCallbackData}". Set the callback data to the ABI-encoded Blue market the assets are parked in.`,
    );
    this.name = "MidnightOfferCallbackDataMismatchError";
  }
}

/** Thrown when loan assets would be parked in a Morpho Blue market with no existing supply. */
export class EmptyBlueParkingMarketError extends Error {
  constructor(params: { readonly marketId: MarketId }) {
    super(
      `Morpho Blue market "${params.marketId}" has no supply shares. Parking assets in an empty market is exposed to supply-share-price inflation; choose a market with existing supply.`,
    );
    this.name = "EmptyBlueParkingMarketError";
  }
}

/**
 * Thrown when parked assets would mint no Morpho Blue supply shares at preparation time; see
 * `MorphoMidnight.supplyBlueMakeLend` for why this is not an execution-time guarantee.
 */
export class ZeroBlueParkingSharesError extends Error {
  constructor(params: {
    readonly marketId: MarketId;
    readonly assets: bigint;
  }) {
    super(
      `Supplying "${params.assets}" assets to Morpho Blue market "${params.marketId}" mints zero supply shares at its current share price; park more assets or choose another market.`,
    );
    this.name = "ZeroBlueParkingSharesError";
  }
}

/** Thrown when a quoted Midnight takeable offer belongs to a different market than the requested flow. */
export class MidnightTakeableOfferMarketMismatchError extends Error {
  constructor(params: {
    index: number;
    expectedMarket: string;
    actualMarket: string;
  }) {
    super(
      `Midnight takeable offer "${params.index}" belongs to market "${params.actualMarket}", expected "${params.expectedMarket}". Refresh the quote and try again.`,
    );
    this.name = "MidnightTakeableOfferMarketMismatchError";
  }
}

/** Thrown when a quoted Midnight sell offer routes its seller proceeds to the zero address. */
export class MidnightTakeableOfferZeroSellerReceiverError extends Error {
  constructor(params: { index: number }) {
    super(
      `Midnight takeable offer "${params.index}" routes seller proceeds to the zero address. Drop the offer or refresh the quote.`,
    );
    this.name = "MidnightTakeableOfferZeroSellerReceiverError";
  }
}

/** Thrown when a Midnight offer's ratifier does not match its tree's ratifier route. */
export class MidnightOfferRatifierMismatchError extends Error {
  constructor(params: {
    index: number;
    expectedRatifier: Address;
    actualRatifier: Address;
  }) {
    super(
      `Midnight offer "${params.index}" uses ratifier "${params.actualRatifier}", expected "${params.expectedRatifier}" for its tree type. Rebuild the offer with the tree's ratifier.`,
    );
    this.name = "MidnightOfferRatifierMismatchError";
  }
}

/** Thrown when a Midnight repost cancels a group it also publishes. */
export class MidnightReplacementGroupCancelledError extends Error {
  constructor(params: { readonly group: Hex }) {
    super(
      `Midnight offer group "${params.group}" is both published and cancelled. Give replacement offers a fresh group.`,
    );
    this.name = "MidnightReplacementGroupCancelledError";
  }
}

/** Thrown when a Midnight redeem flow finds no credit units for the user. */
export class NoMidnightCreditToRedeemError extends Error {
  constructor(market: string) {
    super(`No Midnight credit is available to redeem for market "${market}".`);
    this.name = "NoMidnightCreditToRedeemError";
  }
}

/** Thrown when a Midnight redeem amount exceeds the user's accrued credit. */
export class MidnightRedeemExceedsCreditError extends Error {
  constructor(params: { market: string; units: bigint; credit: bigint }) {
    super(
      `Midnight redeem amount exceeds position credit on market "${params.market}": units "${params.units}", credit "${params.credit}". Redeem less or refresh the position data.`,
    );
    this.name = "MidnightRedeemExceedsCreditError";
  }
}

/** Thrown when a Midnight redeem amount exceeds the market's currently withdrawable liquidity. */
export class InsufficientMidnightWithdrawableLiquidityError extends Error {
  constructor(params: { market: string; units: bigint; withdrawable: bigint }) {
    super(
      `Midnight withdrawable liquidity is insufficient on market "${params.market}": units "${params.units}", withdrawable "${params.withdrawable}". Try again later or redeem less.`,
    );
    this.name = "InsufficientMidnightWithdrawableLiquidityError";
  }
}

/**
 * Thrown when a Midnight root, publication or cancellation group, Blue callback salt,
 * root-signature `r`/`s`, or payload is not valid bounded hex input.
 */
export class InvalidMidnightHexInputError extends Error {
  /**
   * @param params - Invalid hex field details.
   * @param params.field - Midnight input field containing the invalid value.
   * @param params.value - Supplied hex value.
   * @param params.reason - Why the supplied value is invalid.
   */
  public constructor(params: {
    readonly field: string;
    readonly value: string;
    readonly reason: "notHex" | "oddLength" | "wrongSize" | "tooLong";
  }) {
    const { expectation, remedy } = {
      notHex: {
        expectation: "strict 0x-prefixed hex",
        remedy: "Re-encode the value as 0x-prefixed hex.",
      },
      oddLength: {
        expectation: "even-length hex",
        remedy: "Re-encode the value as 0x-prefixed hex.",
      },
      wrongSize: {
        expectation: "exactly 32 bytes",
        remedy: "Pass exactly 32 bytes of hex.",
      },
      tooLong: {
        expectation: `no more than ${Payload.MAX_PAYLOAD_BYTES.toLocaleString("en-US")} bytes`,
        remedy:
          "Split the offers across smaller trees so the encoded payload fits.",
      },
    }[params.reason];
    const raw = String(params.value);
    const value =
      raw.length > 80 ? `${raw.slice(0, 40)}…${raw.slice(-8)}` : raw;
    super(
      `Midnight "${params.field}" must be ${expectation}, got "${value}". ${remedy}`,
    );
    this.field = params.field;
    this.value = raw;
    this.reason = params.reason;
    this.name = "InvalidMidnightHexInputError";
  }

  /** Midnight input field containing the invalid value. */
  public readonly field: string;
  /** Supplied hex value. */
  public readonly value: string;
  /** Why the supplied value is invalid. */
  public readonly reason: "notHex" | "oddLength" | "wrongSize" | "tooLong";
}

/** Thrown when a Midnight entity account is malformed or the zero address. */
export class MidnightInvalidAccountAddressError extends Error {
  /**
   * @param value - Account address supplied by the caller.
   */
  public constructor(public readonly value: string) {
    super(
      `Midnight accountAddress must be a valid non-zero address, got "${value}". Provide a valid account address.`,
    );
    this.name = "MidnightInvalidAccountAddressError";
  }
}

/** Thrown when a loan-asset withdraw specifies both `assets` and `shares` as non-zero (modes are mutually exclusive). */
export class MutuallyExclusiveWithdrawAmountsError extends Error {
  constructor(market: string) {
    super(
      `Exactly one of assets or shares must be non-zero for market: ${market}. Both were provided.`,
    );
    this.name = "MutuallyExclusiveWithdrawAmountsError";
  }
}

/** Thrown when a loan-asset withdraw in assets mode exceeds the user's supplied assets in the market. */
export class WithdrawExceedsSupplyError extends Error {
  constructor(params: {
    withdrawAmount: bigint;
    available: bigint;
    market: string;
  }) {
    super(
      `Withdraw amount ${params.withdrawAmount} exceeds available supply ${params.available} for market: ${params.market}. Reduce withdraw amount.`,
    );
    this.name = "WithdrawExceedsSupplyError";
  }
}

/** Thrown when a loan-asset withdraw in shares mode exceeds the user's owned supply shares in the market. */
export class WithdrawSharesExceedSupplyError extends Error {
  constructor(params: {
    withdrawShares: bigint;
    supplyShares: bigint;
    market: string;
  }) {
    super(
      `Withdraw shares ${params.withdrawShares} exceed owned supply shares ${params.supplyShares} for market: ${params.market}. Reduce withdraw shares.`,
    );
    this.name = "WithdrawSharesExceedSupplyError";
  }
}

/**
 * Thrown when a Vault V2 reallocation planner receives a withdraw `amount` greater
 * than the target market's current `totalSupplyAssets` — the post-withdraw
 * supply would be negative, making the on-chain `morphoWithdraw` revert
 * regardless of any reallocation. Caught here so callers do not pay
 * allocator penalties on an unreachable operation.
 */
export class ReallocationWithdrawExceedsMarketSupplyError extends Error {
  constructor(
    public readonly params: {
      readonly marketId: MarketId;
      readonly withdrawAmount: bigint;
      readonly totalSupplyAssets: bigint;
    },
  ) {
    super(
      `Withdraw amount "${params.withdrawAmount}" exceeds market total supply "${params.totalSupplyAssets}" on market ${params.marketId}. Reduce the withdraw amount.`,
    );
    this.name = "ReallocationWithdrawExceedsMarketSupplyError";
  }
}

/** Thrown when a vault migration's source vault asset differs from the target vault asset. */
export class VaultAssetMismatchError extends Error {
  constructor(sourceAsset: Address, targetAsset: Address) {
    super(
      `Source vault asset ${sourceAsset} does not match target vault asset ${targetAsset}`,
    );
    this.name = "VaultAssetMismatchError";
  }
}

/** Thrown when a refinance has identical source and target market ids (a refinance to the same market is a costly no-op). */
export class RefinanceSameMarketError extends Error {
  constructor(market: string) {
    super(
      `Refinance source and target market ${market} are identical. Refinance requires a different target market.`,
    );
    this.name = "RefinanceSameMarketError";
  }
}

/** Thrown when a refinance's source and target markets do not share the same loan or collateral token. */
export class RefinanceTokenMismatchError extends Error {
  constructor(sourceMarket: string, targetMarket: string) {
    super(
      `Refinance source market ${sourceMarket} and target market ${targetMarket} must share the same loanToken and collateralToken.`,
    );
    this.name = "RefinanceTokenMismatchError";
  }
}
/** Thrown when a maker limit-exit offer can increase or open a position. */
export class MidnightOfferNotReduceOnlyError extends Error {
  constructor(params: { readonly index: number }) {
    super(
      `Midnight exit offer "${params.index}" must have reduceOnly=true. Rebuild the offer tree for the exit intent.`,
    );
    this.name = "MidnightOfferNotReduceOnlyError";
  }
}

/**
 * Thrown when a configured registry address holds no contract code.
 *
 * A call to a code-less address succeeds on-chain as a no-op, so entity
 * `getRequirements()` checks each registry target with one `eth_getCode`
 * before returning requirements. Use {@link MissingContractCodeError.address}
 * and {@link MissingContractCodeError.role} to find the misconfigured registry
 * entry.
 *
 * @example
 * ```ts
 * import { MissingContractCodeError } from "@morpho-org/morpho-sdk";
 *
 * try {
 *   await deposit.getRequirements();
 * } catch (error) {
 *   if (error instanceof MissingContractCodeError) {
 *     console.error(error.address, error.chainId, error.role);
 *   }
 * }
 * ```
 */
export class MissingContractCodeError extends Error {
  /**
   * @param address - Registry-configured address without deployed code.
   * @param chainId - Chain id the flow targets.
   * @param role - Registry label naming the address's role in the flow.
   */
  // biome-ignore lint/complexity/useMaxParams: mirrors the registry-address failure shape
  public constructor(
    public readonly address: Address,
    public readonly chainId: number,
    public readonly role: AddressLabel,
  ) {
    super(
      `No contract code at ${role} address ${address} on chain ${chainId}. Check the address registry and that the client's RPC serves chain ${chainId}.`,
    );
    this.name = "MissingContractCodeError";
  }
}

/**
 * Thrown when a Midnight flow is prepared for the zero address. Midnight would revert
 * `Unauthorized()`, and requirements resolved for the zero address can never be sent.
 *
 * @example
 * ```ts
 * import { MidnightZeroAccountError } from "@morpho-org/morpho-sdk";
 *
 * const error = new MidnightZeroAccountError("accountAddress");
 * // error.field === "accountAddress"
 * ```
 */
export class MidnightZeroAccountError extends Error {
  /**
   * @param field - Account field containing the zero address: `accountAddress` for an entity
   * method, `owner` for a requirement helper. A zero `onBehalf` on a direct Midnight call throws
   * {@link MidnightZeroOnBehalfError} instead.
   */
  public constructor(public readonly field: "accountAddress" | "owner") {
    super(
      `Midnight "${field}" cannot be the zero address. Pass the account that sends the transaction.`,
    );
    this.name = "MidnightZeroAccountError";
  }
}

/**
 * Thrown when a Midnight builder or `MorphoMidnight` method cannot ABI-encode its calldata,
 * offer tree or market id, for example a `bytes32` field that is not 32 bytes, an integer
 * outside its Solidity type or a malformed address. Wraps the viem error as `cause`.
 *
 * @example
 * ```ts
 * import { MidnightCalldataEncodingError } from "@morpho-org/morpho-sdk";
 * import { BaseError } from "viem";
 *
 * const error = new MidnightCalldataEncodingError(
 *   "midnightBundlesV2CancelAndMake",
 *   new BaseError("bad bytes32"),
 * );
 * // error.input === "midnightBundlesV2CancelAndMake"
 * ```
 */
export class MidnightCalldataEncodingError extends Error {
  /**
   * @param input - Input that could not be encoded: the contract function whose calldata
   * failed, `"offers"` for offer-tree hashing, `"marketId"` for market-id hashing, or the name
   * of the malformed address input, such as `"accountAddress"`, `"onBehalf"`, `"owner"`,
   * `"receiver"`, `"collateralReceiver"`, `"referralFeeRecipient"`, `"market.midnight"`,
   * `"authorized"`, `"publication.ratifier"`, `"loanToken"`, `"market.loanToken"`,
   * `"market.collateralParams[i].token"`, `"positionData.user"`, `"spender"` or `"token"` (a token
   * pulled with native funding, or the token checked by
   * `getMidnightApprovalRequirements`). `"blueMarket"` reports the Blue market encoding in
   * `supplyBlueMakeLend`: a malformed address or an out-of-range `lltv`.
   * @param cause - viem encoding error.
   */
  public constructor(
    public readonly input: string,
    public override readonly cause: BaseError,
  ) {
    super(
      `Cannot encode Midnight input "${input}": ${cause.shortMessage} Check bytes32 sizes, integer ranges and addresses in the inputs.`,
      { cause },
    );
    this.name = "MidnightCalldataEncodingError";
  }
}
