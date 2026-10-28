import type { Address, Hex } from "viem";
import type { OperationType, SlippageQuote } from "./limits.js";
import type { Assertion, LogAssertion, RawLog } from "./types.js";

/** Stable error codes thrown by this package, part of the public API. */
export const SIMULATION_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNSUPPORTED_CHAIN",
  "RPC_TRANSPORT_ERROR",
  "SIMULATION_REVERTED",
  "SIMULATION_ASSERT_FAILED",
  "BLACKLIST_ERROR",
  "UNSUPPORTED_OPERATION",
  "INVALID_SIMULATION_RESPONSE",
  "SLIPPAGE_CHECK_UNAVAILABLE",
  "AUTHORIZATION_REQUEST_MISMATCH",
  "CONSUMER_LIMIT_VIOLATION",
  "UNEXPECTED_SIMULATION_ERROR",
  "LIMIT_ACCOUNT_MISMATCH",
  "MISSING_EXPECTED_QUOTE",
  "AMBIGUOUS_EXPECTED_QUOTE",
  "UNSUPPORTED_LIMIT_ACTION",
] as const;

/** Stable string discriminator for log aggregation and external mapping. */
export type SimulationErrorCode = (typeof SIMULATION_ERROR_CODES)[number];

/**
 * Base class for SDK failures, including wrapped RPC errors. Transport-agnostic — no HTTP status codes.
 * Consumers pattern-match with `instanceof` on the concrete subclass.
 */
export abstract class SimulationPackageError extends Error {
  /** Stable string discriminator for log aggregation and external mapping. */
  abstract readonly code: SimulationErrorCode;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * A preparation call, transaction, or bundle reverted. Never bypassable.
 * Read `message` for the decoded error and every argument; use `revertData`
 * with a contract ABI for programmatic inspection. Messages are not stable codes.
 *
 * @example
 * ```ts
 * import { SimulationRevertedError } from "@morpho-org/evm-simulation";
 *
 * const error = new SimulationRevertedError("Transaction 0 reverted", "0xdeadbeef");
 * console.log(error.code); // "SIMULATION_REVERTED"
 * console.log(error.message, error.revertData);
 * ```
 */
export class SimulationRevertedError extends SimulationPackageError {
  override readonly name = "SimulationRevertedError";
  readonly code = "SIMULATION_REVERTED";

  /** Zero-based index in the caller's transactions; absent for preparation or node-level reverts. */
  readonly transactionIndex?: number;

  /**
   * Preserve the readable explanation, original revert bytes and optional cause.
   * @param message - Human-readable failure, including decoded arguments when available.
   * @param revertData - Exact node-returned revert bytes; absent when unavailable.
   * @param options - Original cause and optional zero-based user transaction index.
   */
  // biome-ignore lint/complexity/useMaxParams: approved public error constructor signature
  constructor(
    message: string,
    public readonly revertData?: Hex,
    options?: ErrorOptions & { readonly transactionIndex?: number },
  ) {
    super(message, options);
    this.transactionIndex = options?.transactionIndex;
  }
}

/**
 * A caller-supplied `assertBefore`/`assertAfter` check did not hold on simulated
 * state or its read reverted. The error includes a copy of the caller's
 * assertion (`to`, `data`, and `check`) and the read's raw return or revert data.
 *
 * @example
 * ```ts
 * import {
 *   nativeBalanceAssertion,
 *   SimulationAssertError,
 * } from "@morpho-org/evm-simulation";
 * import { zeroAddress } from "viem";
 *
 * const error = new SimulationAssertError("Native balance is below the minimum", {
 *   transactionIndex: 0,
 *   phase: "before",
 *   assertionIndex: 0,
 *   assertion: nativeBalanceAssertion({ account: zeroAddress, min: 1n }),
 *   returnData: "0x",
 * });
 * console.log(error.code); // "SIMULATION_ASSERT_FAILED"
 * console.log(error.phase, error.returnData); // "before", "0x"
 * ```
 */
export class SimulationAssertError extends SimulationPackageError {
  override readonly name = "SimulationAssertError";
  readonly code = "SIMULATION_ASSERT_FAILED";
  /** Zero-based index in the caller's transactions. */
  readonly transactionIndex: number;
  /** Whether the check ran before or after that transaction. */
  readonly phase: "before" | "after";
  /** Index in that transaction's `assertBefore` or `assertAfter` list. */
  readonly assertionIndex: number;
  /** A copy of the caller's assertion (`to`, `data`, and `check`). */
  readonly assertion: Assertion;
  /** Return data from the simulated assertion call, or revert data if it reverted. */
  readonly returnData: Hex;

  /**
   * Preserve the failed assertion, its transaction coordinates, and raw data.
   * @param message - Human-readable assertion failure or read-revert explanation.
   * @param failure - Failed assertion, its transaction coordinates, and raw call data.
   * @param failure.transactionIndex - Zero-based index in the caller's transactions.
   * @param failure.phase - Whether the assertion ran before or after the transaction.
   * @param failure.assertionIndex - Zero-based index in that phase's assertion list.
   * @param failure.assertion - Copy of the caller's assertion (`to`, `data`, and `check`).
   * @param failure.returnData - Raw return data, or revert data if the read reverted.
   * @param options - Optional original error cause.
   * @param options.cause - Optional error thrown by `check` or node error from a reverted read.
   */
  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    failure: {
      readonly transactionIndex: number;
      readonly phase: "before" | "after";
      readonly assertionIndex: number;
      readonly assertion: Assertion;
      readonly returnData: Hex;
    },
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.transactionIndex = failure.transactionIndex;
    this.phase = failure.phase;
    this.assertionIndex = failure.assertionIndex;
    this.assertion = failure.assertion;
    this.returnData = failure.returnData;
  }
}

/**
 * A caller-supplied `assertLogs` check did not hold for a simulated
 * transaction's emitted logs.
 *
 * @example
 * ```ts
 * import {
 *   SimulationLogAssertError,
 *   type RawLog,
 * } from "@morpho-org/evm-simulation";
 *
 * const error = new SimulationLogAssertError("Approval event is missing", {
 *   transactionIndex: 0,
 *   assertionIndex: 0,
 *   assertion: { check: (_logs: readonly RawLog[]) => "Approval event is missing" },
 *   logs: [],
 * });
 * console.log(error.code); // "SIMULATION_ASSERT_FAILED"
 * console.log(error.transactionIndex, error.logs);
 * ```
 */
export class SimulationLogAssertError extends SimulationPackageError {
  /** Stable discriminator used by consumers that inspect `error.name`. */
  override readonly name = "SimulationLogAssertError";
  /** Shares the existing error code for read-assertion failures. */
  readonly code = "SIMULATION_ASSERT_FAILED";
  /** Zero-based index in the caller's transactions. */
  readonly transactionIndex: number;
  /** Index in that transaction's `assertLogs` list. */
  readonly assertionIndex: number;
  /** A copy of the caller's log assertion. */
  readonly assertion: LogAssertion;
  /** Lowercase log values passed to the check, in emission order. */
  readonly logs: readonly RawLog[];

  /**
   * Preserve the failed log assertion, its transaction coordinates, and the lowercase log values passed to the check.
   * @param message - Human-readable assertion failure or check-thrown explanation.
   * @param failure - Failed assertion, its transaction coordinates, and logs.
   * @param failure.transactionIndex - Zero-based index in the caller's transactions.
   * @param failure.assertionIndex - Zero-based index in that transaction's log assertions.
   * @param failure.assertion - Copy of the caller's log assertion (`check`).
   * @param failure.logs - Lowercase log values passed to the check.
   * @param options - Optional original error cause.
   * @param options.cause - Optional error thrown by the caller's check.
   */
  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    failure: {
      readonly transactionIndex: number;
      readonly assertionIndex: number;
      readonly assertion: LogAssertion;
      readonly logs: readonly RawLog[];
    },
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.transactionIndex = failure.transactionIndex;
    this.assertionIndex = failure.assertionIndex;
    this.assertion = { ...failure.assertion };
    this.logs = [...failure.logs];
  }
}

/** Per-asset net retained amount keyed by restricted contract and token. */
export interface RetainedAsset {
  /** Restricted bundles contract that ended up holding the token. */
  readonly address: Address;
  /** Token retained (native ETH uses viem's `ethAddress`). */
  readonly token: Address;
  /** Net balance increase in the token's base units; always positive. */
  readonly netRetained: bigint;
}

/**
 * Thrown when net value above the dust threshold is retained by a restricted bundles contract
 * (VaultExitBundlesV1, VaultBundlesV1, BlueBundlesV1 or MidnightBundlesV2) after simulation;
 * pass-through flows and net outflows are allowed. Never bypassable.
 */
export class BlacklistViolationError extends SimulationPackageError {
  override readonly name = "BlacklistViolationError";
  readonly code = "BLACKLIST_ERROR";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    /** Per-asset net retained amounts keyed by restricted contract and token. */
    public readonly assetChanges?: readonly RetainedAsset[],
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * An RPC request failed, including transport, timeout, or non-revert node errors.
 * The original viem error is preserved as `cause`. This does not imply retryability;
 * services requiring simulation must withhold transactions on this failure.
 */
export class RpcTransportError extends SimulationPackageError {
  override readonly name = "RpcTransportError";
  readonly code = "RPC_TRANSPORT_ERROR";
}

/** Bad input or a preview authorization preparation that emits asset transfers. Not bypassable. */
export class SimulationValidationError extends SimulationPackageError {
  override readonly name = "SimulationValidationError";
  readonly code = "VALIDATION_ERROR";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    public readonly fieldErrors?: string[],
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Chain ID not configured for any simulation method. Not bypassable. */
export class UnsupportedChainError extends SimulationPackageError {
  override readonly name = "UnsupportedChainError";
  readonly code = "UNSUPPORTED_CHAIN";

  constructor(
    public readonly chainId: number,
    options?: ErrorOptions,
  ) {
    super(`Chain ${chainId} is not configured for simulation`, options);
  }
}

/**
 * An SDK requirement passed to `toSimulationAuthorizations` cannot be
 * converted into a simulation authorization.
 */
export class UnsupportedOperationError extends SimulationPackageError {
  override readonly name = "UnsupportedOperationError";
  readonly code = "UNSUPPORTED_OPERATION";
}

/**
 * The simulation backend returned a response that cannot be parsed.
 * {@link InvalidChainIdError} subclasses this class and shares its `name`
 * and `code`; check `instanceof InvalidChainIdError` first to tell the two
 * apart.
 */
export class InvalidSimulationResponseError extends SimulationPackageError {
  override readonly name = "InvalidSimulationResponseError";
  readonly code = "INVALID_SIMULATION_RESPONSE";
}

/**
 * The node rejected the request `chainId`: the endpoint is on a different
 * chain than configured. Callers must not bypass this configuration failure.
 * Extends {@link InvalidSimulationResponseError} and shares its `name` and
 * `code`, so v5 callers that match on either still catch it;
 * `instanceof InvalidChainIdError` is how to tell the two apart.
 */
export class InvalidChainIdError extends InvalidSimulationResponseError {}

/** A slippage limit could not be checked because its quoted amount could not be read or measured. */
export class SlippageCheckUnavailableError extends SimulationPackageError {
  override readonly name = "SlippageCheckUnavailableError";
  readonly code = "SLIPPAGE_CHECK_UNAVAILABLE";
}

/** A pending authorization does not match the request it was prepared for. */
export class AuthorizationRequestMismatchError extends SimulationPackageError {
  override readonly name = "AuthorizationRequestMismatchError";
  readonly code = "AUTHORIZATION_REQUEST_MISMATCH";
}

/** A consumer-supplied limit was violated. */
export class ConsumerLimitViolationError extends SimulationPackageError {
  override readonly name = "ConsumerLimitViolationError";
  readonly code = "CONSUMER_LIMIT_VIOLATION";
}

/** The simulation failed for a reason that fits no other code. */
export class UnexpectedSimulationError extends SimulationPackageError {
  override readonly name = "UnexpectedSimulationError";
  readonly code = "UNEXPECTED_SIMULATION_ERROR";
}

/**
 * An action's encoded recipient differs from the account `toSimulationLimits`
 * was asked to limit: `args.onBehalf` is not `owner`, or not
 * `options.onBehalf ?? owner` on `midnightSupplyCollateral` or `midnightRedeem`
 * (`field: "onBehalf"`),
 * `redeem.recipient` on `vaultV2ForceRedeem` is not `receiver ?? owner`
 * (`field: "redeem.recipient"`), a `receiver` other than `owner` is passed
 * for an action that encodes no distinct receiver (`field: "receiver"`),
 * `args.receiver` on `midnightRedeem`, `midnightTakeBorrow`,
 * `midnightSupplyCollateralTakeBorrow`, or `midnightTakeWithdraw` is not
 * `receiver ?? owner` (`field: "args.receiver"`),
 * `args.collateralReceiver` on `midnightRepayWithdrawCollateral` or
 * `midnightTakeRepayWithdrawCollateral` is not
 * `receiver ?? owner` (`field: "args.collateralReceiver"`),
 * or `onBehalf` other than `owner` is passed for an action other than
 * `midnightSupplyCollateral` or `midnightRedeem` (`field: "options.onBehalf"`).
 */
export class LimitAccountMismatchError extends SimulationPackageError {
  override readonly name = "LimitAccountMismatchError";
  readonly code = "LIMIT_ACCOUNT_MISMATCH";

  /** The action arg or `toSimulationLimits` option carrying the mismatched address. */
  readonly field:
    | "onBehalf"
    | "receiver"
    | "redeem.recipient"
    | "options.onBehalf"
    | "args.receiver"
    | "args.collateralReceiver";
  /**
   * The address the limit would measure: `options.onBehalf ?? owner` for
   * `onBehalf` on `midnightSupplyCollateral` and `midnightRedeem`,
   * `options.receiver ?? owner` for `args.receiver` on Midnight redeem/sell
   * actions and `args.collateralReceiver` on Midnight repay-withdraw, otherwise
   * `owner` (or `receiver ?? owner` for `redeem.recipient`).
   */
  readonly expected: Address;
  /** The address the action encodes, or the passed option when `field` is `"receiver"` or `"options.onBehalf"`. */
  readonly actual: Address;

  constructor(mismatch: {
    /** The action arg or `toSimulationLimits` option carrying the mismatched address. */
    readonly field:
      | "onBehalf"
      | "receiver"
      | "redeem.recipient"
      | "options.onBehalf"
      | "args.receiver"
      | "args.collateralReceiver";
    /**
     * The address the limit would measure: `options.onBehalf ?? owner` for
     * `onBehalf` on `midnightSupplyCollateral` and `midnightRedeem`,
     * `options.receiver ?? owner` for `args.receiver` on Midnight redeem/sell
     * actions and `args.collateralReceiver` on Midnight repay-withdraw, otherwise
     * `owner` (or `receiver ?? owner` for `redeem.recipient`).
     */
    readonly expected: Address;
    /** The address the action encodes, or the passed option when `field` is `"receiver"` or `"options.onBehalf"`. */
    readonly actual: Address;
  }) {
    super(
      mismatch.field === "receiver"
        ? `receiver: "${mismatch.actual}" was passed, but this action pays ` +
            `msg.sender, so the limit measures "${mismatch.expected}". Omit ` +
            `receiver or set it to owner; only vaultV2ForceRedeem, ` +
            `midnightRedeem, midnightTakeBorrow, ` +
            `midnightSupplyCollateralTakeBorrow, midnightTakeWithdraw and a ` +
            `collateral-withdrawing midnightRepayWithdrawCollateral or ` +
            `midnightTakeRepayWithdrawCollateral encode a distinct receiver.`
        : mismatch.field === "options.onBehalf"
          ? `onBehalf: "${mismatch.actual}" was passed, but this action ` +
            `credits msg.sender, so the limit measures "${mismatch.expected}". ` +
            `Omit onBehalf or set it to owner; only midnightSupplyCollateral ` +
            `and midnightRedeem act on a distinct account.`
          : `${mismatch.field}: action encodes "${mismatch.actual}" but the ` +
            `limit measures "${mismatch.expected}". Build the action for the ` +
            `same account passed as owner/receiver, or as onBehalf on ` +
            `midnightSupplyCollateral or midnightRedeem`,
    );
    this.field = mismatch.field;
    this.expected = mismatch.expected;
    this.actual = mismatch.actual;
  }
}

/**
 * A quote side `toSimulationLimits` cannot derive from the action args and the
 * caller did not supply through `expected`.
 */
export class MissingExpectedQuoteError extends SimulationPackageError {
  override readonly name = "MissingExpectedQuoteError";
  readonly code = "MISSING_EXPECTED_QUOTE";

  /** The action type whose limit lacks the field. */
  readonly actionType: string;
  /** The missing `SlippageQuote` field. */
  readonly field: keyof SlippageQuote;
  /** What the caller should compute and pass via `expected`. */
  readonly expectedHint: string;

  constructor(missing: {
    /** The action type whose limit lacks the field. */
    readonly actionType: string;
    /** The missing `SlippageQuote` field. */
    readonly field: keyof SlippageQuote;
    /** What the caller should compute and pass via `expected`. */
    readonly expectedHint: string;
  }) {
    super(
      `"${missing.actionType}": quote.${missing.field} cannot be derived from ` +
        `the action args; ${missing.expectedHint}`,
    );
    this.actionType = missing.actionType;
    this.field = missing.field;
    this.expectedHint = missing.expectedHint;
  }
}

/**
 * An expected quote cannot be assigned to each of a maker action's
 * per-collateral-index operations.
 */
export class AmbiguousExpectedQuoteError extends SimulationPackageError {
  override readonly name = "AmbiguousExpectedQuoteError";
  readonly code = "AMBIGUOUS_EXPECTED_QUOTE";

  /** The action type whose expected quote is ambiguous. */
  readonly actionType: string;
  /** The number of independently verified collateral-index operations. */
  readonly operations: number;

  /**
   * @param ambiguity - The action type and number of operations that need separate quotes.
   */
  constructor(ambiguity: {
    /** The action type whose expected quote is ambiguous. */
    readonly actionType: string;
    /** The number of independently verified collateral-index operations. */
    readonly operations: number;
  }) {
    super(
      `"${ambiguity.actionType}": expected cannot be attributed: the action ` +
        `supplies ${ambiguity.operations} collateral indexes, each verified as ` +
        `its own operation. Omit expected, or build the limits by hand.`,
    );
    this.actionType = ambiguity.actionType;
    this.operations = ambiguity.operations;
  }
}

/** An action type `toSimulationLimits` has no {@link OperationType} for. */
export class UnsupportedLimitActionError extends SimulationPackageError {
  override readonly name = "UnsupportedLimitActionError";
  readonly code = "UNSUPPORTED_LIMIT_ACTION";

  constructor(
    /** The action type passed in. */
    public readonly actionType: string,
  ) {
    super(
      `"${actionType}": no simulation limit exists for this action type. ` +
        `Pass limits built by hand, or "none" for transactions no operation type covers`,
    );
  }
}

const ERROR_NAME_BY_CODE: Readonly<
  Record<SimulationErrorCode, readonly string[]>
> = Object.freeze({
  VALIDATION_ERROR: ["SimulationValidationError"],
  UNSUPPORTED_CHAIN: ["UnsupportedChainError"],
  RPC_TRANSPORT_ERROR: ["RpcTransportError"],
  SIMULATION_REVERTED: ["SimulationRevertedError"],
  SIMULATION_ASSERT_FAILED: [
    "SimulationAssertError",
    "SimulationLogAssertError",
  ],
  BLACKLIST_ERROR: ["BlacklistViolationError"],
  UNSUPPORTED_OPERATION: ["UnsupportedOperationError"],
  INVALID_SIMULATION_RESPONSE: ["InvalidSimulationResponseError"],
  SLIPPAGE_CHECK_UNAVAILABLE: ["SlippageCheckUnavailableError"],
  AUTHORIZATION_REQUEST_MISMATCH: ["AuthorizationRequestMismatchError"],
  CONSUMER_LIMIT_VIOLATION: ["ConsumerLimitViolationError"],
  UNEXPECTED_SIMULATION_ERROR: ["UnexpectedSimulationError"],
  LIMIT_ACCOUNT_MISMATCH: ["LimitAccountMismatchError"],
  MISSING_EXPECTED_QUOTE: ["MissingExpectedQuoteError"],
  AMBIGUOUS_EXPECTED_QUOTE: ["AmbiguousExpectedQuoteError"],
  UNSUPPORTED_LIMIT_ACTION: ["UnsupportedLimitActionError"],
});

/**
 * Structural guard for consumers where `instanceof` fails across bundles.
 *
 * @param value - Anything caught.
 * @returns `true` for package instances or objects carrying a message string,
 *   a known code and one of its matching class names. Subclass-specific fields
 *   are not checked.
 * @example
 * ```ts
 * import { isSimulationPackageError, simulate } from "@morpho-org/evm-simulation";
 * import type { Address, Hex } from "viem";
 *
 * declare const user: Address;
 * declare const vault: Address;
 * declare const encodedDeposit: Hex;
 * declare const depositAssets: bigint;
 * declare const quotedShares: bigint;
 * const config = {
 *   chains: new Map([[1, { simulateV1Url: "https://rpc.example" }]]),
 * };
 * try {
 *   await simulate(config, {
 *     chainId: 1,
 *     transactions: [{ from: user, to: vault, data: encodedDeposit }],
 *     limits: {
 *       operations: [
 *         {
 *           type: "vaultV1Deposit",
 *           vault,
 *           quote: { assetsPaid: depositAssets, sharesMinted: quotedShares },
 *         },
 *       ],
 *     },
 *   });
 * } catch (e) {
 *   if (!isSimulationPackageError(e)) throw e;
 *   if (e.code !== "SIMULATION_REVERTED") throw e;
 *   console.log(e.code, e.message);
 * }
 * ```
 */
export function isSimulationPackageError(
  value: unknown,
): value is SimulationPackageError {
  if (value instanceof SimulationPackageError) return true;
  if (typeof value !== "object" || value === null) return false;
  const { name, message, code } = value as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
  };
  if (typeof message !== "string") return false;
  if (typeof name !== "string" || typeof code !== "string") return false;
  if (!(SIMULATION_ERROR_CODES as readonly string[]).includes(code))
    return false;
  if (!ERROR_NAME_BY_CODE[code as SimulationErrorCode].includes(name))
    return false;
  return true;
}
