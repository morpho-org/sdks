import { VaultMarketConfig } from "@morpho-org/blue-sdk";

import { fetchVaultMarketConfig } from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  // biome-ignore lint/suspicious/noShadow: TODO rename to avoid shadowing
  namespace VaultMarketConfig {
    let fetch: typeof fetchVaultMarketConfig;
  }
}

VaultMarketConfig.fetch = fetchVaultMarketConfig;

export { VaultMarketConfig };
