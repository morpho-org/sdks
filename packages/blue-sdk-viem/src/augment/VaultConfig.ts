import { VaultConfig } from "@morpho-org/blue-sdk";
import { fetchVaultConfig } from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  // biome-ignore lint/suspicious/noShadow: TODO rename to avoid shadowing
  namespace VaultConfig {
    let fetch: typeof fetchVaultConfig;
  }
}

VaultConfig.fetch = fetchVaultConfig;

export { VaultConfig };
