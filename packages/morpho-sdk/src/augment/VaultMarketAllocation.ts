import { VaultMarketAllocation as BlueVaultMarketAllocation } from "@morpho-org/blue-sdk";
import { fetchVaultMarketAllocation } from "@morpho-org/blue-sdk-viem";

declare module "@morpho-org/blue-sdk" {
  namespace VaultMarketAllocation {
    let fetch: typeof fetchVaultMarketAllocation;
  }
}

BlueVaultMarketAllocation.fetch = fetchVaultMarketAllocation;

export { BlueVaultMarketAllocation as VaultMarketAllocation };
