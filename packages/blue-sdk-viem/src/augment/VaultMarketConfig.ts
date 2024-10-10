import { VaultMarketConfig } from "@morpho-org/blue-sdk";

import { fetchVaultMarketConfig } from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  namespace VaultMarketConfig {
    let fetch: typeof fetchVaultMarketConfig;
  }
}

VaultMarketConfig.fetch = fetchVaultMarketConfig;

export { VaultMarketConfig };
