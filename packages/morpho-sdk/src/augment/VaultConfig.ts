import { VaultConfig as BlueVaultConfig } from "@morpho-org/blue-sdk";
import { fetchVaultConfig } from "@morpho-org/blue-sdk-viem";

declare module "@morpho-org/blue-sdk" {
  namespace VaultConfig {
    let fetch: typeof fetchVaultConfig;
  }
}

BlueVaultConfig.fetch = fetchVaultConfig;

export { BlueVaultConfig as VaultConfig };
