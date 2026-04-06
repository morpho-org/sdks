import { VaultConfig } from "@gfxlabs/blue-sdk";
import { fetchVaultConfig } from "../fetch/index.js";

declare module "@gfxlabs/blue-sdk" {
  namespace VaultConfig {
    let fetch: typeof fetchVaultConfig;
  }
}

VaultConfig.fetch = fetchVaultConfig;

export { VaultConfig };
