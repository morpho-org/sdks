import { MarketParams as BlueMarketParams } from "@morpho-org/blue-sdk";
import { fetchMarketParams } from "@morpho-org/blue-sdk-viem";

declare module "@morpho-org/blue-sdk" {
  namespace MarketParams {
    let fetch: typeof fetchMarketParams;
  }
}

BlueMarketParams.fetch = fetchMarketParams;

export { BlueMarketParams as MarketParams };
