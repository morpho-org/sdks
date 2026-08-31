import { VaultUser as BlueVaultUser } from "@morpho-org/blue-sdk";
import { fetchVaultUser } from "@morpho-org/blue-sdk-viem";

declare module "@morpho-org/blue-sdk" {
  namespace VaultUser {
    let fetch: typeof fetchVaultUser;
  }
}

BlueVaultUser.fetch = fetchVaultUser;

export { BlueVaultUser as VaultUser };
