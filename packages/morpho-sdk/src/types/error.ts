import { type MarketId, UnknownDataError } from "@morpho-org/blue-sdk";
import type { Address, Hash } from "viem";

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

/** Thrown when Vault V2 in-kind redemption is attempted with anything other than one adapter. */
export class InKindRedeemRequiresSingleAdapterError extends Error {
  /**
   * @param vault - Vault V2 address.
   * @param adapters - Number of adapters in the supplied vault snapshot.
   */
  public constructor(
    public readonly vault: Address,
    public readonly adapters: number,
  ) {
    super(
      `Vault "${vault}" has "${adapters}" adapters. In-kind redemption requires exactly one MorphoMarketV1AdapterV2.`,
    );
    this.name = "InKindRedeemRequiresSingleAdapterError";
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

/** Thrown when the Vault V2 adapter cannot expose MorphoMarketV1AdapterV2 market shares. */
export class UnsupportedInKindAdapterError extends Error {
  /**
   * @param adapter - Unsupported Vault V2 adapter address.
   */
  public constructor(public readonly adapter: Address) {
    super(
      `Adapter "${adapter}" does not support Vault V2 in-kind redemption. Use a MorphoMarketV1AdapterV2-backed vault.`,
    );
    this.name = "UnsupportedInKindAdapterError";
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

/** Thrown when a vault-shares requirement cannot be safely encoded as an ERC-2612 permit. */
export class VaultExitBundlesV1PermitMismatchError extends Error {
  /**
   * @param params - Permit mismatch values used to explain the rejection.
   * @param params.field - Permit field that does not match the exit.
   * @param params.expected - Value required by the exit.
   * @param params.actual - Value supplied by the signature.
   * @param params.cause - Original parser failure when signature decoding is wrapped.
   */
  public readonly field: "type" | "asset" | "signature";
  public readonly expected: string;
  public readonly actual: string;

  public constructor(params: {
    readonly field: "type" | "asset" | "signature";
    readonly expected: string;
    readonly actual: string;
    readonly cause?: unknown;
  }) {
    super(
      `VaultExitBundlesV1 permit ${params.field} mismatch: expected "${params.expected}", got "${params.actual}". Rebuild and sign the vault-exit permit.`,
      { cause: params.cause },
    );
    this.field = params.field;
    this.expected = params.expected;
    this.actual = params.actual;
    this.name = "VaultExitBundlesV1PermitMismatchError";
  }
}

/** Thrown when a signed requirement cannot be safely encoded for BlueBundlesV1. */
export class BlueBundlesV1RequirementSignatureMismatchError extends Error {
  /** Field whose signed value or encoding is invalid for the direct BlueBundlesV1 call. */
  public readonly field:
    | "type"
    | "authorized"
    | "isAuthorized"
    | "deadline"
    | "signature";
  /** Value required by BlueBundlesV1. */
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
    field: "type" | "authorized" | "isAuthorized" | "deadline" | "signature";
    expected: string;
    actual: string;
    cause?: unknown;
  }) {
    super(
      `BlueBundlesV1 requirement ${params.field} mismatch: expected "${params.expected}", got "${params.actual}". Resolve and sign the requirements returned by this Blue action.`,
      { cause: params.cause },
    );
    this.field = params.field;
    this.expected = params.expected;
    this.actual = params.actual;
    this.name = "BlueBundlesV1RequirementSignatureMismatchError";
  }
}

/** Thrown when Permit2 SignatureTransfer is selected without an explicit unordered nonce. */
export class MissingPermit2TransferFromNonceError extends Error {
  public constructor() {
    super(
      "Permit2 SignatureTransfer requires an explicit unused permit2Nonce. Generate a unique uint256 nonce, pass it to getRequirements(), and resolve the requirements again.",
    );
    this.name = "MissingPermit2TransferFromNonceError";
  }
}

/** Thrown when an explicit Permit2 SignatureTransfer unordered nonce is already consumed. */
export class Permit2TransferFromNonceAlreadyUsedError extends Error {
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
    this.name = "Permit2TransferFromNonceAlreadyUsedError";
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
export class MissingReferralFeeRecipientError extends Error {
  public constructor() {
    super(
      "A positive referralFeePct requires referralFeeRecipient. Provide the recipient or set referralFeePct to zero.",
    );
    this.name = "MissingReferralFeeRecipientError";
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

/** @deprecated Use {@link NonPositiveInputError}. */
export const NonPositiveAssetAmountError = NonPositiveInputError;
/** @deprecated Use {@link NonPositiveInputError}. */
export type NonPositiveAssetAmountError = NonPositiveInputError;

/** @deprecated Use {@link NonPositiveInputError}. */
export const NonPositiveSharesAmountError = NonPositiveInputError;
/** @deprecated Use {@link NonPositiveInputError}. */
export type NonPositiveSharesAmountError = NonPositiveInputError;

/** @deprecated Use {@link NonPositiveInputError}. */
export const NonPositiveMaxSharePriceError = NonPositiveInputError;
/** @deprecated Use {@link NonPositiveInputError}. */
export type NonPositiveMaxSharePriceError = NonPositiveInputError;

/** @deprecated Use {@link NonPositiveInputError}. */
export const ZeroDepositAmountError = NonPositiveInputError;
/** @deprecated Use {@link NonPositiveInputError}. */
export type ZeroDepositAmountError = NonPositiveInputError;

/** @deprecated Use {@link NonPositiveInputError}. */
export const NonPositiveBorrowAmountError = NonPositiveInputError;
/** @deprecated Use {@link NonPositiveInputError}. */
export type NonPositiveBorrowAmountError = NonPositiveInputError;

/** @deprecated Use {@link NonPositiveInputError}. */
export const ZeroCollateralAmountError = NonPositiveInputError;
/** @deprecated Use {@link NonPositiveInputError}. */
export type ZeroCollateralAmountError = NonPositiveInputError;

/** @deprecated Use {@link NonPositiveInputError}. */
export const NonPositiveReallocationAmountError = NonPositiveInputError;
/** @deprecated Use {@link NonPositiveInputError}. */
export type NonPositiveReallocationAmountError = NonPositiveInputError;

/** @deprecated Use {@link NonPositiveInputError}. */
export const NonPositiveRepayAmountError = NonPositiveInputError;
/** @deprecated Use {@link NonPositiveInputError}. */
export type NonPositiveRepayAmountError = NonPositiveInputError;

/** @deprecated Use {@link NonPositiveInputError}. */
export const NonPositiveRepayMaxSharePriceError = NonPositiveInputError;
/** @deprecated Use {@link NonPositiveInputError}. */
export type NonPositiveRepayMaxSharePriceError = NonPositiveInputError;

/** @deprecated Use {@link NonPositiveInputError}. */
export const NonPositiveWithdrawCollateralAmountError = NonPositiveInputError;
/** @deprecated Use {@link NonPositiveInputError}. */
export type NonPositiveWithdrawCollateralAmountError = NonPositiveInputError;

/** @deprecated Use {@link NonPositiveInputError}. */
export const ZeroSupplyAmountError = NonPositiveInputError;
/** @deprecated Use {@link NonPositiveInputError}. */
export type ZeroSupplyAmountError = NonPositiveInputError;

/** @deprecated Use {@link NonPositiveInputError}. */
export const NonPositiveWithdrawAmountError = NonPositiveInputError;
/** @deprecated Use {@link NonPositiveInputError}. */
export type NonPositiveWithdrawAmountError = NonPositiveInputError;

/** @deprecated Use {@link NegativeInputError}. */
export const NegativeSlippageToleranceError = NegativeInputError;
/** @deprecated Use {@link NegativeInputError}. */
export type NegativeSlippageToleranceError = NegativeInputError;

/** @deprecated Use {@link NegativeInputError}. */
export const NegativeNativeAmountError = NegativeInputError;
/** @deprecated Use {@link NegativeInputError}. */
export type NegativeNativeAmountError = NegativeInputError;

/** @deprecated Use {@link NegativeInputError}. */
export const NegativeReallocationFeeError = NegativeInputError;
/** @deprecated Use {@link NegativeInputError}. */
export type NegativeReallocationFeeError = NegativeInputError;

/** @deprecated Use {@link NegativeInputError}. */
export const NonPositiveMinBorrowSharePriceError = NegativeInputError;
/** @deprecated Use {@link NegativeInputError}. */
export type NonPositiveMinBorrowSharePriceError = NegativeInputError;

/** @deprecated Use {@link NegativeInputError}. */
export const NegativeSupplyAmountError = NegativeInputError;
/** @deprecated Use {@link NegativeInputError}. */
export type NegativeSupplyAmountError = NegativeInputError;

/** @deprecated Use {@link NegativeInputError}. */
export const NegativeSupplyMaxSharePriceError = NegativeInputError;
/** @deprecated Use {@link NegativeInputError}. */
export type NegativeSupplyMaxSharePriceError = NegativeInputError;

/** @deprecated Use {@link NegativeInputError}. */
export const NegativeWithdrawMinSharePriceError = NegativeInputError;
/** @deprecated Use {@link NegativeInputError}. */
export type NegativeWithdrawMinSharePriceError = NegativeInputError;

/** @deprecated Use {@link NegativeInputError}. */
export const NegativeMinSharePriceError = NegativeInputError;
/** @deprecated Use {@link NegativeInputError}. */
export type NegativeMinSharePriceError = NegativeInputError;

/** @deprecated Use {@link NegativeInputError}. */
export const NegativeBorrowSharesError = NegativeInputError;
/** @deprecated Use {@link NegativeInputError}. */
export type NegativeBorrowSharesError = NegativeInputError;

/** @deprecated Use {@link NegativeInputError}. */
export const NegativeMaxRepaySharePriceError = NegativeInputError;
/** @deprecated Use {@link NegativeInputError}. */
export type NegativeMaxRepaySharePriceError = NegativeInputError;

/**
 * Typed errors thrown while encoding supported Bundler3 actions.
 *
 * @remarks
 * Import these classes through `@morpho-org/morpho-sdk` when handling
 * failures from `BundlerAction`.
 */
export namespace BundlerErrors {
  /**
   * Thrown when an action that requires an offchain signature is encoded before
   * the signature has been attached.
   *
   * @example
   * ```ts
   * import { BundlerErrors } from "@morpho-org/morpho-sdk";
   *
   * if (error instanceof BundlerErrors.MissingSignature) {
   *   // Attach the missing permit or Permit2 signature, then encode again.
   * }
   * ```
   */
  export class MissingSignature extends Error {
    constructor() {
      super("missing signature");
    }
  }

  /**
   * Thrown when an action is unsupported on the requested chain.
   *
   * @example
   * ```ts
   * import { BundlerErrors } from "@morpho-org/morpho-sdk";
   *
   * if (error instanceof BundlerErrors.UnexpectedAction) {
   *   // Remove or replace the action for the selected chain.
   * }
   * ```
   */
  export class UnexpectedAction extends Error {
    /**
     * @param type - Unsupported Bundler3 action discriminator or name.
     * @param chainId - Chain where the action was requested.
     */
    constructor(type: string, chainId: number) {
      super(`unexpected action "${type}" on chain "${chainId}"`);
    }
  }

  /**
   * Thrown when a Morpho authorization signature names a forbidden `authorized` account
   * (for example Bundler3 itself), which would grant operator rights to an unintended address.
   *
   * @example
   * ```ts
   * import { BundlerErrors } from "@morpho-org/morpho-sdk";
   *
   * if (error instanceof BundlerErrors.UnexpectedSignature) {
   *   // Re-sign the authorization targeting GeneralAdapter1.
   * }
   * ```
   */
  export class UnexpectedSignature extends Error {
    /**
     * @param authorized - The forbidden `authorized` address carried by the signature.
     */
    constructor(authorized: Address) {
      super(`unexpected signature authorizing "${authorized}"`);
    }
  }

  /**
   * Thrown when a skippable Blue Public Allocator call would leave a usable
   * token allowance behind after the allocator call reverts.
   *
   * @example
   * ```ts
   * import { BundlerErrors } from "@morpho-org/morpho-sdk";
   *
   * if (error instanceof BundlerErrors.SkippableAllocatorPenalty) {
   *   // Rebuild the allocator call with skipRevert set to false.
   * }
   * ```
   */
  export class SkippableAllocatorPenalty extends Error {
    /**
     * @param penaltyAssets - Exact token amount approved to the allocator.
     */
    public constructor(public readonly penaltyAssets: bigint) {
      super(
        `Blue Public Allocator calls with penalty assets cannot skip reverts. Rebuild with skipRevert false for penalty amount "${penaltyAssets}".`,
      );
      this.name = "SkippableAllocatorPenalty";
    }
  }
}

/** Requirement signature kind accepted by action-output transaction builders. */
export type RequirementSignatureKind =
  | "permit"
  | "permit2TransferFrom"
  | "authorization"
  | "midnightOfferRootSignature";

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
  }
}

/** Thrown when a viem client's account address does not match the address required by the call. */
export class AddressMismatchError extends Error {
  constructor(clientAddress: Address, argsAddress: Address) {
    super(
      `Address mismatch between client: ${clientAddress} and args: ${argsAddress}`,
    );
  }
}

/** Thrown when a viem client's chain id does not match the chain id required by the call. */
export class ChainIdMismatchError extends Error {
  constructor(clientChainId: number | undefined, argsChainId: number) {
    super(
      `Chain ID mismatch between client: ${clientChainId} and args: ${argsChainId}`,
    );
  }
}

/** Thrown when a runtime crypto API is required but unavailable. */
export class CryptoUnavailableError extends Error {
  constructor(feature: string) {
    super(`Crypto API is required for ${feature} but is unavailable.`);
  }
}

/** Thrown when the viem client is missing a property the call requires (e.g. `account.address`). */
export class MissingClientPropertyError extends Error {
  constructor(property: string) {
    super(`A required ${property} is missing from the client.`);
  }
}

/** Thrown when an approval amount is smaller than the spend amount it must cover. */
export class ApprovalAmountLessThanSpendAmountError extends Error {
  constructor() {
    super("Approval amount is less than spend amount");
  }
}

/** Thrown when a requirement encoder targets an unsupported spender. */
export class UnsupportedErc20ApprovalSpenderError extends Error {
  constructor(params: {
    readonly spender: Address;
    readonly chainId: number;
    readonly generalAdapter1: Address;
    readonly permit2?: Address;
    readonly midnight?: Address;
    readonly midnightBundles?: Address;
    readonly supportedSpenders?: readonly (Address | undefined)[];
  }) {
    const supported = (
      params.supportedSpenders ?? [
        params.generalAdapter1,
        params.permit2,
        params.midnight,
        params.midnightBundles,
      ]
    )
      .filter((address) => address != null)
      .join('", "');
    super(
      `Requirement spender "${params.spender}" is not supported on chain "${params.chainId}". Use "${supported}".`,
    );
  }
}

/** Thrown when a Midnight authorization requirement targets an unsupported operator. */
export class UnsupportedMidnightAuthorizationTargetError extends Error {
  constructor(params: {
    readonly authorized: Address;
    readonly chainId: number;
    readonly supportedTargets: readonly Address[];
  }) {
    super(
      `Midnight authorization target "${params.authorized}" is not supported on chain "${params.chainId}". Use "${params.supportedTargets.join('", "')}".`,
    );
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
  }
}

/** Thrown when a slippage tolerance exceeds `MAX_SLIPPAGE_TOLERANCE` (10%). */
export class ExcessiveSlippageToleranceError extends Error {
  constructor(slippageTolerance: bigint) {
    super(
      `Slippage tolerance ${slippageTolerance} exceeds maximum allowed (10%)`,
    );
  }
}

/** Thrown when a VaultV2 force-withdraw or force-redeem call has no deallocations to perform. */
export class EmptyDeallocationsError extends Error {
  constructor(vault: Address) {
    super(`Deallocations list cannot be empty for vault: ${vault}`);
  }
}

/** Thrown when a deposit's amount differs from the amount the supplied permit / permit2 signature was issued for. */
export class DepositAmountMismatchError extends Error {
  constructor(depositAmount: bigint, signatureAmount: bigint) {
    super(
      `Deposit amount "${depositAmount}" does not match requirement signature amount "${signatureAmount}"`,
    );
  }
}

/** Thrown when a deposit's asset differs from the asset the supplied permit / permit2 signature was issued for. */
export class DepositAssetMismatchError extends Error {
  constructor(depositAsset: Address, signatureAsset: Address) {
    super(
      `Deposit asset "${depositAsset}" does not match requirement signature asset "${signatureAsset}"`,
    );
  }
}

/** Thrown when a deposit's owner differs from the owner the supplied permit / permit2 signature was issued for. */
export class DepositOwnerMismatchError extends Error {
  constructor(depositOwner: Address, signatureOwner: Address) {
    super(
      `Deposit owner "${depositOwner}" does not match requirement signature owner "${signatureOwner}"`,
    );
  }
}

/** Thrown when a deposit's spender differs from the spender the supplied permit / permit2 signature was issued for. */
export class DepositSpenderMismatchError extends Error {
  constructor(depositSpender: Address, signatureSpender: Address) {
    super(
      `Deposit spender "${depositSpender}" does not match requirement signature spender "${signatureSpender}"`,
    );
  }
}

/** Thrown when a `permit2` requirement signature is missing the `expiration` field. */
export class Permit2ExpirationMissingError extends Error {
  constructor() {
    super(
      'Requirement signature with action.type === "permit2" must include args.expiration. Re-sign using the permit2 flow.',
    );
  }
}

/** Thrown when a vault deposit uses `nativeAmount` but the vault asset is not the chain's wNative. */
export class NativeAmountOnNonWNativeVaultError extends Error {
  constructor(vaultAsset: Address, wNative: Address) {
    super(
      `Cannot use nativeAmount: vault asset ${vaultAsset} is not the wrapped native token ${wNative}`,
    );
  }
}

/** Thrown when a `nativeAmount` is supplied but the chain has no configured wNative address. */
export class ChainWNativeMissingError extends Error {
  constructor(chainId: number) {
    super(
      `Chain ${chainId} does not have a configured wrapped native token (wNative)`,
    );
  }
}

/** Thrown when a vault entity's address does not match the vault address embedded in the call's args. */
export class VaultAddressMismatchError extends Error {
  constructor(vaultAddress: Address, argsVaultAddress: Address) {
    super(
      `Vault address mismatch between vault: ${vaultAddress} and args: ${argsVaultAddress}`,
    );
  }
}

/** Thrown when an action uses `nativeAmount` but the target asset is not the chain's wNative. */
export class NativeAmountOnNonWNativeAssetError extends Error {
  constructor(asset: Address, wNative: Address) {
    super(
      `Cannot use nativeAmount: asset ${asset} is not the wrapped native token ${wNative}`,
    );
  }
}

/** @deprecated Use {@link NativeAmountOnNonWNativeAssetError}. */
export const NativeAmountOnNonWNativeCollateralError =
  NativeAmountOnNonWNativeAssetError;
export type NativeAmountOnNonWNativeCollateralError =
  NativeAmountOnNonWNativeAssetError;

/** Thrown when a borrow exceeds the LLTV-buffered safe maximum for the position. */
export class BorrowExceedsSafeLtvError extends Error {
  constructor(borrowAmount: bigint, maxSafeBorrow: bigint) {
    super(
      `Borrow amount ${borrowAmount} exceeds safe maximum ${maxSafeBorrow} (LLTV minus buffer). Reduce borrow or increase collateral.`,
    );
  }
}

/** Thrown when the market's oracle price is unavailable and position health cannot be validated. */
export class MissingMarketPriceError extends Error {
  constructor(market: string) {
    super(
      `Oracle price unavailable for market ${market}. Cannot validate position health.`,
    );
  }
}

/** Thrown when a `MarketParams.id` does not match the expected market id derived from the other fields. */
export class MarketIdMismatchError extends Error {
  constructor(marketId: string, expectedMarketId: string) {
    super(
      `Market ${marketId} does not match expected market ${expectedMarketId}`,
    );
  }
}

/** Thrown when an accrual position belongs to a different user than the one expected by the call. */
export class AccrualPositionUserMismatchError extends Error {
  constructor(positionUser: string, expectedUser: string) {
    super(
      `Accrual position user ${positionUser} does not match expected user ${expectedUser}`,
    );
  }
}

/**
 * Thrown when a reallocation has no withdrawals.
 *
 * @deprecated Vault V1 PublicAllocator support will be removed in the next major.
 */
export class EmptyReallocationWithdrawalsError extends Error {
  constructor(vault: string) {
    super(`Reallocation withdrawals list cannot be empty for vault: ${vault}`);
  }
}

/** Thrown when a Public Allocator source references the target Blue market. */
export class ReallocationWithdrawalOnTargetMarketError extends Error {
  constructor(vault: string, marketId: string) {
    super(
      `Reallocation withdrawal cannot include the target market ${marketId} for vault ${vault}.`,
    );
  }
}

/**
 * Thrown when a reallocation entry passed to a high-level Blue write is not a valid
 * {@link VaultV2BlueReallocation}: a non-object entry, or an entry carrying Vault V1
 * `withdrawals`/`fee` fields that high-level Blue writes no longer accept.
 *
 * @example
 * ```ts
 * import { InvalidReallocationShapeError } from "@morpho-org/morpho-sdk";
 *
 * const error = new InvalidReallocationShapeError();
 * ```
 */
export class InvalidReallocationShapeError extends Error {
  public constructor() {
    super(
      "Reallocation entry is not a valid Vault V2 reallocation. High-level Blue writes accept only VaultV2BlueReallocation entries (e.g. from getVaultV2BlueReallocations()); compose Vault V1 reallocations via low-level Bundler3 actions.",
    );
    this.name = "InvalidReallocationShapeError";
  }
}

/**
 * Thrown when one reallocation plan contains both Vault V1 and Vault V2 entries.
 *
 * @deprecated Vault V1/V2 mixed-plan support will be removed in the next major. Use Vault V2
 * reallocations.
 * @example
 * ```ts
 * import { MixedReallocationVersionsError } from "@morpho-org/morpho-sdk";
 *
 * const error = new MixedReallocationVersionsError();
 * ```
 */
export class MixedReallocationVersionsError extends Error {
  public constructor() {
    super(
      "Reallocation plans cannot mix Vault V1 and Vault V2 entries. Submit one version per transaction.",
    );
    this.name = "MixedReallocationVersionsError";
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

/**
 * Thrown when reallocation withdrawals within a vault are not strictly sorted by market id.
 *
 * @deprecated Vault V1 PublicAllocator support will be removed in the next major.
 */
export class UnsortedReallocationWithdrawalsError extends Error {
  constructor(vault: string, marketId: string) {
    super(
      `Reallocation withdrawals must be strictly sorted by market ID for vault ${vault}. Market ${marketId} is out of order.`,
    );
  }
}

/**
 * Thrown when a market repay in assets mode has `transferAmount !== amount + nativeAmount` — the
 * pre-resolved ERC-20 pull plus the wrapped native must equal the assets repaid, so the bundle
 * neither strands over-pulled loan tokens on `GeneralAdapter1` nor under-funds the repay.
 */
export class TransferAmountNotEqualToAssetsError extends Error {
  constructor(params: {
    transferAmount: bigint;
    assets: bigint;
    market: string;
  }) {
    super(
      `Transfer amount ${params.transferAmount} is not equal to repay assets ${params.assets} for market: ${params.market}. In assets mode, transferAmount must equal amount + nativeAmount.`,
    );
  }
}

/** Thrown when a market repay specifies both `assets` and `shares` as non-zero (modes are mutually exclusive). */
export class MutuallyExclusiveRepayAmountsError extends Error {
  constructor(market: string) {
    super(
      `Exactly one of assets or shares must be non-zero for market: ${market}. Both were provided.`,
    );
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
  }
}

/** Thrown when a share-amount conversion would divide by zero (the market has no shares of the relevant kind). */
export class ShareDivideByZeroError extends Error {
  constructor(market: string) {
    super(`Share divide by zero error for market: ${market}`);
  }
}

/** Thrown when a repay amount in assets exceeds the borrower's outstanding debt. */
export class RepayExceedsDebtError extends Error {
  constructor(params: { repayAmount: bigint; debt: bigint; market: string }) {
    super(
      `Repay amount ${params.repayAmount} exceeds outstanding debt ${params.debt} for market: ${params.market}`,
    );
  }
}

/** Thrown when EIP-712 signature verification fails (the signed data does not match the expected signer). */
export class InvalidSignatureError extends Error {
  constructor() {
    super(
      "Signature verification failed: the signed data does not match the expected signer address",
    );
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
  }
}

/**
 * Thrown when a vault selected for reallocation has no configured `PublicAllocator`.
 *
 * @deprecated Vault V1 PublicAllocator support will be removed in the next major.
 */
export class MissingPublicAllocatorConfigError extends Error {
  constructor(vault: string) {
    super(
      `Vault ${vault} has no public allocator configured but was selected for reallocation`,
    );
  }
}

/**
 * Thrown when a reallocation attempts to use a disabled vault market.
 *
 * @deprecated Vault V1 PublicAllocator support will be removed in the next major.
 */
export class DisabledReallocationMarketError extends Error {
  constructor(
    public readonly vault: Address,
    public readonly marketId: MarketId,
  ) {
    super(
      `Vault ${vault} has disabled market ${marketId}. Remove it from reallocations or re-enable the market before reallocating.`,
    );
  }
}

/**
 * Thrown when shared liquidity selected by a Vault V1 or Vault V2 reallocation planner cannot
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
  }
}

/** Thrown when reallocation state does not contain a requested market. */
export class UnknownReallocationMarketError extends UnknownDataError {
  /**
   * @param marketId - Missing market id.
   */
  constructor(public readonly marketId: MarketId) {
    super(`unknown reallocation market "${marketId}"`);
  }
}

/** Thrown when reallocation state does not contain a requested vault. */
export class UnknownReallocationVaultError extends UnknownDataError {
  /**
   * @param vault - Missing vault address.
   */
  constructor(public readonly vault: Address) {
    super(`unknown reallocation vault "${vault}"`);
  }
}

/**
 * Thrown when reallocation state does not contain a requested vault-market config.
 *
 * @deprecated Vault V1 shared-liquidity planning will be removed in the next major.
 */
export class UnknownReallocationVaultMarketConfigError extends UnknownDataError {
  /**
   * @param vault - Vault address for the missing config.
   * @param marketId - Market id for the missing config.
   */
  constructor(
    public readonly vault: Address,
    public readonly marketId: MarketId,
  ) {
    super(
      `unknown reallocation config for vault "${vault}" on market "${marketId}"`,
    );
  }
}

/**
 * Thrown when reallocation state does not contain a requested market position.
 *
 * @deprecated Vault V1 shared-liquidity planning will be removed in the next major.
 */
export class UnknownReallocationPositionError extends UnknownDataError {
  /**
   * @param user - Position owner address.
   * @param marketId - Market id for the missing position.
   */
  constructor(
    public readonly user: Address,
    public readonly marketId: MarketId,
  ) {
    super(`unknown reallocation position of "${user}" on market "${marketId}"`);
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
  }
}

/** Thrown when Vault V2 reallocation state lacks the vault-wide allocator configuration. */
export class UnknownReallocationPublicAllocatorConfigError extends UnknownDataError {
  /** @param vault - Vault V2 address with missing allocator configuration. */
  constructor(public readonly vault: Address) {
    super(`unknown public allocator configuration for vault "${vault}"`);
  }
}

/** Thrown when Vault V2 reallocation state lacks the fetched active-adapter set. */
export class UnknownReallocationActiveAdaptersError extends UnknownDataError {
  /** @param vault - Vault V2 address with missing active-adapter state. */
  constructor(public readonly vault: Address) {
    super(`unknown active adapters for reallocation vault "${vault}"`);
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
  }
}

/** Thrown when a Midnight amount exceeds the maximum offer-cap value accepted onchain. */
export class MidnightAmountExceedsMaxOfferCapError extends Error {
  constructor(params: {
    readonly label: string;
    readonly amount: bigint;
    readonly maxOfferCap: bigint;
  }) {
    super(
      `Midnight ${params.label} "${params.amount}" exceeds maximum offer cap "${params.maxOfferCap}". Reduce the amount to the maximum offer cap or less.`,
    );
  }
}

/** Thrown when a Midnight flow needs at least one takeable offer. */
export class EmptyMidnightTakeableOffersError extends Error {
  constructor() {
    super(
      "Midnight takeable offers cannot be empty. Refresh the quote and try again.",
    );
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
  }
}

/** Thrown when a Midnight offer tree uses an unsupported ratifier address. */
export class UnknownMidnightRatifierError extends Error {
  constructor(params: {
    ratifier: Address;
    ecrecoverRatifier: Address;
    setterRatifier: Address;
  }) {
    super(
      `Midnight offer tree uses ratifier "${params.ratifier}", expected "${params.ecrecoverRatifier}" or "${params.setterRatifier}". Rebuild the tree with a supported ratifier.`,
    );
  }
}

/** Thrown when a Midnight Ecrecover maker flow builds the submit transaction before signing. */
export class MissingMidnightOfferRootSignatureError extends Error {
  constructor() {
    super(
      "Midnight offer root signature is missing. Sign the offer-root requirement before building the submit transaction.",
    );
  }
}

/** Thrown when a Midnight offer-root signature does not match the prepared tree root. */
export class MidnightOfferRootMismatchError extends Error {
  constructor(params: { expectedRoot: string; actualRoot: string }) {
    super(
      `Midnight offer root mismatch: expected "${params.expectedRoot}", got "${params.actualRoot}". Rebuild the flow and sign again.`,
    );
  }
}

/** Thrown when a Midnight offer-root signature was produced by another maker account. */
export class MidnightOfferRootOwnerMismatchError extends Error {
  constructor(params: { expectedOwner: Address; actualOwner: Address }) {
    super(
      `Midnight offer root owner mismatch: expected "${params.expectedOwner}", got "${params.actualOwner}". Rebuild the flow and sign again.`,
    );
  }
}

/** Thrown when a Midnight offer-root signature targets another ratifier. */
export class MidnightOfferRootRatifierMismatchError extends Error {
  constructor(params: { expectedRatifier: Address; actualRatifier: Address }) {
    super(
      `Midnight offer root ratifier mismatch: expected "${params.expectedRatifier}", got "${params.actualRatifier}". Rebuild the flow and sign again.`,
    );
  }
}

/** Thrown when a Midnight offer-root signature was produced for another offer count. */
export class MidnightOfferRootOfferCountMismatchError extends Error {
  constructor(params: { expectedOffers: number; actualOffers: number }) {
    super(
      `Midnight offer root offer-count mismatch: expected "${params.expectedOffers}", got "${params.actualOffers}". Rebuild the flow and sign again.`,
    );
  }
}

/** Thrown when a Midnight offer-root signature was not prepared by this maker flow. */
export class UnpreparedMidnightOfferRootSignatureError extends Error {
  constructor() {
    super(
      "Midnight offer root signature was not prepared for this offer tree. Sign this flow's offer-root requirement before building the submit transaction.",
    );
  }
}

/** Thrown when a Midnight redeem flow finds no credit units for the user. */
export class NoMidnightCreditToRedeemError extends Error {
  constructor(market: string) {
    super(`No Midnight credit is available to redeem for market "${market}".`);
  }
}

/** Thrown when a Midnight redeem amount exceeds the user's accrued credit. */
export class MidnightRedeemExceedsCreditError extends Error {
  constructor(params: { market: string; units: bigint; credit: bigint }) {
    super(
      `Midnight redeem amount exceeds position credit on market "${params.market}": units "${params.units}", credit "${params.credit}". Redeem less or refresh the position data.`,
    );
  }
}

/** Thrown when a Midnight redeem amount exceeds the market's currently withdrawable liquidity. */
export class InsufficientMidnightWithdrawableLiquidityError extends Error {
  constructor(params: { market: string; units: bigint; withdrawable: bigint }) {
    super(
      `Midnight withdrawable liquidity is insufficient on market "${params.market}": units "${params.units}", withdrawable "${params.withdrawable}". Try again later or redeem less.`,
    );
  }
}

/** Thrown when a loan-asset withdraw specifies both `assets` and `shares` as non-zero (modes are mutually exclusive). */
export class MutuallyExclusiveWithdrawAmountsError extends Error {
  constructor(market: string) {
    super(
      `Exactly one of assets or shares must be non-zero for market: ${market}. Both were provided.`,
    );
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
  }
}

/**
 * Thrown when a Vault V1 or Vault V2 reallocation planner receives a withdraw `amount` greater
 * than the target market's current `totalSupplyAssets` — the post-withdraw
 * supply would be negative, making the on-chain `morphoWithdraw` revert
 * regardless of any reallocation. Caught here so callers do not pay
 * PublicAllocator fees on an unreachable operation.
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
  }
}

/** Thrown when a vault migration's source vault asset differs from the target vault asset. */
export class VaultAssetMismatchError extends Error {
  constructor(sourceAsset: Address, targetAsset: Address) {
    super(
      `Source vault asset ${sourceAsset} does not match target vault asset ${targetAsset}`,
    );
  }
}

/** Thrown when a refinance specifies both `borrowAssets` and `borrowShares` as non-zero (modes are mutually exclusive). */
export class BorrowAmountAndSharesExclusiveError extends Error {
  constructor(market: string) {
    super(
      `Exactly one of borrowAssets or borrowShares must be non-zero for market: ${market}. Both were provided.`,
    );
  }
}

/** Thrown when a refinance has identical source and target market ids (a refinance to the same market is a costly no-op). */
export class RefinanceSameMarketError extends Error {
  constructor(market: string) {
    super(
      `Refinance source and target market ${market} are identical. Refinance requires a different target market.`,
    );
  }
}

/** Thrown when a refinance's source and target markets do not share the same loan or collateral token. */
export class RefinanceTokenMismatchError extends Error {
  constructor(sourceMarket: string, targetMarket: string) {
    super(
      `Refinance source market ${sourceMarket} and target market ${targetMarket} must share the same loanToken and collateralToken.`,
    );
  }
}

/** Thrown when a refinance's `collateralAmount` exceeds the source position's available collateral. */
export class RefinanceExceedsCollateralError extends Error {
  public readonly market: string;
  public readonly requested: bigint;
  public readonly available: bigint;

  constructor(params: {
    market: string;
    requested: bigint;
    available: bigint;
  }) {
    super(
      `Refinance collateral amount ${params.requested} exceeds available collateral ${params.available} for market: ${params.market}`,
    );
    this.market = params.market;
    this.requested = params.requested;
    this.available = params.available;
  }
}

/** Thrown when a refinance's `borrowShares` exceeds the source position's outstanding borrow shares. */
export class RefinanceExceedsBorrowSharesError extends Error {
  public readonly market: string;
  public readonly requested: bigint;
  public readonly available: bigint;

  constructor(params: {
    market: string;
    requested: bigint;
    available: bigint;
  }) {
    super(
      `Refinance borrow shares ${params.requested} exceed outstanding borrow shares ${params.available} for market: ${params.market}`,
    );
    this.market = params.market;
    this.requested = params.requested;
    this.available = params.available;
  }
}

/** Thrown when a refinance's `borrowAssets` exceeds the source position's outstanding debt assets. */
export class RefinanceExceedsBorrowAssetsError extends Error {
  public readonly market: string;
  public readonly requested: bigint;
  public readonly available: bigint;

  constructor(params: {
    market: string;
    requested: bigint;
    available: bigint;
  }) {
    super(
      `Refinance borrow assets ${params.requested} exceed outstanding debt assets ${params.available} for market: ${params.market}`,
    );
    this.market = params.market;
    this.requested = params.requested;
    this.available = params.available;
  }
}

/** Thrown when a refinance in shares mode (`borrowShares > 0n`) omits the `borrowAssets` overshoot for the target borrow leg. */
export class RefinanceSharesMissingBorrowAssetsError extends Error {
  constructor(market: string) {
    super(
      `Refinance shares mode requires a positive borrowAssets overshoot for the target borrow leg (market: ${market}).`,
    );
  }
}
