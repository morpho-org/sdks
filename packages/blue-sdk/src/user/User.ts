import type { Address } from "../types";

export class User {
  /**
   * The user's address.
   */
  public readonly address: Address;

  /**
   * Whether the bundler is authorized to manage the user's position on Morpho Blue.
   */
  public isBundlerAuthorized: boolean;

  /**
   * The user's nonce on Morpho Blue.
   */
  public morphoNonce: bigint;

  constructor({
    address,
    isBundlerAuthorized,
    morphoNonce,
  }: {
    address: Address;
    isBundlerAuthorized: boolean;
    morphoNonce: bigint;
  }) {
    this.address = address;
    this.isBundlerAuthorized = isBundlerAuthorized;
    this.morphoNonce = morphoNonce;
  }
}
