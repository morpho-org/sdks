import { VaultMarketConfig as BlueVaultMarketConfig } from "@morpho-org/blue-sdk";
import { fetchVaultMarketConfig } from "@morpho-org/blue-sdk-viem";

declare module "@morpho-org/blue-sdk" {
  namespace VaultMarketConfig {
    let fetch: typeof fetchVaultMarketConfig;
  }
}

BlueVaultMarketConfig.fetch = fetchVaultMarketConfig;

export { BlueVaultMarketConfig as VaultMarketConfig };
