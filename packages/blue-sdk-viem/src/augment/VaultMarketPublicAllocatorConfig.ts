import { VaultMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk";
import { fetchVaultMarketPublicAllocatorConfig } from "../fetch";

declare module "@morpho-org/blue-sdk" {
  namespace VaultMarketPublicAllocatorConfig {
    let fetch: typeof fetchVaultMarketPublicAllocatorConfig;
  }
}

VaultMarketPublicAllocatorConfig.fetch = fetchVaultMarketPublicAllocatorConfig;
