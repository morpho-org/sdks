import { VaultMarketAllocation } from "@morpho-org/blue-sdk";

import { fetchVaultMarketAllocation } from "../fetch";

declare module "@morpho-org/blue-sdk" {
  namespace VaultMarketAllocation {
    let fetch: typeof fetchVaultMarketAllocation;
  }
}

VaultMarketAllocation.fetch = fetchVaultMarketAllocation;
