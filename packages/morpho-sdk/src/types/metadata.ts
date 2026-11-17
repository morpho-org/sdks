/** Analytics metadata appended to transaction calldata. */
export interface Metadata {
  /**
   * Raw or 0x-prefixed hex origin of at most four bytes (eight hex characters) and even length.
   * Invalid values are dropped with a console warning.
   */
  origin: string;
  /**
   * Append a four-byte Unix timestamp before the origin. For entity flows, set
   * `timestamp: true` in the client options and pass a fresh `now` to each flow
   * to record that flow's reference timestamp. `true` without a flow `now` uses
   * the device clock; only this fallback is deprecated.
   *
   * For direct action or `addTransactionMetadata` calls, pass a bigint per
   * transaction, normally the latest block's `timestamp`. A bigint must be
   * uint32 seconds (0 through 2^32 - 1, inclusive). Do not store a per-transaction
   * block timestamp in long-lived client options. `false` or unset omits it.
   */
  timestamp?: boolean | bigint;
}
