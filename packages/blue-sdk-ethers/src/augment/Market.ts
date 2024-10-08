import { Market } from "@morpho-org/blue-sdk";
import { fetchMarket, fetchMarketFromConfig } from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  namespace Market {
    let fetch: typeof fetchMarket;
    let fetchFromConfig: typeof fetchMarketFromConfig;
  }
}

Market.fetch = fetchMarket;
Market.fetchFromConfig = fetchMarketFromConfig;

export { Market };
