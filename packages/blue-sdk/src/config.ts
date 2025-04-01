import { type ChainAddresses, addresses } from "./addresses";

/**
 * Registers a custom chain configuration by providing its chain ID and corresponding addresses.
 *
 * This is useful when working with unsupported or local chains.
 *
 * @param chainId - The numeric chain ID of the custom or unsupported network.
 * @param chainAddresses - An object containing the necessary addresses for the given chain.
 * @param override - Optional. If true, allows overriding an existing entry. Defaults to false.
 *
 * @throws Will throw an error if the chain ID already exists in the registry and `override` is false.
 * @throws Will throw an error if some required addresses are missing.
 *
 * @example
 * registerCustomChain(1337, {
 *   morpho: "0x...",
 *   bundler3: {
 *     bundler3: "0x...",
 *     generalAdapter1: "0x...",
 *   },
 *   adaptiveCurveIrm: "0x...",
 *   wNative: "0x...",
 * });
 */
export function registerCustomChain(
  chainId: number,
  chainAddresses: ChainAddresses,
  override = false,
) {
  if (addresses[chainId] && !override) {
    throw new Error(`Chain ID ${chainId} is already supported.`);
  }

  addresses[chainId] = chainAddresses;
}
