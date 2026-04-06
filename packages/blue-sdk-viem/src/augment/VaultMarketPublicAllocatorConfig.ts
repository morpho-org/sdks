import { VaultMarketPublicAllocatorConfig } from "@gfxlabs/blue-sdk";
import { fetchVaultMarketPublicAllocatorConfig } from "../fetch/index.js";

declare module "@gfxlabs/blue-sdk" {
  namespace VaultMarketPublicAllocatorConfig {
    let fetch: typeof fetchVaultMarketPublicAllocatorConfig;
  }
}

VaultMarketPublicAllocatorConfig.fetch = fetchVaultMarketPublicAllocatorConfig;

export { VaultMarketPublicAllocatorConfig };
