import type { Address } from "viem";

/**
 * Anvil's first default account address. Used as a JSON-RPC account on a
 * `WalletClient` for tests that exercise sign-time validation paths
 * (chainId / account presence / address match) without ever producing a
 * real signature — no private key required.
 */
export const TEST_ACCOUNT_ADDRESS: Address =
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
