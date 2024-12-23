import { VaultUser } from "@morpho-org/blue-sdk";

import { fetchVaultUser, fetchVaultUserFromConfig } from "../fetch";

declare module "@morpho-org/blue-sdk" {
  namespace VaultUser {
    let fetch: typeof fetchVaultUser;
    let fetchFromConfig: typeof fetchVaultUserFromConfig;
  }
}

VaultUser.fetch = fetchVaultUser;
VaultUser.fetchFromConfig = fetchVaultUserFromConfig;
