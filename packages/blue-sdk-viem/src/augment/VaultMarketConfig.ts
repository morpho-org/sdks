import { VaultMarketConfig } from "@gfxlabs/blue-sdk";

import { fetchVaultMarketConfig } from "../fetch/index.js";

declare module "@gfxlabs/blue-sdk" {
  namespace VaultMarketConfig {
    let fetch: typeof fetchVaultMarketConfig;
  }
}

VaultMarketConfig.fetch = fetchVaultMarketConfig;

export { VaultMarketConfig };
