import type { Address } from "viem";

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
