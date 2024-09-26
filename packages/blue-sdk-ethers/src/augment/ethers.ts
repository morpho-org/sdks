import { Address } from "@morpho-org/blue-sdk";

declare module "ethers" {
  interface Signer {
    getAddress(): Promise<Address>;
  }
}
