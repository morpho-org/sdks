import { VaultMarketConfig } from "@morpho-org/blue-sdk";

import "./VaultMarketPublicAllocatorConfig";
import { fetchVaultMarketConfig } from "../fetch";

declare module "@morpho-org/blue-sdk" {
  namespace VaultMarketConfig {
    let fetch: typeof fetchVaultMarketConfig;
  }
}

VaultMarketConfig.fetch = fetchVaultMarketConfig;
