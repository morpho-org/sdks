import type { Address } from "viem";

/** Identifies a vault and its underlying asset. */
export interface VaultParams {
  /** The vault contract address. */
  vault: Address;
  /** The address of the vault's underlying asset. */
  asset: Address;
}
