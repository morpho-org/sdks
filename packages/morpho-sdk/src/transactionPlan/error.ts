import type { Address } from "viem";

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * A caller-provided Blue market or position snapshot was read on a different chain.
 * @example
 * ```ts
 * import { BlueSnapshotChainMismatchError } from "@morpho-org/morpho-sdk";
 * const error = new BlueSnapshotChainMismatchError(8453, 1);
 * ```
 */
export class BlueSnapshotChainMismatchError extends Error {
  /**
   * @param snapshotChainId - Chain the snapshot was read from.
   * @param chainId - Chain the operation targets.
   */
  public constructor(
    public readonly snapshotChainId: number,
    public readonly chainId: number,
  ) {
    super(
      `Expected a Blue snapshot on chain "${chainId}", got "${snapshotChainId}". Fetch the snapshot on the operation chain.`,
    );
    this.name = "BlueSnapshotChainMismatchError";
  }
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * A caller-provided Blue market snapshot describes a different market state than the market
 * embedded in the position snapshot, so quotes and health checks would mix two states.
 * @example
 * ```ts
 * import { BlueSnapshotStateMismatchError } from "@morpho-org/morpho-sdk";
 * const error = new BlueSnapshotStateMismatchError({
 *   field: "totalBorrowAssets",
 *   positionValue: 100n,
 *   marketValue: 200n,
 * });
 * ```
 */
export class BlueSnapshotStateMismatchError extends Error {
  /** Market state field that differs between the snapshots. */
  public readonly field: string;
  /** Value in the market embedded in the position snapshot. */
  public readonly positionValue: bigint | undefined;
  /** Value in the market snapshot. */
  public readonly marketValue: bigint | undefined;

  /**
   * @param params.field - Market state field that differs between the snapshots.
   * @param params.positionValue - Value in the market embedded in the position snapshot.
   * @param params.marketValue - Value in the market snapshot.
   */
  public constructor({
    field,
    positionValue,
    marketValue,
  }: {
    readonly field: string;
    readonly positionValue: bigint | undefined;
    readonly marketValue: bigint | undefined;
  }) {
    super(
      `Expected market snapshot ${field} "${positionValue}" from the position snapshot, got "${marketValue}". Fetch the market and position snapshots from the same market state.`,
    );
    this.field = field;
    this.positionValue = positionValue;
    this.marketValue = marketValue;
    this.name = "BlueSnapshotStateMismatchError";
  }
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Thrown when an operation's account is the zero address.
 * @example
 * ```ts
 * import { ZeroAccountError } from "@morpho-org/morpho-sdk";
 * import { zeroAddress } from "viem";
 * const error = new ZeroAccountError(zeroAddress);
 * ```
 */
export class ZeroAccountError extends Error {
  /** @param account - Rejected account address. */
  public constructor(public readonly account: Address) {
    super(
      `Account "${account}" cannot be the zero address. Pass the account that sends the transaction.`,
    );
    this.name = "ZeroAccountError";
  }
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * A stored plan uses a format version this SDK cannot interpret.
 */
export class UnsupportedTransactionPlanVersionError extends Error {
  /**
   * @param version - Unsupported stored plan version.
   * @example
   * ```ts
   * import { UnsupportedTransactionPlanVersionError } from "@morpho-org/morpho-sdk";
   * const error = new UnsupportedTransactionPlanVersionError(2);
   * console.error(error.version);
   * ```
   */
  public constructor(public readonly version: number) {
    super(
      `Unsupported transaction plan version "${version}". Use an SDK that supports this plan version.`,
    );
    this.name = "UnsupportedTransactionPlanVersionError";
  }
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * A selected plan step names an action this SDK cannot build.
 */
export class UnsupportedTransactionPlanActionError extends Error {
  /**
   * @param actionType - Unsupported stored action discriminator.
   * @example
   * ```ts
   * import { UnsupportedTransactionPlanActionError } from "@morpho-org/morpho-sdk";
   * const error = new UnsupportedTransactionPlanActionError("futureAction");
   * console.error(error.actionType);
   * ```
   */
  public constructor(public readonly actionType: string) {
    super(
      `Unsupported transaction plan action "${actionType}". Use an SDK that supports this action.`,
    );
    this.name = "UnsupportedTransactionPlanActionError";
  }
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Restored plan data has an invalid shape or inconsistent references.
 */
export class InvalidTransactionPlanError extends Error {
  /** JSON path of the first rejected value. */
  public readonly path: string;
  /** Shape or consistency constraint that the value failed. */
  public readonly reason: string;

  /**
   * @param details - JSON path, validation failure and optional underlying error.
   * @example
   * ```ts
   * import { InvalidTransactionPlanError } from "@morpho-org/morpho-sdk";
   * const error = new InvalidTransactionPlanError({ path: "$.chainId", reason: "expected a positive safe integer" });
   * console.error(error.path);
   * ```
   */
  public constructor({
    path,
    reason,
    cause,
  }: {
    readonly path: string;
    readonly reason: string;
    readonly cause?: unknown;
  }) {
    super(
      `Invalid transaction plan at "${path}": ${reason}. Restore a valid saved plan or prepare a new plan.`,
      { cause },
    );
    this.name = "InvalidTransactionPlanError";
    this.path = path;
    this.reason = reason;
  }
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * A step references a signature request that is absent or has no signature yet.
 */
export class IncompleteTransactionPlanError extends Error {
  /** The missing dependency is a signature request. */
  public readonly kind = "signature";

  /**
   * Identifies the signature request needed to build the transaction.
   * @param id - Plan-local signature request ID.
   * @example
   * ```ts
   * import { IncompleteTransactionPlanError } from "@morpho-org/morpho-sdk";
   * const error = new IncompleteTransactionPlanError("vaultV2Deposit:tokenPermit");
   * ```
   */
  public constructor(public readonly id: string) {
    super(
      `Missing signature for request "${id}". Verify and attach it with applySignatures before building this step.`,
    );
    this.name = "IncompleteTransactionPlanError";
  }
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * A plan's signature request disagrees with its referencing action or has no reference.
 */
export class TransactionPlanSignatureMismatchError extends Error {
  /**
   * @param id - Rejected signature request ID.
   * @param field - Mismatched typed-data, argument or reference field.
   * @example
   * ```ts
   * import { TransactionPlanSignatureMismatchError } from "@morpho-org/morpho-sdk";
   * const error = new TransactionPlanSignatureMismatchError("vaultV2Deposit:tokenPermit", "message.owner");
   * ```
   */
  public constructor(
    public readonly id: string,
    public readonly field: string,
  ) {
    super(
      `Signature request "${id}" has a mismatched "${field}". Prepare a new plan before signing or building.`,
    );
    this.name = "TransactionPlanSignatureMismatchError";
  }
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * `calldataOrigin` is not a 0x-prefixed hex string holding a whole number of bytes.
 */
export class InvalidCalldataOriginError extends Error {
  /**
   * Identifies the rejected origin.
   * @param calldataOrigin - Value supplied by the caller.
   * @example
   * ```ts
   * import { InvalidCalldataOriginError } from "@morpho-org/morpho-sdk";
   * const error = new InvalidCalldataOriginError("0xabc");
   * ```
   */
  public constructor(public readonly calldataOrigin: string) {
    super(
      `Calldata origin "${calldataOrigin}" must be 0x-prefixed hex with an even number of hex characters, such as "0xdeadbeef". Fix the value or omit it.`,
    );
    this.name = "InvalidCalldataOriginError";
  }
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * A number input that must be an integer is fractional, infinite or not a number.
 */
export class NonIntegerInputError extends Error {
  /**
   * Identifies the invalid input.
   * @param field - Public input field whose value is invalid.
   * @param value - Non-integer number supplied for the field.
   * @example
   * ```ts
   * import { NonIntegerInputError } from "@morpho-org/morpho-sdk";
   * const error = new NonIntegerInputError("expiresAt", 1.5);
   * ```
   */
  public constructor(
    public readonly field: string,
    public readonly value: number,
  ) {
    super(`Input "${field}" must be a safe integer, got "${value}".`);
    this.name = "NonIntegerInputError";
  }
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * A reduce-only Midnight withdrawal needs more credit units than the position's accrued credit
 * holds, so no quote or market liquidity can reach the target.
 */
export class MidnightTakeCreditInsufficientError extends Error {
  /** Position credit accrued to the reference timestamp. */
  public readonly credit: bigint;
  /** Credit units the target needs. */
  public readonly requiredUnits: bigint;

  /**
   * @param params - Accrued credit, the units the target needs and optional underlying error.
   * @param params.credit - Position credit accrued to the reference timestamp.
   * @param params.requiredUnits - Credit units the target needs.
   * @param params.cause - Offer-shortfall error that the credit shortfall replaces.
   * @example
   * ```ts
   * import { MidnightTakeCreditInsufficientError } from "@morpho-org/morpho-sdk";
   * const error = new MidnightTakeCreditInsufficientError({ credit: 40n, requiredUnits: 50n });
   * ```
   */
  public constructor({
    credit,
    requiredUnits,
    cause,
  }: {
    readonly credit: bigint;
    readonly requiredUnits: bigint;
    readonly cause?: unknown;
  }) {
    super(
      `Midnight position credit "${credit}" is below the "${requiredUnits}" units the target needs. Lower the target to at most the position's credit.`,
      { cause },
    );
    this.credit = credit;
    this.requiredUnits = requiredUnits;
    this.name = "MidnightTakeCreditInsufficientError";
  }
}
