import { MarketParams } from "@morpho-org/blue-sdk";
import { fetchMarketParams } from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  // biome-ignore lint/suspicious/noShadow: TODO rename to avoid shadowing
  namespace MarketParams {
    let fetch: typeof fetchMarketParams;
  }
}

MarketParams.fetch = fetchMarketParams;

export { MarketParams };
