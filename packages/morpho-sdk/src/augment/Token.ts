import { Token as BlueToken } from "@morpho-org/blue-sdk";
import { fetchToken } from "@morpho-org/blue-sdk-viem";

declare module "@morpho-org/blue-sdk" {
  namespace Token {
    let fetch: typeof fetchToken;
  }
}

BlueToken.fetch = fetchToken;

export { BlueToken as Token };
