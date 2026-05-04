import { Token } from "@morpho-org/blue-sdk";
import { fetchToken } from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  // biome-ignore lint/nursery/noShadow: TODO rename to avoid shadowing
  namespace Token {
    let fetch: typeof fetchToken;
  }
}

Token.fetch = fetchToken;

export { Token };
