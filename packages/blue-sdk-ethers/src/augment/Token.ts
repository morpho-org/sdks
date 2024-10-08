import { Token } from "@morpho-org/blue-sdk";
import { fetchToken } from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  namespace Token {
    let fetch: typeof fetchToken;
  }
}

Token.fetch = fetchToken;

export { Token };
