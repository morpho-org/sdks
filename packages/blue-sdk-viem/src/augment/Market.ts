import { Market } from "@morpho-org/blue-sdk";
import { fetchMarket } from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  // biome-ignore lint/nursery/noShadow: TODO rename to avoid shadowing
  namespace Market {
    let fetch: typeof fetchMarket;
  }
}

Market.fetch = fetchMarket;

export { Market };
