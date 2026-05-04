import { VaultMarketAllocation } from "@morpho-org/blue-sdk";

import { fetchVaultMarketAllocation } from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  // biome-ignore lint/nursery/noShadow: TODO rename to avoid shadowing
  namespace VaultMarketAllocation {
    let fetch: typeof fetchVaultMarketAllocation;
  }
}

VaultMarketAllocation.fetch = fetchVaultMarketAllocation;

export { VaultMarketAllocation };
