import { MarketParams } from "@gfxlabs/blue-sdk";
import { fetchMarketParams } from "../fetch/index.js";

declare module "@gfxlabs/blue-sdk" {
  namespace MarketParams {
    let fetch: typeof fetchMarketParams;
  }
}

MarketParams.fetch = fetchMarketParams;

export { MarketParams };
