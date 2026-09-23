/** Thrown when a supplied signature deadline exceeds the adapter's bounded execution window. */
export class BlueBundlesV1DeadlineExceedsWindowError extends Error {
  /**
   * @param deadline - Supplied signature deadline in Unix seconds.
   * @param maxDeadline - Latest accepted deadline (now plus the two-hour window).
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
