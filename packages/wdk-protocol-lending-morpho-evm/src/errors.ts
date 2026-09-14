/** Thrown when a WDK wallet account has no usable RPC provider. */
export class MissingWalletProviderError extends Error {
  constructor() {
    super(
      'The wallet account has no usable provider. Configure "provider" with at least one RPC URL or EIP-1193 provider.',
    );
  }
}
