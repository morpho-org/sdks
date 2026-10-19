import type { Hash, Hex } from "viem";

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

/** Thrown when a broadcast or its reconciliation lookup leaves delivery uncertain. */
export class UnconfirmedBroadcastError extends Error {
  /**
   * @param hash - Locally computed transaction hash for the signed bytes.
   * @param serializedTransaction - Signed transaction bytes callers can look up or rebroadcast.
   * @param cause - The send failure, or an AggregateError containing send and lookup failures.
   */
  // biome-ignore lint/complexity/useMaxParams: The public error requires hash, bytes, and cause.
  constructor(
    readonly hash: Hash,
    readonly serializedTransaction: Hex,
    cause: unknown,
  ) {
    super(
      `Broadcast of transaction "${hash}" could not be confirmed; it may still be included. Look up the hash, or rebroadcast serializedTransaction, before retrying the operation.`,
      { cause },
    );
  }
}

/** Thrown when a wallet returns a value that is not a 32-byte transaction hash. */
export class InvalidTransactionHashError extends Error {
  /**
   * @param hash - Malformed value returned by the wallet or RPC.
   * @param eoa - Recovery details for a signed EOA transaction: the locally computed hash and
   *   the signed bytes. Omitted for ERC-4337 user operations.
   */
  constructor(
    readonly hash: unknown,
    readonly eoa?: {
      readonly localHash: Hash;
      readonly serializedTransaction: Hex;
    },
  ) {
    const displayedHash = typeof hash === "string" ? hash : `<${typeof hash}>`;
    super(
      `The wallet returned an invalid transaction hash "${displayedHash}". Verify the provider response before using this operation.${
        eoa === undefined
          ? " The user operation may already be in flight (e.g. with `nonceKey` or `parallel`); look it up with the bundler or check the account nonce before retrying the operation."
          : ` The node may have received the transaction; look up "${eoa.localHash}" before retrying the operation.`
      }`,
    );
  }
}
