/** Thrown when a supplied signature deadline exceeds the adapter's bounded execution window. */
export class BlueBundlesV1DeadlineExceedsWindowError extends Error {
  /**
   * @param deadline - Supplied signature deadline in Unix seconds.
   * @param maxDeadline - Latest accepted deadline (now plus the two-hour window and the 300-second clock-skew allowance).
   */
  constructor(
    readonly deadline: bigint,
    readonly maxDeadline: bigint,
  ) {
    super(
      `Signature deadline "${deadline}" exceeds the maximum "${maxDeadline}". Re-sign the requirement with a shorter deadline.`,
    );
  }
}

/** Thrown when a WDK wallet account has no usable RPC provider. */
export class MissingWalletProviderError extends Error {
  constructor() {
    super(
      'The wallet account has no usable provider. Configure "provider" with at least one RPC URL or EIP-1193 provider.',
    );
  }
}

/**
 * Thrown when `eth_sendRawTransaction` returns a hash that differs from `keccak256` of the signed
 * transaction bytes. The provider may still have broadcast the signed transaction, so track
 * `expectedHash` on an independent node before retrying.
 */
export class RawTransactionHashMismatchError extends Error {
  /**
   * @param expectedHash - Hash of the signed transaction bytes, computed locally.
   * @param returnedHash - Hash returned by the RPC provider.
   */
  constructor(
    readonly expectedHash: string,
    readonly returnedHash: string,
  ) {
    super(
      `RPC returned transaction hash "${returnedHash}", expected "${expectedHash}" (keccak256 of the signed transaction). The transaction may already be broadcast: check "${expectedHash}" on an independent node or explorer before retrying, and switch to a trusted RPC provider.`,
    );
    this.name = "RawTransactionHashMismatchError";
  }
}
