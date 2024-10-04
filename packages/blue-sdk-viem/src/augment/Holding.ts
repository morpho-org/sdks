import { Holding } from "@morpho-org/blue-sdk";
import { fetchHolding } from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  namespace Holding {
    let fetch: typeof fetchHolding;
  }
}

Holding.fetch = fetchHolding;

export { Holding };
