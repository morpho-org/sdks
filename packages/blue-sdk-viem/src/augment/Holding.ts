import { Holding } from "@morpho-org/blue-sdk";
import { fetchHolding } from "../fetch";

declare module "@morpho-org/blue-sdk" {
  namespace Holding {
    let fetch: typeof fetchHolding;
  }
}

Holding.fetch = fetchHolding;

export { Holding };
