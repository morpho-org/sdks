import type { Address } from "../types.js";

export interface IVaultUser {
  vault: Address;
  user: Address;
  isAllocator: boolean;
  allowance: bigint;
}

export class VaultUser implements IVaultUser {
  /**
   * The vault's address.
   */
  public readonly vault: Address;

  /**
   * The user's address.
   */
  public readonly user: Address;

  /**
   * Whether the user is an allocator of the vault.
   */
  public isAllocator: boolean;

  /**
   * The allowance of the vault over the user's underlying assets.
   */
  public allowance: bigint;

  constructor({ vault, user, isAllocator, allowance }: IVaultUser) {
    this.vault = vault;
    this.user = user;
    this.isAllocator = isAllocator;
    this.allowance = allowance;
  }
}
