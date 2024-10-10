import { VaultMarketAllocation } from "@morpho-org/blue-sdk";

import { fetchVaultMarketAllocation } from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  namespace VaultMarketAllocation {
    let fetch: typeof fetchVaultMarketAllocation;
  }
}

VaultMarketAllocation.fetch = fetchVaultMarketAllocation;

export { VaultMarketAllocation };
