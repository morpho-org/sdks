import { MarketParams } from "@morpho-org/blue-sdk";
import { fetchMarketParams } from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  namespace MarketParams {
    let fetch: typeof fetchMarketParams;
  }
}

MarketParams.fetch = fetchMarketParams;

export { MarketParams };
