import { VaultMarketAllocation } from "@gfxlabs/blue-sdk";

import { fetchVaultMarketAllocation } from "../fetch/index.js";

declare module "@gfxlabs/blue-sdk" {
  namespace VaultMarketAllocation {
    let fetch: typeof fetchVaultMarketAllocation;
  }
}

VaultMarketAllocation.fetch = fetchVaultMarketAllocation;

export { VaultMarketAllocation };
