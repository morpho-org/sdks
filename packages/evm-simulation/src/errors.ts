import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address, Hash, Hex } from "viem";
import type { OperationType } from "./limits.js";
import type { SimulationMode } from "./params.js";

/** Stable error codes thrown by this package, part of the public API. */
export const SIMULATION_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNSUPPORTED_CHAIN",
  "EXTERNAL_SERVICE_ERROR",
  "SIMULATION_REVERTED",
  "BLACKLIST_ERROR",
  "UNSUPPORTED_OPERATION",
  "PROTOCOL_BINDING_MISMATCH",
  "UNSUPPORTED_VERIFICATION_FEATURE",
  "INVALID_SIMULATION_RESPONSE",
  "MISSING_VERIFICATION_EVIDENCE",
  "AUTHORIZATION_REQUEST_MISMATCH",
  "ASSET_CHANGE_MISMATCH",
  "PERMISSION_CHANGE_MISMATCH",
  "STATE_CHANGE_MISMATCH",
  "MARKET_CONSTRAINT_VIOLATION",
  "SLIPPAGE_LIMIT_EXCEEDED",
  "FEE_MISMATCH",
  "CONSUMER_LIMIT_VIOLATION",
  "UNEXPECTED_SIMULATION_ERROR",
] as const;

/** Stable string discriminator for log aggregation and external mapping. */
export type SimulationErrorCode = (typeof SIMULATION_ERROR_CODES)[number];

/** Morpho Blue `require` revert strings (Morpho Blue `ErrorsLib`). */
export const BLUE_REVERT_REASONS = [
  "not owner",
  "max LLTV exceeded",
  "max fee exceeded",
  "already set",
  "IRM not enabled",
  "LLTV not enabled",
  "market already created",
  "no code",
  "market not created",
  "inconsistent input",
  "zero assets",
  "zero address",
  "unauthorized",
  "insufficient collateral",
  "insufficient liquidity",
  "position is healthy",
  "invalid signature",
  "signature expired",
  "invalid nonce",
  "transfer reverted",
  "transfer returned false",
  "transferFrom reverted",
  "transferFrom returned false",
  "max uint128 exceeded",
] as const;

/** Vault V1 (MetaMorpho) custom error names, including inherited OpenZeppelin ERC-20/4626/2612 errors (mirrors `metaMorphoAbi`). */
export const VAULT_V1_REVERT_REASONS = [
  "AboveMaxTimelock",
  "AddressEmptyCode",
  "AddressInsufficientBalance",
  "AllCapsReached",
  "AlreadyPending",
  "AlreadySet",
  "BelowMinTimelock",
  "DuplicateMarket",
  "ECDSAInvalidSignature",
  "ECDSAInvalidSignatureLength",
  "ECDSAInvalidSignatureS",
  "ERC20InsufficientAllowance",
  "ERC20InsufficientBalance",
  "ERC20InvalidApprover",
  "ERC20InvalidReceiver",
  "ERC20InvalidSender",
  "ERC20InvalidSpender",
  "ERC2612ExpiredSignature",
  "ERC2612InvalidSigner",
  "ERC4626ExceededMaxDeposit",
  "ERC4626ExceededMaxMint",
  "ERC4626ExceededMaxRedeem",
  "ERC4626ExceededMaxWithdraw",
  "FailedInnerCall",
  "InconsistentAsset",
  "InconsistentReallocation",
  "InvalidAccountNonce",
  "InvalidMarketRemovalNonZeroCap",
  "InvalidMarketRemovalNonZeroSupply",
  "InvalidMarketRemovalTimelockNotElapsed",
  "InvalidShortString",
  "MarketNotCreated",
  "MarketNotEnabled",
  "MathOverflowedMulDiv",
  "MaxFeeExceeded",
  "MaxQueueLengthExceeded",
  "NoPendingValue",
  "NonZeroCap",
  "NotAllocatorRole",
  "NotCuratorNorGuardianRole",
  "NotCuratorRole",
  "NotEnoughLiquidity",
  "NotGuardianRole",
  "OwnableInvalidOwner",
  "OwnableUnauthorizedAccount",
  "PendingCap",
  "PendingRemoval",
  "SafeCastOverflowedUintDowncast",
  "SafeERC20FailedOperation",
  "StringTooLong",
  "SupplyCapExceeded",
  "TimelockNotElapsed",
  "UnauthorizedMarket",
  "ZeroAddress",
  "ZeroFeeRecipient",
] as const;

/** Vault V2 custom error names (mirrors `vaultV2Abi`). */
export const VAULT_V2_REVERT_REASONS = [
  "Abdicated",
  "AbsoluteCapExceeded",
  "AbsoluteCapNotDecreasing",
  "AbsoluteCapNotIncreasing",
  "AutomaticallyTimelocked",
  "CannotReceiveAssets",
  "CannotReceiveShares",
  "CannotSendAssets",
  "CannotSendShares",
  "CastOverflow",
  "DataAlreadyPending",
  "DataNotTimelocked",
  "FeeInvariantBroken",
  "FeeTooHigh",
  "InvalidSigner",
  "MaxRateTooHigh",
  "NoCode",
  "NotAdapter",
  "NotInAdapterRegistry",
  "PenaltyTooHigh",
  "PermitDeadlineExpired",
  "RelativeCapAboveOne",
  "RelativeCapExceeded",
  "RelativeCapNotDecreasing",
  "RelativeCapNotIncreasing",
  "TimelockNotDecreasing",
  "TimelockNotExpired",
  "TimelockNotIncreasing",
  "TransferFromReturnedFalse",
  "TransferFromReverted",
  "TransferReturnedFalse",
  "TransferReverted",
  "Unauthorized",
  "ZeroAbsoluteCap",
  "ZeroAddress",
  "ZeroAllocation",
] as const;

/** Vault V2 adapter custom error names (union of the MorphoVaultV1 and MorphoMarketV1/V2 adapter ABIs). */
export const VAULT_V2_ADAPTER_REVERT_REASONS = [
  "Abdicated",
  "ApproveReturnedFalse",
  "ApproveReverted",
  "AssetMismatch",
  "AutomaticallyTimelocked",
  "CannotSkimMorphoVaultV1Shares",
  "DataAlreadyPending",
  "DataNotTimelocked",
  "InvalidData",
  "IrmMismatch",
  "LoanAssetMismatch",
  "NoCode",
  "NotAuthorized",
  "SharePriceAboveOne",
  "TimelockNotDecreasing",
  "TimelockNotExpired",
  "TimelockNotIncreasing",
  "TransferReturnedFalse",
  "TransferReverted",
  "Unauthorized",
] as const;

/** VaultBundlesV1 custom error names (mirrors `vaultBundlesV1Abi`). */
export const VAULT_BUNDLES_V1_REVERT_REASONS = [
  "AlreadyInitiated",
  "DeadlinePassed",
  "InconsistentAssets",
  "NotExactlyOneZero",
  "PctExceeded",
  "SlippageExceeded",
] as const;

/** VaultExitBundlesV1 custom error names (mirrors `vaultExitBundlesV1Abi`). */
export const VAULT_EXIT_BUNDLES_V1_REVERT_REASONS = [
  "AdapterNotPartOfVault",
  "AlreadyInitiated",
  "ApproveReturnedFalse",
  "DeadlinePassed",
  "InvalidAdaptersLength",
  "MorphoMismatch",
  "NoCode",
  "PctExceeded",
  "SlippageExceeded",
  "TransferReturnedFalse",
  "UnauthorizedCallback",
] as const;

/** Permit2 custom error names (mirrors `permit2Abi`). */
export const PERMIT2_REVERT_REASONS = [
  "AllowanceExpired",
  "ExcessiveInvalidation",
  "InsufficientAllowance",
  "InvalidAmount",
  "InvalidContractSignature",
  "InvalidNonce",
  "InvalidSignature",
  "InvalidSignatureLength",
  "InvalidSigner",
  "LengthMismatch",
  "SignatureExpired",
] as const;

/** Contracts whose reverts are decoded by name. */
type CatalogedRevert<
  contract extends string,
  names extends readonly string[],
> = {
  readonly contract: contract;
  readonly name: names[number];
  readonly args?: readonly unknown[];
};

/**
 * Decoded revert of a Morpho contract, keyed by the contract that raised it.
 * `name` is the `require` string for Blue and the custom error name elsewhere;
 * `args` are the decoded custom-error arguments (e.g. the market `id` of
 * `SupplyCapExceeded(bytes32 id)`). Catalogs are local copies of the pinned
 * ABIs (tests assert equality) so upstream ABI churn cannot change this union.
 * `BlueBundlesV1` and `VaultV2BluePublicAllocator` declare no errors in their
 * pinned ABIs, so their reverts carry the raw `name`/`data` only.
 */
export type SimulationRevertReason =
  | {
      readonly contract: "blue";
      readonly name: (typeof BLUE_REVERT_REASONS)[number];
    }
  | CatalogedRevert<"vaultV1", typeof VAULT_V1_REVERT_REASONS>
  | CatalogedRevert<"vaultV2", typeof VAULT_V2_REVERT_REASONS>
  | CatalogedRevert<"vaultV2Adapter", typeof VAULT_V2_ADAPTER_REVERT_REASONS>
  | CatalogedRevert<"vaultBundlesV1", typeof VAULT_BUNDLES_V1_REVERT_REASONS>
  | CatalogedRevert<
      "vaultExitBundlesV1",
      typeof VAULT_EXIT_BUNDLES_V1_REVERT_REASONS
    >
  | CatalogedRevert<"permit2", typeof PERMIT2_REVERT_REASONS>
  | {
      readonly contract: "blueBundlesV1" | "bluePublicAllocator" | "other";
      readonly name?: string;
      readonly args?: readonly unknown[];
      readonly data?: Hex;
    };

/**
 * Where and why a simulation failed. Never contains signatures, RPC URLs,
 * credentials, raw calldata or raw causes (`cause` stays on the error).
 */
export interface SimulationErrorContext {
  /** Request mode the failure happened in. */
  readonly mode: SimulationMode;
  /** Chain the request targeted. */
  readonly chainId: number;
  /** Unset when the failure happens before the block is resolved. */
  readonly blockNumber?: bigint;
  /** Decoded operation being verified, when the failure is operation-scoped. */
  readonly operation?: OperationType;
  /** Blue market the operation acts on. */
  readonly marketId?: MarketId;
  /** Vault the operation acts on. */
  readonly vault?: Address;
  /** Vault V2 adapter the operation routes through. */
  readonly adapter?: Address;
  /** Token whose balance, allowance or transfer was checked. */
  readonly token?: Address;
  /** Account whose position, balance or authorization was checked (usually the sender). */
  readonly account?: Address;
  /** Spender or operator granted by the checked permission. */
  readonly spender?: Address;
  /** Name of the checked field; its suffix gives the unit (e.g. "maxLtvAfterWad"). */
  readonly field?: string;
  /** Bound or value `field` was checked against; 32-byte hashes only, never calldata or signatures. */
  readonly expected?: bigint | boolean | Address | Hash;
  /** Value observed in the simulation, same domain as `expected`. */
  readonly observed?: bigint | boolean | Address | Hash;
  /** Index into the caller's `transactions`. */
  readonly failedTransactionIndex?: number;
  /** Index into `authorizations`. */
  readonly authorizationIndex?: number;
  /** Index into that authorization's preparation calls. */
  readonly preparationCallIndex?: number;
}

/**
 * Base class for every error this package throws. Transport-agnostic — no HTTP status codes.
 * Consumers pattern-match with `instanceof` on the concrete subclass.
 */
export abstract class SimulationPackageError extends Error {
  /** Stable string discriminator for log aggregation and external mapping. */
  abstract readonly code: SimulationErrorCode;

  /** Frozen copy of the failure context, when one was supplied. */
  readonly context?: SimulationErrorContext;

  constructor(
    message: string,
    options?: ErrorOptions & { context?: SimulationErrorContext },
  ) {
    const { context, ...errorOptions } = options ?? {};
    super(message, errorOptions);
    this.name = this.constructor.name;
    if (context !== undefined) {
      this.context = Object.freeze({ ...context });
    }
  }
}

/** Transaction would revert on-chain. Not bypassable. */
export class SimulationRevertedError extends SimulationPackageError {
  readonly code = "SIMULATION_REVERTED";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    /** Raw revert string as reported by the backend, when any. */
    public readonly reason: string | undefined,
    public readonly details?: unknown,
    /** Decoded Morpho revert; undefined when the revert data could not be decoded. */
    public readonly revert?: SimulationRevertReason,
    /** Which transaction/authorization reverted and the operation it belonged to. */
    context?: SimulationErrorContext,
  ) {
    super(
      reason ?? "Transaction simulation reverted",
      details instanceof Error ? { cause: details, context } : { context },
    );
  }
}

/** Per-asset net retained amount keyed by restricted contract and token; `netRetained` is a decimal string. */
export interface RetainedAsset {
  readonly address: string | undefined;
  readonly token: string | undefined;
  readonly netRetained: string;
}

/**
 * Thrown when net value above the dust threshold is retained by a restricted bundles contract
 * (VaultExitBundlesV1, VaultBundlesV1, BlueBundlesV1 or MidnightBundlesV1) after simulation;
 * pass-through flows and net outflows are allowed. Never bypassable.
 */
export class BlacklistViolationError extends SimulationPackageError {
  readonly code = "BLACKLIST_ERROR";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    /** Per-asset net retained amounts keyed by restricted contract and token. */
    public readonly assetChanges?: readonly RetainedAsset[],
    context?: SimulationErrorContext,
  ) {
    super(message, { context });
  }
}

/** RPC service is down or unreachable. Bypassable — user can proceed. */
export class ExternalServiceError extends SimulationPackageError {
  readonly code = "EXTERNAL_SERVICE_ERROR";
}

/** Bad input to the simulation functions. Not bypassable. */
export class SimulationValidationError extends SimulationPackageError {
  readonly code = "VALIDATION_ERROR";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    public readonly fieldErrors?: string[],
    context?: SimulationErrorContext,
  ) {
    super(message, { context });
  }
}

/** Chain ID not configured for any simulation method. Not bypassable. */
export class UnsupportedChainError extends SimulationPackageError {
  readonly code = "UNSUPPORTED_CHAIN";

  constructor(
    public readonly chainId: number,
    context?: SimulationErrorContext,
  ) {
    super(`Chain ${chainId} is not configured for simulation`, { context });
  }
}

/** Base for verification failures: the context is required and carries where the check failed. */
export abstract class SimulationVerificationError extends SimulationPackageError {
  declare readonly context: SimulationErrorContext;

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, { ...options, context });
  }
}

/** A decoded transaction maps to no supported operation. */
export class UnsupportedOperationError extends SimulationVerificationError {
  readonly code = "UNSUPPORTED_OPERATION";
}

/** An operation does not match the protocol entity it was bound to. */
export class ProtocolBindingMismatchError extends SimulationVerificationError {
  readonly code = "PROTOCOL_BINDING_MISMATCH";
}

/** The request requires a verification feature this version does not support. */
export class UnsupportedVerificationFeatureError extends SimulationVerificationError {
  readonly code = "UNSUPPORTED_VERIFICATION_FEATURE";
}

/** The simulation backend returned a response that cannot be parsed. */
export class InvalidSimulationResponseError extends SimulationVerificationError {
  readonly code = "INVALID_SIMULATION_RESPONSE";
}

/** State needed to verify an operation could not be fetched or derived. */
export class MissingVerificationEvidenceError extends SimulationVerificationError {
  readonly code = "MISSING_VERIFICATION_EVIDENCE";
}

/** A pending authorization does not match the request it was prepared for. */
export class AuthorizationRequestMismatchError extends SimulationVerificationError {
  readonly code = "AUTHORIZATION_REQUEST_MISMATCH";
}

/** An observed asset change violates the expected bounds. */
export class AssetChangeMismatchError extends SimulationVerificationError {
  readonly code = "ASSET_CHANGE_MISMATCH";
}

/** An observed permission change (allowance or authorization) violates the expected bounds. */
export class PermissionChangeMismatchError extends SimulationVerificationError {
  readonly code = "PERMISSION_CHANGE_MISMATCH";
}

/** An observed state change violates the expected bounds. */
export class StateChangeMismatchError extends SimulationVerificationError {
  readonly code = "STATE_CHANGE_MISMATCH";
}

/** An operation left a market outside its allowed constraints. */
export class MarketConstraintViolationError extends SimulationVerificationError {
  readonly code = "MARKET_CONSTRAINT_VIOLATION";
}

/** An asset/share conversion exceeded the allowed slippage. */
export class SlippageLimitExceededError extends SimulationVerificationError {
  readonly code = "SLIPPAGE_LIMIT_EXCEEDED";
}

/** An observed fee differs from the expected amount. */
export class FeeMismatchError extends SimulationVerificationError {
  readonly code = "FEE_MISMATCH";
}

/** A consumer-supplied limit was violated. */
export class ConsumerLimitViolationError extends SimulationVerificationError {
  readonly code = "CONSUMER_LIMIT_VIOLATION";
}

/** The simulation failed for a reason that fits no other code. */
export class UnexpectedSimulationError extends SimulationVerificationError {
  readonly code = "UNEXPECTED_SIMULATION_ERROR";
}

/** What `isSimulationPackageError` guarantees: the serializable core of a `SimulationPackageError`. */
export interface SimulationPackageErrorLike {
  readonly name: string;
  readonly message: string;
  readonly code: SimulationErrorCode;
  readonly context?: SimulationErrorContext;
}

/**
 * Structural guard for consumers where `instanceof` fails across bundles or
 * after (de)serialization.
 *
 * @param value - Anything caught or received.
 * @returns `true` for `SimulationPackageError` instances and for objects
 *   carrying `name`/`message` strings, a known `code` and an absent or
 *   well-formed `context` (`mode` and numeric `chainId` present).
 * @example
 * ```ts
 * import { isSimulationPackageError, simulate } from "@morpho-org/evm-simulation";
 *
 * const config = { chains: { 1: { simulateV1Url: "https://rpc.example" } } };
 * try {
 *   await simulate(config, { chainId: 1, transactions: [] });
 * } catch (e) {
 *   if (!isSimulationPackageError(e)) throw e;
 *   if (e.code === "SIMULATION_REVERTED") console.log(e.context?.failedTransactionIndex);
 * }
 * ```
 */
export function isSimulationPackageError(
  value: unknown,
): value is SimulationPackageErrorLike {
  if (value instanceof SimulationPackageError) return true;
  if (typeof value !== "object" || value === null) return false;
  const { name, message, code, context } = value as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    context?: unknown;
  };
  if (typeof name !== "string" || typeof message !== "string") return false;
  if (
    typeof code !== "string" ||
    !(SIMULATION_ERROR_CODES as readonly string[]).includes(code)
  )
    return false;
  if (context === undefined) return true;
  if (typeof context !== "object" || context === null || Array.isArray(context))
    return false;
  const { mode, chainId } = context as { mode?: unknown; chainId?: unknown };
  return (
    (mode === "preview" || mode === "final") && typeof chainId === "number"
  );
}
