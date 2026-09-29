import type { Address } from "../types.js";

/** Represents a Morpho Blue user's nonce state. */
export class User {
  /**
   * The user's address.
   */
  public readonly address: Address;

  /**
   * The user's nonce on Morpho Blue.
   */
  public morphoNonce: bigint;

  constructor({
    address,
    morphoNonce,
  }: {
    address: Address;
    morphoNonce: bigint;
  }) {
    this.address = address;
    this.morphoNonce = morphoNonce;
  }
}
