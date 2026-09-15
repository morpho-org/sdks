import { VaultMarketPublicAllocatorConfig as BlueVaultMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk";
import { fetchVaultMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk-viem";

declare module "@morpho-org/blue-sdk" {
  namespace VaultMarketPublicAllocatorConfig {
    /**
     * @deprecated Vault V1 PublicAllocator support will be removed in the next major. Migrate to
     * `fetchVaultV2BlueMarketPublicAllocatorConfig`.
     */
    let fetch: typeof fetchVaultMarketPublicAllocatorConfig;
  }
}

BlueVaultMarketPublicAllocatorConfig.fetch =
  fetchVaultMarketPublicAllocatorConfig;

export {
  BlueVaultMarketPublicAllocatorConfig as VaultMarketPublicAllocatorConfig,
};
