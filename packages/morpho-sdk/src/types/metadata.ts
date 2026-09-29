/** Analytics metadata appended to transaction calldata. */
export interface Metadata {
  /**
   * Raw or 0x-prefixed hex origin of at most four bytes (eight hex characters) and even length.
   * Invalid values are dropped with a console warning.
   */
  origin: string;
  /** When true, append the current Unix timestamp as four bytes before the origin. */
  timestamp?: boolean;
}
