import { VaultUser } from "@gfxlabs/blue-sdk";

import { fetchVaultUser } from "../fetch/index.js";

declare module "@gfxlabs/blue-sdk" {
  namespace VaultUser {
    let fetch: typeof fetchVaultUser;
  }
}

VaultUser.fetch = fetchVaultUser;
