import { MarketConfig } from "@morpho-org/blue-sdk";
import { fetchMarketConfig } from "../fetch";

declare module "@morpho-org/blue-sdk" {
  namespace MarketConfig {
    let fetch: typeof fetchMarketConfig;
  }
}

MarketConfig.fetch = fetchMarketConfig;
