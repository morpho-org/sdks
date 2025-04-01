import { entries } from "@morpho-org/morpho-ts";
import { type ChainAddresses, addresses } from "./addresses";

/**
 * Registers a custom chain configuration by providing its chain ID and corresponding addresses.
 *
 * This is useful when working with unsupported or local chains.
 *
 * @param chainId - The numeric chain ID of the custom or unsupported network.
 * @param chainAddresses - An object containing the necessary addresses for the given chain.
 *
 * @throws Will throw an error if the chain ID already exists in the registry.
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
function registerCustomChain(chainId: number, chainAddresses: ChainAddresses) {
  if (addresses[chainId]) {
    throw new Error(`Chain ID ${chainId} is already supported.`);
  }

  registerChain(chainId, chainAddresses);
}

function registerChain(chainId: number, chainAddresses: ChainAddresses) {
  //TODO validate schema (with zod?)
  addresses[chainId] = chainAddresses;
}

export interface BlueSdkCustomConfig {
  chains?: Record<number, ChainAddresses>;
  chainsOverrides?: Record<number, ChainAddresses>;
}

export async function loadCustomConfig() {
  try {
    const userConfigModule = await import(
      `${process.cwd()}/blue-sdk.config.ts`
    );

    const config: BlueSdkCustomConfig = userConfigModule.default;

    if (config.chains) {
      for (const [chainId, chainAddresses] of entries(config.chains)) {
        try {
          registerCustomChain(chainId, chainAddresses);
        } catch (e) {
          console.warn(`Could not add config on chain ${chainId}: ${e}`);
        }
      }
    }
    if (config.chainsOverrides) {
      for (const [chainId, chainAddresses] of entries(config.chainsOverrides)) {
        try {
          registerChain(chainId, chainAddresses);
        } catch (e) {
          console.warn(`Could not override config on chain ${chainId}: ${e}`);
        }
      }
    }
  } catch {}
}
