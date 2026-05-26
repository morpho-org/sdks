import { AccrualVault as BlueAccrualVault } from "@morpho-org/blue-sdk";
import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";

declare module "@morpho-org/blue-sdk" {
  namespace AccrualVault {
    let fetch: typeof fetchAccrualVault;
  }
}

BlueAccrualVault.fetch = fetchAccrualVault;

export { BlueAccrualVault as AccrualVault };
