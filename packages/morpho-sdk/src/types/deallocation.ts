import type { MarketParams } from "@morpho-org/blue-sdk";
import type { Address } from "viem";

/**
 * A single deallocation entry for a `forceDeallocate` call.
 *
 * - When `marketParams` is provided, the adapter is treated as a Morpho Market V1 adapter
 *   and `data` is ABI-encoded from the given `MarketParams`.
 * - When `marketParams` is omitted, empty bytes are passed as `data` (suitable for adapters
 *   such as Vault V1 that do not require market identification).
 */
export interface Deallocation {
  readonly adapter: Address;
  readonly marketParams?: MarketParams;
  readonly amount: bigint;
}
