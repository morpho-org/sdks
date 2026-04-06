import { AccrualVault, Vault } from "@gfxlabs/blue-sdk";

import { fetchAccrualVault, fetchVault } from "../fetch/index.js";

declare module "@gfxlabs/blue-sdk" {
  namespace Vault {
    let fetch: typeof fetchVault;
  }

  namespace AccrualVault {
    let fetch: typeof fetchAccrualVault;
  }
}

Vault.fetch = fetchVault;
AccrualVault.fetch = fetchAccrualVault;

export { Vault, AccrualVault };
