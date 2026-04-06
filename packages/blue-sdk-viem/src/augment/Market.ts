import { Market } from "@gfxlabs/blue-sdk";
import { fetchMarket } from "../fetch/index.js";

declare module "@gfxlabs/blue-sdk" {
  namespace Market {
    let fetch: typeof fetchMarket;
  }
}

Market.fetch = fetchMarket;

export { Market };
