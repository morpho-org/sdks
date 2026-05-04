import { VaultMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk";
import { fetchVaultMarketPublicAllocatorConfig } from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  // biome-ignore lint/nursery/noShadow: TODO rename to avoid shadowing
  namespace VaultMarketPublicAllocatorConfig {
    let fetch: typeof fetchVaultMarketPublicAllocatorConfig;
  }
}

VaultMarketPublicAllocatorConfig.fetch = fetchVaultMarketPublicAllocatorConfig;

export { VaultMarketPublicAllocatorConfig };
