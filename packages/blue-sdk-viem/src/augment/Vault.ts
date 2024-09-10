import { AccrualVault, Vault } from "@morpho-org/blue-sdk";

import { fetchAccrualVault, fetchVault } from "../fetch";

declare module "@morpho-org/blue-sdk" {
  namespace Vault {
    let fetch: typeof fetchVault;
  }

  namespace AccrualVault {
    let fetch: typeof fetchAccrualVault;
  }
}

Vault.fetch = fetchVault;
AccrualVault.fetch = fetchAccrualVault;
