import { AccrualVault, Vault } from "@morpho-org/blue-sdk";

import {
  fetchAccrualVault,
  fetchVault,
  fetchVaultFromConfig,
} from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  namespace Vault {
    let fetch: typeof fetchVault;
    let fetchFromConfig: typeof fetchVaultFromConfig;
  }

  namespace AccrualVault {
    let fetch: typeof fetchAccrualVault;
  }
}

Vault.fetch = fetchVault;
Vault.fetchFromConfig = fetchVaultFromConfig;
AccrualVault.fetch = fetchAccrualVault;

export { Vault, AccrualVault };
