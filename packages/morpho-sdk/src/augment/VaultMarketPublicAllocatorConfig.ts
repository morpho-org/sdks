import { VaultMarketPublicAllocatorConfig as BlueVaultMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk";
import { fetchVaultMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk-viem";

declare module "@morpho-org/blue-sdk" {
  namespace VaultMarketPublicAllocatorConfig {
    let fetch: typeof fetchVaultMarketPublicAllocatorConfig;
  }
}

BlueVaultMarketPublicAllocatorConfig.fetch =
  fetchVaultMarketPublicAllocatorConfig;

export {
  BlueVaultMarketPublicAllocatorConfig as VaultMarketPublicAllocatorConfig,
};
