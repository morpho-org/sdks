import type { Address } from "viem";

import { PERMIT2_ADDRESS } from "./constants.js";
import { UnsupportedMidnightChainError } from "./errors.js";
import { deepFreeze, normalizeAddress } from "./internal.js";
import type { MidnightAddresses } from "./types.js";

const normalizeAddresses = (
  addresses: Omit<MidnightAddresses, "permit2"> &
    Partial<Pick<MidnightAddresses, "permit2">>,
): MidnightAddresses =>
  deepFreeze({
    midnight: normalizeAddress(addresses.midnight, "midnight"),
    midnightBundles: normalizeAddress(
      addresses.midnightBundles,
      "midnightBundles",
    ),
    midnightMempool: normalizeAddress(
      addresses.midnightMempool,
      "midnightMempool",
    ),
    ecrecoverRatifier: normalizeAddress(
      addresses.ecrecoverRatifier,
      "ecrecoverRatifier",
    ),
    setterRatifier: normalizeAddress(
      addresses.setterRatifier,
      "setterRatifier",
    ),
    permit2: normalizeAddress(addresses.permit2 ?? PERMIT2_ADDRESS, "permit2"),
  });

const midnightAddressEntries: readonly (readonly [
  number,
  Omit<MidnightAddresses, "permit2"> &
    Partial<Pick<MidnightAddresses, "permit2">>,
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
      normalizeAddresses(addresses),
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
