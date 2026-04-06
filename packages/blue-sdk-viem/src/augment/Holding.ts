import { Holding } from "@gfxlabs/blue-sdk";
import { fetchHolding } from "../fetch/index.js";

declare module "@gfxlabs/blue-sdk" {
  namespace Holding {
    let fetch: typeof fetchHolding;
  }
}

Holding.fetch = fetchHolding;

export { Holding };
