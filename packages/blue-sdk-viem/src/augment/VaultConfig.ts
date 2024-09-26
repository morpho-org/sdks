import { VaultConfig } from "@morpho-org/blue-sdk";
import { fetchVaultConfig } from "../fetch";

declare module "@morpho-org/blue-sdk" {
  namespace VaultConfig {
    let fetch: typeof fetchVaultConfig;
  }
}

VaultConfig.fetch = fetchVaultConfig;
export { VaultConfig };
