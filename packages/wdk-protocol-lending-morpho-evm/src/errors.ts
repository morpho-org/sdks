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
    this.name = "BlueBundlesV1DeadlineExceedsWindowError";
  }
}

/** Thrown when a WDK wallet account has no usable RPC provider. */
export class MissingWalletProviderError extends Error {
  constructor() {
    super(
      'The wallet account has no usable provider. Configure "provider" with at least one RPC URL or EIP-1193 provider.',
    );
    this.name = "MissingWalletProviderError";
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
    this.name = "PaymasterApprovalSpenderMismatchError";
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
    this.name = "PaymasterApprovalGuardUnavailableError";
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
    this.name = "UnconfirmedBroadcastError";
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
    this.name = "InvalidTransactionMaxFeeError";
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
    this.name = "InvalidTransactionHashError";
  }
}

/** Thrown when an amount is neither a number nor a bigint. */
export class InvalidAmountTypeError extends Error {
  /** @param field - Invalid input field. */
  constructor(field: string) {
    super(`'${field}' must be a number or bigint.`);
    this.name = "InvalidAmountTypeError";
  }
}

/** Thrown when a numeric amount is not a safe integer. */
export class UnsafeAmountError extends Error {
  /** @param field - Invalid input field. */
  constructor(field: string) {
    super(
      `'${field}' must be a safe integer; pass a bigint for values above Number.MAX_SAFE_INTEGER.`,
    );
    this.name = "UnsafeAmountError";
  }
}

/** Thrown when an address input is malformed or a forbidden zero address. */
export class InvalidAddressError extends Error {
  /**
   * @param field - Invalid input field.
   * @param nonZero - Whether the address must also be nonzero.
   */
  constructor(field: string, nonZero = false) {
    super(
      `'${field}' must be a valid address${nonZero ? " (not zero address)" : ""}.`,
    );
    this.name = "InvalidAddressError";
  }
}

/** Thrown when a protocol option is invalid or required configuration is absent. */
export class InvalidProtocolOptionError extends Error {
  /** @param message - Validation failure and corrective configuration. */
  constructor(message: string) {
    super(message);
    this.name = "InvalidProtocolOptionError";
  }
}

/** Thrown when an operation has no configured vault or market target. */
export class MissingMorphoTargetError extends Error {
  /** @param message - Validation failure and corrective configuration. */
  constructor(message: string) {
    super(message);
    this.name = "MissingMorphoTargetError";
  }
}

/** Thrown when an operation requires a writable wallet account. */
export class ReadOnlyAccountError extends Error {
  /** @param message - Validation failure and corrective configuration. */
  constructor(message: string) {
    super(message);
    this.name = "ReadOnlyAccountError";
  }
}

/** Thrown when the supplied token differs from the configured market token. */
export class MarketTokenMismatchError extends Error {
  /**
   * @param params - Token mismatch details.
   * @param params.token - Supplied token address.
   * @param params.expectedToken - Configured market token address.
   * @param params.kind - Market token role.
   */
  constructor({
    token,
    expectedToken,
    kind,
  }: {
    readonly token: string;
    readonly expectedToken: string;
    readonly kind: "loan" | "collateral";
  }) {
    super(
      `Token '${token}' does not match configured market ${kind} token '${expectedToken}'.`,
    );
    this.name = "MarketTokenMismatchError";
  }
}

/** Thrown when the wallet token balance cannot fund an operation. */
export class InsufficientTokenBalanceError extends Error {
  constructor() {
    super("Not enough funds to fulfill the operation.");
    this.name = "InsufficientTokenBalanceError";
  }
}
