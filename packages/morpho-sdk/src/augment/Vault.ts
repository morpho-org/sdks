import { Vault as BlueVault } from "@morpho-org/blue-sdk";
import { fetchVault } from "@morpho-org/blue-sdk-viem";

declare module "@morpho-org/blue-sdk" {
  namespace Vault {
    let fetch: typeof fetchVault;
  }
}

BlueVault.fetch = fetchVault;

export { BlueVault as Vault };
