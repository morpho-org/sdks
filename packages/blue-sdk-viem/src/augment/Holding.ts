import { Holding } from "@morpho-org/blue-sdk";
import { fetchHolding } from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  // biome-ignore lint/nursery/noShadow: TODO rename to avoid shadowing
  namespace Holding {
    let fetch: typeof fetchHolding;
  }
}

Holding.fetch = fetchHolding;

export { Holding };
