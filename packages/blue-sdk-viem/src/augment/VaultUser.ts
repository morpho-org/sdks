import { VaultUser } from "@morpho-org/blue-sdk";

import { fetchVaultUser } from "../fetch";

declare module "@morpho-org/blue-sdk" {
  namespace VaultUser {
    let fetch: typeof fetchVaultUser;
  }
}

VaultUser.fetch = fetchVaultUser;
