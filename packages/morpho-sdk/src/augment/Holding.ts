import { Holding as BlueHolding } from "@morpho-org/blue-sdk";
import { fetchHolding } from "@morpho-org/blue-sdk-viem";

declare module "@morpho-org/blue-sdk" {
  namespace Holding {
    let fetch: typeof fetchHolding;
  }
}

BlueHolding.fetch = fetchHolding;

export { BlueHolding as Holding };
