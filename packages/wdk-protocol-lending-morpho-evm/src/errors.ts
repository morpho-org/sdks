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

/**
 * Thrown when an ERC-4337 token-paymaster operation would approve the fee token to a
 * spender other than the configured `paymasterAddress`. The paymaster quote chose the
 * spender; the operation is rejected before signing.
 */
export class PaymasterApprovalSpenderMismatchError extends Error {
  /**
   * @param spender - Spender the fee-token approval would target, if it is a string.
   * @param paymasterAddress - Configured paymaster address, if any.
   */
  constructor(
    readonly spender: string | undefined,
    readonly paymasterAddress: string | undefined,
  ) {
    super(
      `The paymaster quote names "${spender}" as the fee-token spender, but the configured paymasterAddress is "${paymasterAddress}". Check the paymaster configuration before retrying the operation.`,
    );
  }
}

/** Thrown when WDK or AbstractionKit no longer exposes a hook the fee-token approval check relies on. */
export class PaymasterApprovalGuardUnavailableError extends Error {
  /** @param hook - Missing WDK or AbstractionKit method. */
  constructor(
    readonly hook:
      | "_getSmartAccount"
      | "prependTokenPaymasterApproveToCallData",
  ) {
    super(
      hook === "_getSmartAccount"
        ? 'The installed @tetherto/wdk-wallet-evm-erc-4337 no longer exposes "_getSmartAccount", so the fee-token approval spender cannot be checked. Install the version this package pins before retrying the operation.'
        : 'The installed abstractionkit no longer exposes "prependTokenPaymasterApproveToCallData", so the fee-token approval spender cannot be checked. Remove any abstractionkit override so the version @tetherto/wdk-wallet-evm-erc-4337 pins is installed before retrying the operation.',
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

/** Thrown when the wallet's transaction maximum fee configuration is invalid. */
export class InvalidTransactionMaxFeeError extends Error {
  /**
   * @param value - Invalid wallet configuration or transactionMaxFee value.
   */
  constructor(readonly value: unknown) {
    super(
      `Invalid transactionMaxFee configuration value "${String(value)}". Use null or undefined to disable the cap, or a non-negative bigint or integer number.`,
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
