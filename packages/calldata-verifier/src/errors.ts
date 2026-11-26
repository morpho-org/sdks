/**
 * A failed calldata check.
 *
 * @internal
 */
class CalldataCheckError extends Error {
  /** Name of the failing field. */
  readonly field: string;
  /** ID of the failing call, if available. */
  readonly callId: string | undefined;

  constructor(
    field: string,
    location?: string | (ErrorOptions & { callId?: string }),
  ) {
    const callId = typeof location === "string" ? location : location?.callId;
    super(
      callId === undefined
        ? `Cannot verify "${field}". Check the original intent and supplied calls.`
        : `Cannot verify "${field}" in call "${callId}". Do not sign this call.`,
      typeof location === "object" ? location : undefined,
    );
    this.name = new.target.name;
    this.field = field;
    this.callId = callId;
  }
}

/** The intent's chain has no usable registry entry. */
export class CalldataChainError extends CalldataCheckError {}

/** A call or embedded target does not match the expected contract or market. */
export class CalldataTargetError extends CalldataCheckError {}

/** Calldata could not be decoded with the expected contract ABI. */
export class CalldataDecodeError extends CalldataCheckError {}

/** A call is missing, unexpected, duplicated or out of order. */
export class CalldataCallError extends CalldataCheckError {}

/** A transaction amount or native value does not match the intent. */
export class CalldataAmountError extends CalldataCheckError {}

/** A call owner or recipient does not match the intent. */
export class CalldataRecipientError extends CalldataCheckError {}

/** The fee or its recipient exceeds the caller's authorization. */
export class CalldataFeeError extends CalldataCheckError {}

/** An Actions API proof is invalid or does not authorize the supplied calls. */
export class CalldataProofError extends CalldataCheckError {}

/** A recognized action or request uses a case this version does not support. */
export class CalldataUnsupportedError extends CalldataCheckError {}
