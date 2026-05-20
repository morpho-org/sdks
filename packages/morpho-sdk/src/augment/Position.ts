import { Position as BluePosition } from "@morpho-org/blue-sdk";
import { fetchPosition } from "@morpho-org/blue-sdk-viem";

declare module "@morpho-org/blue-sdk" {
  namespace Position {
    let fetch: typeof fetchPosition;
  }
}

BluePosition.fetch = fetchPosition;

export { BluePosition as Position };
