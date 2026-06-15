import { AccrualVault, Vault } from "@morpho-org/blue-sdk";

import { fetchAccrualVault, fetchVault } from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  // biome-ignore lint/suspicious/noShadow: TODO rename to avoid shadowing
  namespace Vault {
    let fetch: typeof fetchVault;
  }

  // biome-ignore lint/suspicious/noShadow: TODO rename to avoid shadowing
  namespace AccrualVault {
    let fetch: typeof fetchAccrualVault;
  }
}

Vault.fetch = fetchVault;
AccrualVault.fetch = fetchAccrualVault;

export { AccrualVault, Vault };
