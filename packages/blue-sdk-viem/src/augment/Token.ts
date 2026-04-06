import { Token } from "@gfxlabs/blue-sdk";
import { fetchToken } from "../fetch/index.js";

declare module "@gfxlabs/blue-sdk" {
  namespace Token {
    let fetch: typeof fetchToken;
  }
}

Token.fetch = fetchToken;

export { Token };
