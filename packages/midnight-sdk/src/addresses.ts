import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { UnsupportedMidnightChainError } from "./errors.js";
import type { MidnightAddresses } from "./types.js";

const freezeAddresses = (addresses: MidnightAddresses): MidnightAddresses =>
  deepFreeze({
    midnight: addresses.midnight as Address,
    midnightBundles: addresses.midnightBundles as Address,
    midnightMempool: addresses.midnightMempool as Address,
    ecrecoverRatifier: addresses.ecrecoverRatifier as Address,
    setterRatifier: addresses.setterRatifier as Address,
    permit2: addresses.permit2 as Address,
  });

const midnightAddressEntries: readonly (readonly [
  number,
  MidnightAddresses,
])[] = [];

/**
 * Immutable Midnight address registry keyed by chain id.
 *
 * The initial registry is intentionally empty until deployed Base addresses are
 * pinned from a reviewed deployment artifact.
 *
 * @example
 * ```ts
 * import { midnightAddressRegistry } from "@morpho-org/midnight-sdk";
 *
 * console.log(midnightAddressRegistry.size);
 * ```
 */
export const midnightAddressRegistry: ReadonlyMap<number, MidnightAddresses> =
  new Map(
    midnightAddressEntries.map(([chainId, addresses]) => [
      chainId,
      freezeAddresses(addresses),
    ]),
  );

/**
 * Resolves pinned Midnight addresses for a chain.
 *
 * @param chainId - Chain id to resolve.
 * @returns Registered Midnight addresses.
 * @throws UnsupportedMidnightChainError when the chain has no registered deployment.
 * @example
 * ```ts
 * import { getMidnightAddresses } from "@morpho-org/midnight-sdk";
 *
 * try {
 *   getMidnightAddresses(8453);
 * } catch (error) {
 *   console.log(error instanceof Error);
 * }
 * ```
 */
export function getMidnightAddresses(chainId: number) {
  const addresses = midnightAddressRegistry.get(chainId);
  if (addresses == null) throw new UnsupportedMidnightChainError(chainId);

  return addresses;
}

/**
 * Type alias for user supplied Midnight address overrides.
 *
 * @example
 * ```ts
 * import type { MidnightAddressOverrides } from "@morpho-org/midnight-sdk";
 *
 * const overrides: MidnightAddressOverrides = {
 *   midnight: "0x0000000000000000000000000000000000000001",
 * };
 * ```
 */
export type MidnightAddressOverrides = Partial<
  Record<keyof MidnightAddresses, Address>
>;
