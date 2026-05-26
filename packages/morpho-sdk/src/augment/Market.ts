import { Market as BlueMarket } from "@morpho-org/blue-sdk";
import { fetchMarket } from "@morpho-org/blue-sdk-viem";

declare module "@morpho-org/blue-sdk" {
  namespace Market {
    let fetch: typeof fetchMarket;
  }
}

BlueMarket.fetch = fetchMarket;

export { BlueMarket as Market };
