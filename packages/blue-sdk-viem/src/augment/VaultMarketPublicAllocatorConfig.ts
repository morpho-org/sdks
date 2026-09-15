import { VaultMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk";
import { fetchVaultMarketPublicAllocatorConfig } from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  // biome-ignore lint/suspicious/noShadow: TODO rename to avoid shadowing
  namespace VaultMarketPublicAllocatorConfig {
    /** @deprecated Vault V1 PublicAllocator support is deprecated. Use `fetchVaultV2BlueMarketPublicAllocatorConfig` for Vault V2 integrations. */
    let fetch: typeof fetchVaultMarketPublicAllocatorConfig;
  }
}

VaultMarketPublicAllocatorConfig.fetch = fetchVaultMarketPublicAllocatorConfig;

export { VaultMarketPublicAllocatorConfig };
