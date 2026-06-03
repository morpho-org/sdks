import {
  type DeepPartial,
  type DottedKeys,
  deepFreeze,
} from "@morpho-org/morpho-ts";
import {
  IncompleteMidnightAddressesError,
  MidnightAddressAlreadyRegisteredError,
  UnsupportedMidnightChainError,
} from "./errors.js";
import type { MidnightAddresses } from "./types.js";

const MIDNIGHT_ADDRESS_LABELS = [
  "midnight",
  "midnightBundles",
  "midnightMempool",
  "ecrecoverRatifier",
  "setterRatifier",
  "permit2",
] as const satisfies readonly (keyof MidnightAddresses)[];

const _midnightAddressRegistry = {} satisfies Record<number, MidnightAddresses>;

const copyMidnightAddresses = (
  addresses: MidnightAddresses,
): MidnightAddresses => ({
  midnight: addresses.midnight,
  midnightBundles: addresses.midnightBundles,
  midnightMempool: addresses.midnightMempool,
  ecrecoverRatifier: addresses.ecrecoverRatifier,
  setterRatifier: addresses.setterRatifier,
  permit2: addresses.permit2,
});

const copyMidnightAddressRegistry = (
  registry: Readonly<Record<number, MidnightAddresses>>,
): Record<number, MidnightAddresses> => {
  const nextRegistry: Record<number, MidnightAddresses> = {};

  for (const [chainId, addresses] of Object.entries(registry)) {
    nextRegistry[Number(chainId)] = copyMidnightAddresses(addresses);
  }

  return nextRegistry;
};

const freezeMidnightAddressRegistry = (
  registry: Readonly<Record<number, MidnightAddresses>>,
): MidnightAddressRegistry => deepFreeze(copyMidnightAddressRegistry(registry));

/**
 * Dotted label for a field in a Midnight chain address entry.
 *
 * @example
 * ```ts
 * import type { MidnightAddressLabel } from "@morpho-org/midnight-sdk";
 *
 * const label: MidnightAddressLabel = "midnight";
 * ```
 */
export type MidnightAddressLabel = DottedKeys<MidnightAddresses>;

/**
 * Immutable Midnight address registry keyed by chain id.
 *
 * The initial registry is intentionally empty until deployed Base addresses are
 * pinned from a reviewed deployment artifact.
 *
 * @example
 * ```ts
 * import type { MidnightAddressRegistry } from "@morpho-org/midnight-sdk";
 *
 * const registry: MidnightAddressRegistry = {};
 * ```
 */
export type MidnightAddressRegistry = Readonly<
  Record<number, MidnightAddresses>
>;

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
export type MidnightAddressOverrides = DeepPartial<MidnightAddresses>;

/**
 * Type alias for custom Midnight address registry entries.
 *
 * Unknown chains must provide every required Midnight address. Known chains may
 * provide a partial entry, but existing values cannot be changed.
 *
 * @example
 * ```ts
 * import type { MidnightAddressRegistryOverrides } from "@morpho-org/midnight-sdk";
 *
 * const overrides: MidnightAddressRegistryOverrides = {
 *   31337: {
 *     midnight: "0x0000000000000000000000000000000000000001",
 *     midnightBundles: "0x0000000000000000000000000000000000000002",
 *     midnightMempool: "0x0000000000000000000000000000000000000003",
 *     ecrecoverRatifier: "0x0000000000000000000000000000000000000004",
 *     setterRatifier: "0x0000000000000000000000000000000000000005",
 *     permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
 *   },
 * };
 * ```
 */
export type MidnightAddressRegistryOverrides = Record<
  number,
  MidnightAddressOverrides
>;

/**
 * Immutable Midnight address registry keyed by chain id.
 *
 * The initial registry is intentionally empty until deployed Base addresses are
 * pinned from a reviewed deployment artifact. The binding is updated when
 * {@link registerCustomMidnightAddresses} installs custom addresses.
 *
 * @example
 * ```ts
 * import { midnightAddressRegistry } from "@morpho-org/midnight-sdk";
 *
 * console.log(Object.keys(midnightAddressRegistry).length);
 * ```
 */
export let midnightAddressRegistry: MidnightAddressRegistry =
  freezeMidnightAddressRegistry(_midnightAddressRegistry);

/**
 * Alias of {@link midnightAddressRegistry} matching the object-style registry
 * exported by `@morpho-org/blue-sdk`.
 *
 * @example
 * ```ts
 * import { midnightAddresses } from "@morpho-org/midnight-sdk";
 *
 * console.log(midnightAddresses[8453]);
 * ```
 */
export let midnightAddresses = midnightAddressRegistry;

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
  const addresses = midnightAddressRegistry[chainId];
  if (addresses == null) throw new UnsupportedMidnightChainError(chainId);

  return addresses;
}

/**
 * Registers custom Midnight addresses without overriding existing values.
 *
 * Unknown chains must provide a complete `MidnightAddresses` entry. Known chains
 * may receive partial entries, but a field that is already registered can only
 * be repeated with the same value.
 *
 * @param options - Optional registration options.
 * @param options.addresses - Custom address entries keyed by chain id.
 * @returns Nothing.
 * @throws IncompleteMidnightAddressesError when a new chain entry is missing required addresses.
 * @throws MidnightAddressAlreadyRegisteredError when registration attempts to change an existing address.
 * @example
 * ```ts
 * import { registerCustomMidnightAddresses } from "@morpho-org/midnight-sdk";
 *
 * registerCustomMidnightAddresses({
 *   addresses: {
 *     31337: {
 *       midnight: "0x0000000000000000000000000000000000000001",
 *       midnightBundles: "0x0000000000000000000000000000000000000002",
 *       midnightMempool: "0x0000000000000000000000000000000000000003",
 *       ecrecoverRatifier: "0x0000000000000000000000000000000000000004",
 *       setterRatifier: "0x0000000000000000000000000000000000000005",
 *       permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
 *     },
 *   },
 * });
 * ```
 */
export function registerCustomMidnightAddresses({
  addresses: customAddresses,
}: {
  addresses?: MidnightAddressRegistryOverrides;
} = {}) {
  if (customAddresses == null) return;

  const nextRegistry = copyMidnightAddressRegistry(midnightAddressRegistry);

  for (const [chainIdString, requestedAddresses] of Object.entries(
    customAddresses,
  )) {
    const chainId = Number(chainIdString);
    const registeredAddresses = nextRegistry[chainId];

    if (registeredAddresses == null) {
      const {
        midnight,
        midnightBundles,
        midnightMempool,
        ecrecoverRatifier,
        setterRatifier,
        permit2,
      } = requestedAddresses;

      if (
        midnight == null ||
        midnightBundles == null ||
        midnightMempool == null ||
        ecrecoverRatifier == null ||
        setterRatifier == null ||
        permit2 == null
      ) {
        throw new IncompleteMidnightAddressesError(
          chainId,
          MIDNIGHT_ADDRESS_LABELS.filter(
            (label) => requestedAddresses[label] == null,
          ),
        );
      }

      nextRegistry[chainId] = {
        midnight,
        midnightBundles,
        midnightMempool,
        ecrecoverRatifier,
        setterRatifier,
        permit2,
      };
      continue;
    }

    const nextAddresses = copyMidnightAddresses(registeredAddresses);

    for (const label of MIDNIGHT_ADDRESS_LABELS) {
      const requestedAddress = requestedAddresses[label];
      if (requestedAddress == null) continue;

      const registeredAddress = registeredAddresses[label];
      if (registeredAddress !== requestedAddress)
        throw new MidnightAddressAlreadyRegisteredError({
          chainId,
          label,
          registeredAddress,
          requestedAddress,
        });
    }

    nextRegistry[chainId] = nextAddresses;
  }

  midnightAddresses = midnightAddressRegistry =
    freezeMidnightAddressRegistry(nextRegistry);
}
